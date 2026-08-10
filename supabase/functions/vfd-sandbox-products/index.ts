import { createClient } from "npm:@supabase/supabase-js@2";
import { vfdFetch, getGatewayAccessToken } from "../_shared/vfd-gateway.ts";
import {
  billCategoryRequiresValidation,
  enforceBillCustomerValidation,
  type BillIdentity,
  type ValidationRecord,
} from "../_shared/bill-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing authorization header");

  const token = authHeader.replace("Bearer ", "").trim();
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!publishableKey) throw new Error("SUPABASE_ANON_KEY not configured");

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publishableKey, {
    global: { headers: { Authorization: authHeader! } },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) throw new Error("Invalid or expired token");
  return { id: userId };
}

// ─────────────────────────────────────────────────────────────
// SECURITY: object-level authorization helpers.
// Identity ALWAYS comes from the verified JWT (getUserFromRequest),
// never from a client-supplied user_id in the request body.
// ─────────────────────────────────────────────────────────────
function forbidden(msg = "Not authorized to access this resource") {
  return jsonResponse({ error: msg }, 403);
}

async function isGroupMember(groupId: string, userId: string) {
  if (!groupId || !userId) return false;
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_sandbox_group_members")
    .select("id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (data) return true;
  const { data: g } = await db.from("vfd_sandbox_groups")
    .select("id").eq("id", groupId).eq("creator_id", userId).maybeSingle();
  return !!g;
}

async function isGroupAdmin(groupId: string, userId: string) {
  if (!groupId || !userId) return false;
  const db = getSupabaseAdmin();
  const { data: g } = await db.from("vfd_sandbox_groups")
    .select("id").eq("id", groupId).eq("creator_id", userId).maybeSingle();
  if (g) return true;
  const { data: m } = await db.from("vfd_sandbox_group_members")
    .select("id, role").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  return !!m && ["admin", "creator", "owner"].includes(String((m as { role?: string }).role || ""));
}

async function isTargetMember(targetId: string, userId: string) {
  if (!targetId || !userId) return false;
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_sandbox_target_members")
    .select("id").eq("target_id", targetId).eq("user_id", userId).maybeSingle();
  if (data) return true;
  const { data: t } = await db.from("vfd_sandbox_targets")
    .select("id").eq("id", targetId).eq("creator_id", userId).maybeSingle();
  if (t) return true;
  const { data: inv } = await db.from("vfd_sandbox_target_invites")
    .select("id").eq("target_id", targetId).eq("invitee_id", userId).maybeSingle();
  return !!inv;
}

async function isPlatformAdmin(userId: string) {
  if (!userId) return false;
  const db = getSupabaseAdmin();
  const { data } = await db.rpc("is_any_admin", { _user_id: userId });
  return data === true;
}

function assertCronCaller(req: Request) {
  const secret = Deno.env.get("CRON_SECRET");
  const bearer = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  const provided = req.headers.get("x-cron-secret") || bearer;
  if (secret && provided === secret) return true;
  // pg_cron / internal schedulers authenticate with the service-role key.
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return !!serviceRole && bearer === serviceRole;
}

// pg_cron jobs authenticate with a token stored in internal_cron_tokens
// (service-role readable only) — never exposed to anon/authenticated clients.
async function assertCronToken(req: Request, name: string) {
  const provided = req.headers.get("x-cron-token") || "";
  if (!provided) return false;
  const db = getSupabaseAdmin();
  const { data } = await db.from("internal_cron_tokens").select("token").eq("name", name).maybeSingle();
  return !!data?.token && data.token === provided;
}


function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Fetch a map of user_id -> display name from profiles
async function fetchProfileNames(userIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const db = getSupabaseAdmin();
  const { data } = await db.from("profiles").select("id, full_name, username, email").in("id", ids);
  const map: Record<string, string> = {};
  (data || []).forEach((p: { id: string; full_name?: string | null; username?: string | null; email?: string | null }) => {
    map[p.id] = p.full_name || p.username || (p.email ? p.email.split("@")[0] : null) || `User ${p.id.slice(0, 6)}`;
  });
  ids.forEach(id => { if (!map[id]) map[id] = `User ${id.slice(0, 6)}`; });
  return map;
}

// Attach display_name to records that have a user_id field
function attachNames<T extends { user_id?: string | null }>(rows: T[] | null | undefined, names: Record<string, string>): (T & { display_name: string })[] {
  return (rows || []).map(r => ({ ...r, display_name: r.user_id ? (names[r.user_id] || `User ${r.user_id.slice(0, 6)}`) : "Unknown" }));
}

// =============================================
// VFD ADAPTER LAYER
// =============================================

async function fetchVfdLiveBalance(userId: string): Promise<{ ok: boolean; balance: number }> {
  const db = getSupabaseAdmin();
  const { data: client } = await db.from("vfd_sandbox_clients").select("vfd_account_number").eq("user_id", userId).maybeSingle();
  if (!client?.vfd_account_number) return { ok: false, balance: 0 };

  try {
    const vfdBase = Deno.env.get("VFD_API_BASE") ||
      ((Deno.env.get("VFD_MODE") || "sandbox").toLowerCase() === "production"
        ? "https://api-apps.vfdbank.systems"
        : "https://api-devapps.vfdbank.systems");
    let accessToken = await getGatewayAccessToken();

    if (!accessToken) {
      const consumerKey = Deno.env.get("VFD_CONSUMER_KEY");
      const consumerSecret = Deno.env.get("VFD_CONSUMER_SECRET");
      if (!consumerKey || !consumerSecret) return { ok: false, balance: 0 };

      const authResp = await fetchWithTimeout(`${vfdBase}/vfd-tech/baas-portal/v1.1/baasauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerKey, consumerSecret, validityTime: "-1" }),
      }, 10_000);
      const authRaw = await authResp.text();
      const authData = authRaw ? JSON.parse(authRaw) : {};
      accessToken = authData?.data?.access_token || null;
    }
    if (!accessToken) return { ok: false, balance: 0 };

    const balResp = await fetchWithTimeout(`${vfdBase}/vtech-wallet/api/v2/wallet2/account/enquiry?accountNumber=${client.vfd_account_number}`, {
      headers: { AccessToken: accessToken },
    }, 10_000);
    const balData = await balResp.json();
    const ok = String(balData?.status ?? "") === "00";
    if (!ok) {
      console.error("[VFD balance sync] enquiry not successful", balData?.status, balData?.message);
      return { ok: false, balance: 0 };
    }
    // VFD's account enquiry returns `accountBalance` (string). Older/other
    // endpoints use availableBalance / ledgerBalance. Accept all of them —
    // reading the wrong field yields 0 and blocks a funded customer.
    const inner = (balData?.data ?? {}) as Record<string, unknown>;
    const toNum = (v: unknown) => {
      const n = typeof v === "string" ? Number(v.replace(/,/g, "").trim()) : Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const candidates = [
      inner.availableBalance, inner.available_balance,
      inner.accountBalance, inner.account_balance,
      inner.ledgerBalance, inner.ledger_balance,
    ];
    const found = candidates.map(toNum).find((n) => n > 0);
    if (found === undefined && candidates.every((c) => c === undefined || c === null)) {
      console.error("[VFD balance sync] no balance field in enquiry payload", JSON.stringify(inner));
      return { ok: false, balance: 0 };
    }
    return { ok: true, balance: found ?? 0 };
  } catch (e) {
    console.error("[VFD balance sync error]", e);
    return { ok: false, balance: 0 };
  }
}

// =============================================
// INTERNAL LEDGER (Source of Truth)
// =============================================

// Cached balances may only be served for this long. Anything older is
// re-synced against VFD before it can authorise spending.
const BALANCE_CACHE_TTL_MS = 30_000;

async function ensureBalanceRow(userId: string, forceSync = false): Promise<{ total_balance: number; locked_balance: number; savings_balance: number }> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_user_balances").select("*").eq("user_id", userId).maybeSingle();

  const lastSynced = data?.last_synced_at ? new Date(data.last_synced_at as string).getTime() : 0;
  const isFresh = Number.isFinite(lastSynced) && Date.now() - lastSynced < BALANCE_CACHE_TTL_MS;

  if (data && !forceSync && isFresh) {
    return { total_balance: Number(data.total_balance), locked_balance: Number(data.locked_balance), savings_balance: Number(data.savings_balance) };
  }

  const live = await fetchVfdLiveBalance(userId);
  const locked = data ? Number(data.locked_balance) : 0;
  const savings = data ? Number(data.savings_balance) : 0;
  const existingTotal = data ? Number(data.total_balance) : 0;
  // The bank is the source of truth. When the live enquiry succeeds we take it
  // verbatim — Math.max(live, internal) let a stale/optimistic internal figure
  // authorise spending against money VFD does not actually hold, so real
  // transfers failed with "51 Insufficient Balance" after the customer had
  // already been told they could afford it. Only fall back to internal figures
  // when the enquiry itself failed.
  const totalBalance = live.ok
    ? live.balance
    : Math.max(existingTotal, locked + savings);

  await db.from("vfd_user_balances").upsert({
    user_id: userId, total_balance: totalBalance, locked_balance: locked, savings_balance: savings,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  return { total_balance: totalBalance, locked_balance: locked, savings_balance: savings };
}

async function getAvailableBalance(userId: string): Promise<number> {
  // Pre-debit affordability gate — always resolve against live bank truth.
  const bal = await ensureBalanceRow(userId, true);
  return bal.total_balance - bal.locked_balance - bal.savings_balance;
}


// `apply_balance_delta` row-locks vfd_user_balances and is now used ONLY to
// re-classify money already on the balance sheet between the spendable /
// locked / savings buckets (total_balance is never changed by these callers).
// Any movement that creates or destroys spendable balance must go through a
// ledger RPC instead — see the ledger* helpers below.


async function applyBalanceDelta(
  userId: string,
  deltas: { total?: number; locked?: number; savings?: number; requireAvailable?: number },
): Promise<{ ok: boolean; available: number; reason?: string }> {
  const db = getSupabaseAdmin();
  // Make sure the row exists and live VFD balance is synced before mutating.
  await ensureBalanceRow(userId);
  const { data, error } = await db.rpc("apply_balance_delta", {
    _user_id: userId,
    _total_delta: deltas.total ?? 0,
    _locked_delta: deltas.locked ?? 0,
    _savings_delta: deltas.savings ?? 0,
    _require_available: deltas.requireAvailable ?? null,
  });
  if (error) {
    console.error("[apply_balance_delta]", error);
    return { ok: false, available: 0, reason: error.message };
  }
  const result = data as { ok: boolean; available: number; reason?: string };
  return result;
}

async function debitForSavings(userId: string, amount: number): Promise<boolean> {
  // Move `amount` from total_balance into savings_balance while
  // requiring the available balance to cover it (atomic).
  const r = await applyBalanceDelta(userId, { savings: amount, requireAvailable: 0 });
  if (!r.ok) {
    // Try once more after force-syncing live VFD balance
    await ensureBalanceRow(userId, true);
    const r2 = await applyBalanceDelta(userId, { savings: amount, requireAvailable: 0 });
    return r2.ok;
  }
  return true;
}

async function creditFromSavings(userId: string, amount: number): Promise<void> {
  await applyBalanceDelta(userId, { savings: -amount });
}

/* ─────────────────────────────────────────────────────────────
   Ledger-backed wallet movement.

   `creditWallet` / `debitWallet` (cache-only writes through
   apply_balance_delta) have been RETIRED. Every movement of
   spendable balance now posts a double-entry transaction through
   vestara_post_transaction, which updates the displayed balance
   cache inside the same database transaction. There is no longer
   any route that can move a wallet balance without a ledger entry.
   ───────────────────────────────────────────────────────────── */

type LedgerResult = { success?: boolean; already?: boolean; error?: string } | null;

function ledgerOk(data: unknown, error: unknown): boolean {
  if (error) {
    console.error("[ledger] rpc error:", error);
    return false;
  }
  const r = data as LedgerResult;
  if (!r?.success) {
    console.error("[ledger] rpc rejected:", r?.error);
    return false;
  }
  return true;
}

/** Debit spendable wallet balance to the platform settlement account. */
async function ledgerDebitWallet(
  userId: string,
  amount: number,
  reference: string,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const db = getSupabaseAdmin();
  await ensureBalanceRow(userId);
  const { data, error } = await db.rpc("vestara_withdraw", {
    _user_id: userId, _amount: amount, _reference: reference, _metadata: metadata,
  });
  return ledgerOk(data, error);
}

/** SplitPay: move a participant's share from their wallet into the split holding account. */
async function ledgerSplitPay(
  userId: string, splitId: string, amount: number, reference: string, metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const db = getSupabaseAdmin();
  await ensureBalanceRow(userId);
  const { data, error } = await db.rpc("vestara_split_pay", {
    _user_id: userId, _split_id: splitId, _amount: amount, _reference: reference, _metadata: metadata,
  });
  return ledgerOk(data, error);
}

/** SplitPay: release a participant's share back to their wallet. */
async function ledgerSplitRefund(
  userId: string, splitId: string, amount: number, reference: string, metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("vestara_split_refund", {
    _user_id: userId, _split_id: splitId, _amount: amount, _reference: reference, _metadata: metadata,
  });
  return ledgerOk(data, error);
}

/** Goal Fund: move a contribution from the contributor's wallet into the campaign pool. */
async function ledgerCampaignContribute(
  userId: string, campaignId: string, amount: number, reference: string, metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const db = getSupabaseAdmin();
  await ensureBalanceRow(userId);
  const { data, error } = await db.rpc("vestara_campaign_contribute", {
    _user_id: userId, _campaign_id: campaignId, _amount: amount, _reference: reference, _metadata: metadata,
  });
  return ledgerOk(data, error);
}

/** Goal Fund: release campaign escrow to the campaign owner's wallet. */
async function ledgerCampaignWithdraw(
  userId: string, campaignId: string, amount: number, reference: string, metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("vestara_campaign_withdraw", {
    _user_id: userId, _campaign_id: campaignId, _amount: amount, _reference: reference, _metadata: metadata,
  });
  return ledgerOk(data, error);
}

/** Target Ajo: pay a member out of the group's thrift pool. */
async function ledgerTargetPayout(
  userId: string, groupId: string, amount: number, reference: string, metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("vestara_target_payout", {
    _user_id: userId, _group_id: groupId, _amount: amount, _reference: reference, _metadata: metadata,
  });
  return ledgerOk(data, error);
}


async function getVestaraWalletBalance(userId: string): Promise<number> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vestara_accounts")
    .select("balance")
    .eq("user_id", userId)
    .eq("account_type", "wallet")
    .maybeSingle();
  return Number(data?.balance || 0);
}

async function debitVestaraForThrift(userId: string, groupId: string, amount: number, reference: string, metadata: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("vestara_thrift_contribute", {
    _user_id: userId,
    _group_id: groupId,
    _amount: amount,
    _reference: reference,
    _metadata: metadata,
  });
  if (error) {
    console.error("[vestara_thrift_contribute]", error);
    return { success: false, error: error.message };
  }
  return (data || { success: false, error: "Contribution debit failed" }) as { success?: boolean; error?: string };
}

async function creditVestaraThriftPayout(recipientId: string, groupId: string, grossAmount: number, fee: number, reference: string, metadata: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("vestara_thrift_payout", {
    _beneficiary_id: recipientId,
    _group_id: groupId,
    _gross_amount: grossAmount,
    _fee: fee,
    _reference: reference,
    _metadata: metadata,
  });
  if (error) {
    console.error("[vestara_thrift_payout]", error);
    return { success: false, error: error.message };
  }
  return (data || { success: false, error: "Payout credit failed" }) as { success?: boolean; error?: string };
}

// =============================================
// HELPER: Chat & Notifications
// =============================================

async function postChatMessage(groupId: string, userId: string, message: string, messageType = "system") {
  const db = getSupabaseAdmin();
  await db.from("vfd_sandbox_chat_messages").insert({ group_id: groupId, user_id: userId, message, message_type: messageType });
}

async function sendNotification(userId: string, title: string, message: string, notificationType: string, groupId?: string) {
  const db = getSupabaseAdmin();
  await db.from("vfd_sandbox_notifications").insert({ user_id: userId, title, message, notification_type: notificationType, group_id: groupId || null });
}

// =============================================
// PLATFORM FEE (Production Parity)
// Tiered: ₦100 flat for <₦20k, 1% (max ₦500) for ₦20k+
// =============================================

function calculatePlatformFee(grossAmount: number): number {
  if (grossAmount < 20000) return 100;
  return Math.min(Math.round(grossAmount * 0.01 * 100) / 100, 500);
}

// =============================================
// FISHER-YATES RANDOMIZATION (matches production)
// =============================================

function fisherYatesShuffle(arr: string[]): string[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// =============================================
// THRIFT GROUPS (AJO) — PRODUCTION-PARITY LOGIC
// =============================================

async function handleCreateGroup(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();

  // Sandbox: no group limit (testing environment)

  const name = body.name as string;
  const amount = Number(body.contribution_amount);
  const maxMembers = Number(body.max_members) || 5;
  const period = (body.period as string) || "monthly";
  const description = (body.description as string) || null;
  const autoDebit = body.auto_debit !== false;
  const fundingModeRaw = (body.funding_mode as string) || "wallet";
  const fundingMode = fundingModeRaw === "ddm" ? "ddm" : "wallet";
  const contributionHour = Number(body.contribution_hour) || 16;
  const contributionMinute = Number(body.contribution_minute) || 0;
  const contributionDayOfWeek = Number(body.contribution_day_of_week) || 1;
  const contributionDayOfMonth = Number(body.contribution_day_of_month) || 1;

  if (!name || !amount || amount <= 0) return jsonResponse({ error: "Name and contribution amount required" }, 400);
  if (maxMembers < 3 || maxMembers > 20) return jsonResponse({ error: "Members must be between 3 and 20" }, 400);
  if (amount < 5000 || amount > 500000) return jsonResponse({ error: "Contribution must be between ₦5,000 and ₦500,000" }, 400);

  // Group-level mandate is "pending" until ALL members individually authorize
  // their own DDM mandate (which costs a ₦100 setup fee per member). It flips
  // to "authorized" automatically inside handleAcceptGroupMandate once every
  // active member has signed.
  const mandateStatus = fundingMode === "ddm" ? "pending" : "not_required";

  const { data: group, error } = await db.from("vfd_sandbox_groups").insert({
    name, admin_id: userId, contribution_amount: amount,
    period, max_members: maxMembers, total_cycles: maxMembers,
    status: "pending",
    description, auto_debit: autoDebit,
    funding_mode: fundingMode,
    mandate_status: mandateStatus,
    contribution_hour: contributionHour, contribution_minute: contributionMinute,
    contribution_day_of_week: contributionDayOfWeek,
    contribution_day_of_month: contributionDayOfMonth,
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);

  if (fundingMode === "ddm") {
    const ref = `VES-DDM-AJO-${group.id}`;
    await db.from("vfd_sandbox_groups").update({ mandate_reference: ref }).eq("id", group.id);
    group.mandate_reference = ref;
  }

  // Admin is the first member. For DDM groups they must still accept the
  // mandate (₦100 fee) themselves — flagged via mandate_status="pending".
  await db.from("vfd_sandbox_group_members").insert({
    group_id: group.id, user_id: userId, status: "active",
    mandate_status: fundingMode === "ddm" ? "pending" : "not_required",
  });

  const fundingNote = fundingMode === "ddm"
    ? "Group created with DDM funding. Each member (including the admin) must accept the Direct Debit Mandate (₦100 one-time setup fee) before contributions can run."
    : "Group created. Waiting for members to join.";
  await postChatMessage(group.id, userId, fundingNote, "system");

  return jsonResponse({ data: group });
}

async function handleListGroups(userId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_sandbox_groups")
    .select("*, vfd_sandbox_group_members(user_id, status, payout_position, has_contributed_current, has_received_payout, mandate_status, mandate_reference)")
    .order("created_at", { ascending: false });
  return jsonResponse({ data });
}

// SWAP_WINDOW_MS: time members have to swap positions after the group fills
// up but before contributions automatically begin.
const SWAP_WINDOW_MS = 3 * 60 * 1000;

// Internal helper used both when a member joins normally AND after they accept
// an invite. When the group reaches max_members it:
//  1. Randomizes payout positions (Fisher-Yates)
//  2. Saves payout_order on the group
//  3. Sets status="swap_window" with swap_window_ends_at = now + 3 min
//  4. Notifies every member of their assigned position
// The cycle itself is NOT created yet — that happens when the swap window
// elapses (handleAutoStartPendingGroups) so swaps remain valid until then.
async function maybeEnterSwapWindow(
  db: ReturnType<typeof createClient>,
  groupId: string,
) {
  const { data: group } = await db.from("vfd_sandbox_groups")
    .select("*").eq("id", groupId).single();
  if (!group) return;
  if (group.status !== "pending") return;
  if (group.member_count < group.max_members) return;

  const { data: members } = await db.from("vfd_sandbox_group_members")
    .select("user_id").eq("group_id", groupId).eq("status", "active");
  if (!members || members.length !== group.max_members) return;

  const memberIds = members.map((m: { user_id: string }) => m.user_id);
  const payoutOrder = fisherYatesShuffle(memberIds);

  for (let i = 0; i < payoutOrder.length; i++) {
    await db.from("vfd_sandbox_group_members").update({
      payout_position: i + 1,
      has_used_swap: false,
      has_contributed_current: false,
      has_received_payout: false,
    }).eq("group_id", groupId).eq("user_id", payoutOrder[i]);
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + SWAP_WINDOW_MS);

  await db.from("vfd_sandbox_groups").update({
    status: "swap_window",
    payout_order: payoutOrder,
    is_full_at: now.toISOString(),
    swap_window_ends_at: windowEnd.toISOString(),
    current_payout_position: 1,
    updated_at: now.toISOString(),
  }).eq("id", groupId);

  await postChatMessage(groupId, group.admin_id,
    `🎲 Group is full! Payout positions randomized. You have 3 minutes to request a position swap before the thrift starts.`,
    "system");

  for (let i = 0; i < payoutOrder.length; i++) {
    await sendNotification(payoutOrder[i], "Group is Full!",
      `${group.name} is full. Your payout position is #${i + 1} of ${group.max_members}. You have 3 minutes to swap with another member.`,
      "swap_window_open", groupId);
  }
}

async function handleJoinGroup(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;

  const { data: existing } = await db.from("vfd_sandbox_group_members")
    .select("id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (existing) return jsonResponse({ data: { joined: true, message: "Already a member" } });

  // Sandbox: no group limit (testing environment)

  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  // Reject if group is past the joining phase
  if (group.status === "completed") return jsonResponse({ error: "Group has already completed" }, 400);
  if (group.status === "active") return jsonResponse({ error: "Group has already started" }, 400);
  if (group.status === "swap_window") return jsonResponse({ error: "Group is full and waiting to start" }, 400);
  if (group.member_count >= group.max_members) return jsonResponse({ error: "Group is full" }, 400);

  // Prevent duplicate membership
  const { data: existingMember } = await db.from("vfd_sandbox_group_members")
    .select("id, status").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (existingMember && existingMember.status === "active") {
    return jsonResponse({ error: "You are already a member of this group" }, 400);
  }

  const newCount = group.member_count + 1;
  const isDdmGroup = (group.funding_mode as string) === "ddm";
  const { error } = await db.from("vfd_sandbox_group_members").insert({
    group_id: groupId, user_id: userId, status: "active",
    // For DDM groups every joiner — creator, invitee, link-joiner — defaults to
    // the direct-debit contribution method so the commencement gate and cycle
    // debits treat them uniformly. They flip to "wallet" only if they later
    // opt out of DDM (not currently exposed in sandbox).
    contribution_method: isDdmGroup ? "direct_debit" : "wallet",
    mandate_status: isDdmGroup ? "pending" : "not_required",
  });

  if (error) return jsonResponse({ error: error.message }, 500);

  if (isDdmGroup) {
    await sendNotification(
      userId,
      "Authorize Direct Debit Mandate",
      `You joined ${group.name}. A ₦100 one-time mandate setup fee is required to authorize automatic bank debits for cycle contributions.`,
      "ddm_mandate_required",
      groupId,
    );
  }

  await db.from("vfd_sandbox_groups").update({
    member_count: newCount, updated_at: new Date().toISOString(),
  }).eq("id", groupId);

  await postChatMessage(groupId, userId, "has joined the group", "member_join");
  await sendNotification(group.admin_id, "New Member", `A new member has joined ${group.name} (${newCount}/${group.max_members})`, "member_joined", groupId);

  // If this join filled the group, automatically randomize payout positions
  // and start the 3-minute swap window. No admin action required.
  if (newCount >= group.max_members) {
    await maybeEnterSwapWindow(db, groupId);
  }

  return jsonResponse({ data: { joined: true, member_count: newCount, max_members: group.max_members, is_full: newCount >= group.max_members } });
}

async function handleCommenceGroup(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;

  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  if (group.admin_id !== userId) return jsonResponse({ error: "Only the admin can commence the group" }, 403);
  if (group.status !== "pending") return jsonResponse({ error: "Group has already commenced" }, 400);
  if (group.member_count < group.max_members) return jsonResponse({ error: `Group must have ${group.max_members} members to commence` }, 400);

  const { data: members } = await db.from("vfd_sandbox_group_members")
    .select("user_id").eq("group_id", groupId).eq("status", "active");

  if (!members || members.length !== group.max_members) {
    return jsonResponse({ error: "Member count mismatch" }, 400);
  }

  // ---------------------------------------------------------------------------
  // DDM Commencement Gate: every member must be either wallet-funded OR have an
  // active (bank-authorized) Direct Debit Mandate. Spec §8.
  // ---------------------------------------------------------------------------
  {
    const { data: mandateCheck } = await db.from("vfd_sandbox_group_members")
      .select("user_id, contribution_method, mandate_status")
      .eq("group_id", groupId).eq("status", "active");
    const blocking = (mandateCheck || []).filter((m: any) =>
      m.contribution_method === "direct_debit" && m.mandate_status !== "authorized");
    if (blocking.length > 0) {
      return jsonResponse({
        error: `${blocking.length} member(s) have a Direct Debit Mandate that is not yet bank-authorized. The group cannot commence until every DDM mandate is active.`,
        code: "MANDATES_NOT_ACTIVE",
        pending_user_ids: blocking.map((m: any) => m.user_id),
      }, 400);
    }
  }


  const memberIds = members.map(m => m.user_id);
  const payoutOrder = fisherYatesShuffle(memberIds);

  for (let i = 0; i < payoutOrder.length; i++) {
    await db.from("vfd_sandbox_group_members").update({
      payout_position: i + 1,
    }).eq("group_id", groupId).eq("user_id", payoutOrder[i]);
  }

  const { data: cycle } = await db.from("vfd_sandbox_contribution_cycles").insert({
    group_id: groupId, cycle_number: 1, status: "active",
    payout_recipient_id: payoutOrder[0],
  }).select().single();

  await db.from("vfd_sandbox_groups").update({
    status: "active", current_cycle: 1, payout_order: payoutOrder,
    current_payout_position: 1,
    commenced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", groupId);

  await postChatMessage(groupId, userId, "🎉 Group has commenced! Payout positions have been randomized. Cycle 1 is now active.", "system");

  for (let i = 0; i < payoutOrder.length; i++) {
    await sendNotification(payoutOrder[i], "Group Commenced",
      `${group.name} has started! Your payout position is #${i + 1} of ${group.max_members}.`,
      "group_commenced", groupId);
  }

  return jsonResponse({ data: { commenced: true, payout_order: payoutOrder, cycle_id: cycle?.id } });
}

// POSITION SWAP (matches production: one swap per member, no swap after payout, no swap after contribution in current cycle)
async function handleRequestSwap(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  const targetId = body.target_id as string;

  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  if (group.status !== "active" && group.status !== "swap_window") {
    return jsonResponse({ error: "Group is not in a swap-eligible state" }, 400);
  }
  // If we're past the swap window, no more swap requests allowed
  if (group.status === "swap_window" && group.swap_window_ends_at && new Date(group.swap_window_ends_at) <= new Date()) {
    return jsonResponse({ error: "Swap window has closed" }, 400);
  }

  const { data: requester } = await db.from("vfd_sandbox_group_members")
    .select("*").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (!requester) return jsonResponse({ error: "Not a member", data: null });
  if (requester.has_used_swap) return jsonResponse({ error: "You have already used your swap for this group" }, 400);
  if (requester.has_received_payout) return jsonResponse({ error: "Cannot swap after receiving payout" }, 400);

  // Only check contributions when an actual cycle is running.
  if (group.status === "active") {
    const { count: contribCount } = await db.from("vfd_sandbox_group_contributions")
      .select("*", { count: "exact", head: true })
      .eq("group_id", groupId).eq("cycle_number", group.current_cycle);
    if (contribCount && contribCount > 0) return jsonResponse({ error: "Cannot swap after contributions have started for this cycle" }, 400);
  }

  const { data: target } = await db.from("vfd_sandbox_group_members")
    .select("*").eq("group_id", groupId).eq("user_id", targetId).maybeSingle();
  if (!target) return jsonResponse({ error: "Target is not a member" }, 400);
  if (target.has_received_payout) return jsonResponse({ error: "Target has already received payout" }, 400);

  const { data: existing } = await db.from("vfd_sandbox_position_swaps")
    .select("id").eq("group_id", groupId).eq("requester_id", userId).eq("status", "pending").maybeSingle();
  if (existing) return jsonResponse({ error: "You already have a pending swap request", data: null });

  const { data: swap, error } = await db.from("vfd_sandbox_position_swaps").insert({
    group_id: groupId, requester_id: userId, target_id: targetId,
    requester_position: requester.payout_position, target_position: target.payout_position,
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);

  await sendNotification(targetId, "Swap Request",
    `A member wants to swap payout position #${requester.payout_position} with your position #${target.payout_position}.`,
    "swap_request", groupId);

  return jsonResponse({ data: swap });
}

async function handleRespondSwap(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const swapId = body.swap_id as string;
  const accept = body.accept as boolean;

  const { data: swap } = await db.from("vfd_sandbox_position_swaps").select("*").eq("id", swapId).single();
  if (!swap) return jsonResponse({ error: "Swap not found" }, 404);
  if (swap.target_id !== userId) return jsonResponse({ error: "Not authorized" }, 403);
  if (swap.status !== "pending") return jsonResponse({ error: "Swap is no longer pending" }, 400);

  if (accept) {
    await db.from("vfd_sandbox_group_members").update({ payout_position: swap.target_position })
      .eq("group_id", swap.group_id).eq("user_id", swap.requester_id);
    await db.from("vfd_sandbox_group_members").update({ payout_position: swap.requester_position })
      .eq("group_id", swap.group_id).eq("user_id", swap.target_id);

    await db.from("vfd_sandbox_group_members").update({ has_used_swap: true })
      .eq("group_id", swap.group_id).eq("user_id", swap.requester_id);

    const { data: group } = await db.from("vfd_sandbox_groups").select("payout_order").eq("id", swap.group_id).single();
    if (group?.payout_order) {
      const newOrder = [...group.payout_order];
      const reqIdx = newOrder.indexOf(swap.requester_id);
      const tgtIdx = newOrder.indexOf(swap.target_id);
      if (reqIdx >= 0 && tgtIdx >= 0) {
        [newOrder[reqIdx], newOrder[tgtIdx]] = [newOrder[tgtIdx], newOrder[reqIdx]];
        await db.from("vfd_sandbox_groups").update({ payout_order: newOrder }).eq("id", swap.group_id);
      }
    }

    await postChatMessage(swap.group_id, userId, `Position swap accepted: positions #${swap.requester_position} and #${swap.target_position} have been swapped.`, "system");
  }

  await db.from("vfd_sandbox_position_swaps").update({
    status: accept ? "accepted" : "declined",
    responded_at: new Date().toISOString(),
  }).eq("id", swapId);

  await sendNotification(swap.requester_id, accept ? "Swap Accepted" : "Swap Declined",
    accept ? `Your swap request was accepted. You are now in position #${swap.target_position}.` : "Your swap request was declined.",
    accept ? "swap_accepted" : "swap_declined", swap.group_id);

  return jsonResponse({ data: { status: accept ? "accepted" : "declined" } });
}

// CONTRIBUTE (matches production: wallet debit → audit → chat → notification → auto-payout)
async function handleContributeGroup(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;

  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  if (group.status !== "active") return jsonResponse({ error: "Group is not active" }, 400);

  // Auto-enroll the group admin if missing (legacy groups)
  const { data: existingMember } = await db.from("vfd_sandbox_group_members")
    .select("id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (!existingMember && group.admin_id === userId) {
    await db.from("vfd_sandbox_group_members").insert({
      group_id: groupId, user_id: userId, status: "active",
    });
  }

  const { data: activeCycles } = await db.from("vfd_sandbox_contribution_cycles")
    .select("*").eq("group_id", groupId).eq("status", "active")
    .order("created_at", { ascending: true }).limit(1);
  const activeCycle = activeCycles?.[0];
  if (!activeCycle) return jsonResponse({ error: "No active contribution cycle" }, 400);

  // Idempotency
  const { data: existingContrib } = await db.from("vfd_sandbox_group_contributions")
    .select("id").eq("group_id", groupId).eq("user_id", userId).eq("cycle_number", group.current_cycle).maybeSingle();
  if (existingContrib) return jsonResponse({ error: "Already contributed this cycle" }, 400);

  const amount = Number(group.contribution_amount);

  // Per-member contribution method (admin-assigned). Falls back to the
  // group-level funding_mode for legacy members with no explicit method.
  const { data: myMember } = await db.from("vfd_sandbox_group_members")
    .select("id, user_id, contribution_method, mandate_status, mandate_code, mandate_reference")
    .eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  const groupFundingMode = (group.funding_mode as string) || "wallet";
  const memberMethod = (myMember?.contribution_method as string) || (groupFundingMode === "ddm" ? "direct_debit" : "wallet");
  const isDdm = memberMethod === "direct_debit";

  if (isDdm) {
    if (!myMember || myMember.mandate_status !== "authorized") {
      return jsonResponse({
        error: "Your Direct Debit Mandate is not authorized yet. Please accept the mandate (₦100 setup fee) to enable automatic bank debits.",
        code: "MANDATE_NOT_AUTHORIZED",
      }, 400);
    }
    // Trigger the actual VFD mandate debit — funds pull from member's bank
    // via NIBSS into the Vestara corporate pool.
    const ddm = await performMandateDebitForMember(group, myMember, Number(group.current_cycle));
    if (!ddm.success) {
      return jsonResponse({
        error: ddm.error || "Direct debit could not be collected. Please try again or contact support.",
        code: (ddm.details as any)?.code === "MANDATE_NOT_ACTIVE" ? "MANDATE_NOT_AUTHORIZED" : "MANDATE_DEBIT_FAILED",
        details: ddm.details,
      }, 502);
    }
  } else {
    const reference = `ajo-manual-${groupId}-${activeCycle.id}-${userId}`;
    const debit = await debitVestaraForThrift(userId, groupId, amount, reference, {
      cycle_id: activeCycle.id,
      cycle_number: group.current_cycle,
      source: "vfd_sandbox_ajo",
    });
    if (!debit.success) {
      const available = await getVestaraWalletBalance(userId);
      const rawErr = (debit.error || "").toString();
      const isInsufficient = available < amount || /insufficient/i.test(rawErr);
      if (isInsufficient) {
        const shortfall = Math.max(0, amount - available);
        return jsonResponse({
          error: `Insufficient wallet balance. You need ₦${amount.toLocaleString()} but have ₦${available.toLocaleString()} available. Please fund your wallet with at least ₦${shortfall.toLocaleString()}.`,
          code: "INSUFFICIENT_BALANCE",
          required: amount,
          available,
          shortfall,
        }, 400);
      }
      console.error(`[handleContributeGroup] debit failed group=${groupId} user=${userId} amount=${amount} available=${available} err=${rawErr}`);
      return jsonResponse({
        error: rawErr || "Contribution failed. Please try again.",
        code: "CONTRIBUTION_FAILED",
        required: amount,
        available,
      }, 400);
    }
  }


  await db.from("vfd_sandbox_group_contributions").insert({
    group_id: groupId, user_id: userId, cycle_number: group.current_cycle, amount,
  });

  await db.from("vfd_sandbox_contribution_audit").insert({
    user_id: userId, group_id: groupId, cycle_id: activeCycle.id,
    amount, contribution_type: isDdm ? "ddm" : "manual", status: "success",
  });

  await db.from("vfd_sandbox_group_members").update({ has_contributed_current: true })
    .eq("group_id", groupId).eq("user_id", userId);

  const chatMsg = isDdm
    ? `Direct debit of ₦${amount.toLocaleString()} collected (DDM) for cycle ${group.current_cycle}`
    : `has contributed ₦${amount.toLocaleString()} to the pool`;
  await postChatMessage(groupId, userId, chatMsg, "contribution_status");
  await sendNotification(userId, "Contribution Successful",
    isDdm
      ? `Your bank was debited ₦${amount.toLocaleString()} via DDM for ${group.name}.`
      : `Your contribution of ₦${amount.toLocaleString()} has been recorded.`,
    "contribution_success", groupId);

  const { count } = await db.from("vfd_sandbox_group_contributions")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId).eq("cycle_number", group.current_cycle);

  let allContributed = false;
  let payoutResult = null;

  if (count && count >= group.member_count) {
    allContributed = true;
    payoutResult = await processAutoPayout(db, group, activeCycle);
  }

  return jsonResponse({
    data: {
      success: true, contributed: true, amount,
      cycle: group.current_cycle, payment_source: isDdm ? "ddm" : "wallet",
      all_contributed: allContributed, auto_payout: payoutResult,
      message: allContributed ? "All members have contributed!" : "Contribution recorded successfully",
    },
  });
}

// AUTO-PAYOUT (Production parity: tiered fee, credit recipient wallet, advance cycle)
async function processAutoPayout(
  db: ReturnType<typeof createClient>,
  group: Record<string, unknown>,
  activeCycle: Record<string, unknown>
) {
  const groupId = group.id as string;
  const currentCycle = Number(group.current_cycle);
  const amount = Number(group.contribution_amount);
  const memberCount = Number(group.member_count);
  const totalCycles = Number(group.total_cycles);
  const payoutOrder = group.payout_order as string[];

  const recipientId = payoutOrder[currentCycle - 1];
  if (!recipientId) return { success: false, error: "No recipient for this cycle" };

  const grossAmount = amount * memberCount;
  // PRODUCTION PARITY: Tiered fee structure
  const platformFee = calculatePlatformFee(grossAmount);
  const netAmount = grossAmount - platformFee;

  const payout = await creditVestaraThriftPayout(recipientId, groupId, grossAmount, platformFee, `ajo-payout-${groupId}-${activeCycle.id}`, {
    cycle_id: activeCycle.id,
    cycle_number: currentCycle,
    source: "vfd_sandbox_ajo",
  });
  if (!payout.success) {
    const err = payout.error || "Payout failed";
    console.error(`[processAutoPayout] group=${groupId} cycle=${currentCycle} failed:`, err);
    await postChatMessage(groupId, recipientId,
      `⚠️ Auto-payout for cycle ${currentCycle} failed: ${err}. Admin will retry.`, "contribution_failed");
    await sendNotification(recipientId, "Payout Pending",
      `Your payout for ${group.name} cycle ${currentCycle} could not be processed (${err}). Our team has been alerted.`,
      "payout_notification", groupId);
    return { success: false, error: err };
  }

  await db.from("vfd_sandbox_group_payouts").insert({
    group_id: groupId, recipient_id: recipientId,
    cycle_number: currentCycle, gross_amount: grossAmount,
    platform_fee: platformFee, net_amount: netAmount,
  });

  await db.from("vfd_sandbox_contribution_cycles").update({
    status: "completed", payout_recipient_id: recipientId,
    payout_amount: netAmount, platform_fee: platformFee,
    total_contributions: grossAmount, completed_at: new Date().toISOString(),
  }).eq("id", activeCycle.id as string);

  await db.from("vfd_sandbox_group_members").update({ has_received_payout: true })
    .eq("group_id", groupId).eq("user_id", recipientId);

  const nextCycle = currentCycle + 1;
  if (nextCycle > totalCycles) {
    await db.from("vfd_sandbox_groups").update({
      status: "completed", updated_at: new Date().toISOString(),
    }).eq("id", groupId);

    await postChatMessage(groupId, recipientId,
      `🎉 Group completed! Final payout of ₦${netAmount.toLocaleString()} sent (fee: ₦${platformFee.toLocaleString()}).`, "payout_notification");
  } else {
    const nextRecipientId = payoutOrder[nextCycle - 1];
    await db.from("vfd_sandbox_contribution_cycles").insert({
      group_id: groupId, cycle_number: nextCycle, status: "active",
      payout_recipient_id: nextRecipientId,
    });

    await db.from("vfd_sandbox_groups").update({
      current_cycle: nextCycle, updated_at: new Date().toISOString(),
    }).eq("id", groupId);

    // Reset contribution flags
    await db.from("vfd_sandbox_group_members").update({ has_contributed_current: false }).eq("group_id", groupId);

    await postChatMessage(groupId, recipientId,
      `🎉 Cycle ${currentCycle} complete! Payout of ₦${netAmount.toLocaleString()} sent (fee: ₦${platformFee.toLocaleString()}). Cycle ${nextCycle} begins now.`, "payout_notification");
  }

  await sendNotification(recipientId, "Payout Received!",
    `You received ₦${netAmount.toLocaleString()} from your thrift group ${group.name}. Platform fee: ₦${platformFee.toLocaleString()}.`,
    "payout_received", groupId);

  return { success: true, recipient_id: recipientId, net_amount: netAmount, platform_fee: platformFee };
}

async function handleGetGroupDetail(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  if (!groupId) return jsonResponse({ error: "group_id required" }, 400);
  if (!(await isGroupMember(groupId, userId)) && !(await isPlatformAdmin(userId))) return forbidden();
  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  const { data: members } = await db.from("vfd_sandbox_group_members").select("*").eq("group_id", groupId).order("payout_position");
  const { data: contributions } = await db.from("vfd_sandbox_group_contributions").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(50);
  const { data: payouts } = await db.from("vfd_sandbox_group_payouts").select("*").eq("group_id", groupId).order("created_at", { ascending: false });
  const { data: cycles } = await db.from("vfd_sandbox_contribution_cycles").select("*").eq("group_id", groupId).order("cycle_number");
  const { data: swaps } = await db.from("vfd_sandbox_position_swaps").select("*").eq("group_id", groupId).order("created_at", { ascending: false });
  const { data: chat } = await db.from("vfd_sandbox_chat_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(50);

  const nameMap = await fetchProfileNames([
    ...(members || []).map((m: { user_id: string }) => m.user_id),
    ...(contributions || []).map((c: { user_id: string }) => c.user_id),
    ...(payouts || []).map((p: { recipient_id?: string }) => p.recipient_id || ""),
    ...(group?.payout_order || []) as string[],
  ]);

  return jsonResponse({
    data: {
      group,
      members: attachNames(members, nameMap),
      contributions: attachNames(contributions, nameMap),
      payouts: (payouts || []).map((p: { recipient_id?: string }) => ({ ...p, display_name: p.recipient_id ? (nameMap[p.recipient_id] || `User ${p.recipient_id.slice(0, 6)}`) : "Unknown" })),
      cycles,
      swaps,
      chat: attachNames(chat, nameMap),
      payout_order_names: (group?.payout_order || []).map((uid: string) => nameMap[uid] || `User ${uid.slice(0, 6)}`),
    },
  });
}

// GROUP LIFECYCLE: Exit
async function handleExitGroup(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;

  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  if (group.status !== "completed") return jsonResponse({ error: "Can only exit completed groups" }, 400);

  const { data: membership } = await db.from("vfd_sandbox_group_members")
    .select("*").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (!membership) return jsonResponse({ error: "Not a member", data: null });

  await db.from("vfd_sandbox_group_members").update({ status: "exited" })
    .eq("group_id", groupId).eq("user_id", userId);

  await db.from("vfd_sandbox_groups").update({
    member_count: Math.max(0, group.member_count - 1),
    updated_at: new Date().toISOString(),
  }).eq("id", groupId);

  await postChatMessage(groupId, userId, "has exited the group", "system");

  return jsonResponse({ data: { success: true } });
}

// GROUP LIFECYCLE: Confirm continue
async function handleConfirmContinue(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;

  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  if (group.status !== "completed") return jsonResponse({ error: "Group is not completed" }, 400);

  const { data: membership } = await db.from("vfd_sandbox_group_members")
    .select("*").eq("group_id", groupId).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!membership) return jsonResponse({ error: "Not an active member" }, 400);

  const { error: updateError } = await db.from("vfd_sandbox_group_members")
    .update({ wants_continue: true, continue_confirmed_at: new Date().toISOString() })
    .eq("id", membership.id);
  if (updateError) return jsonResponse({ error: updateError.message }, 500);

  return jsonResponse({ data: { success: true, confirmed: true } });
}

// GROUP LIFECYCLE: Restart
async function handleRestartGroup(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;

  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  if (group.admin_id !== userId) return jsonResponse({ error: "Only the admin can restart" }, 403);
  if (group.status !== "completed") return jsonResponse({ error: "Only completed groups can restart" }, 400);

  if (!body.terms_accepted) return jsonResponse({ error: "You must accept the terms and conditions" }, 400);

  const { data: activeMembers } = await db.from("vfd_sandbox_group_members")
    .select("user_id").eq("group_id", groupId).eq("status", "active");

  if (!activeMembers || activeMembers.length < 2) {
    return jsonResponse({ error: `Need at least 2 active members to restart (currently ${activeMembers?.length || 0}). Invite new members first.` }, 400);
  }

  const memberIds = activeMembers.map(m => m.user_id);
  const newPayoutOrder = fisherYatesShuffle(memberIds);

  for (let i = 0; i < newPayoutOrder.length; i++) {
    await db.from("vfd_sandbox_group_members").update({
      payout_position: i + 1, has_contributed_current: false,
      has_received_payout: false, has_used_swap: false,
    }).eq("group_id", groupId).eq("user_id", newPayoutOrder[i]);
  }

  await db.from("vfd_sandbox_contribution_cycles").insert({
    group_id: groupId, cycle_number: 1, status: "active",
    payout_recipient_id: newPayoutOrder[0],
  });

  await db.from("vfd_sandbox_groups").update({
    status: "active", current_cycle: 1, payout_order: newPayoutOrder,
    current_payout_position: 1, total_cycles: activeMembers.length,
    member_count: activeMembers.length, max_members: activeMembers.length,
    updated_at: new Date().toISOString(),
  }).eq("id", groupId);

  await postChatMessage(groupId, userId, "🔄 Group has been restarted! New payout positions randomized. Cycle 1 begins.", "system");

  for (const memberId of memberIds) {
    const pos = newPayoutOrder.indexOf(memberId) + 1;
    await sendNotification(memberId, "Group Restarted",
      `${group.name} has been restarted. Your new payout position is #${pos}.`,
      "group_restarted", groupId);
  }

  return jsonResponse({ data: { success: true, payout_order: newPayoutOrder } });
}

// =============================================
// TARGET AJO — FULL PRODUCTION PARITY
// =============================================

async function handleCreateTarget(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const name = body.name as string;
  const goalAmount = Number(body.goal_amount);
  const requestedMaxMembers = Number(body.max_members) || 5;
  const frequency = (body.frequency as string) || "daily";
  const savingsType = (body.savings_type as string) || "group";
  const description = (body.description as string) || null;
  const reason = (body.reason as string) || null;
  const fundingModeRaw = (body.funding_mode as string) || "wallet";
  const fundingMode = fundingModeRaw === "ddm" ? "ddm" : "wallet";

  if (!name || !goalAmount) return jsonResponse({ error: "Name and goal amount required" }, 400);
  if (goalAmount < 1000) return jsonResponse({ error: "Target must be at least ₦1,000" }, 400);

  // Independent = solo savings; force a single-member target with no invites
  const isIndependent = savingsType === "independent";
  const maxMembers = isIndependent ? 1 : Math.max(2, requestedMaxMembers);

  const contributionAmount = isIndependent ? goalAmount : Math.ceil(goalAmount / maxMembers);
  if (!isIndependent && contributionAmount < 100) {
    return jsonResponse({ error: "Contribution per member is too low. Increase target or reduce members." }, 400);
  }

  const targetDate = new Date();
  if (frequency === "daily") targetDate.setDate(targetDate.getDate() + maxMembers);
  else if (frequency === "weekly") targetDate.setDate(targetDate.getDate() + maxMembers * 7);
  else targetDate.setMonth(targetDate.getMonth() + maxMembers);

  const inviteLimit = isIndependent ? 0 : Math.max(0, maxMembers - 1);
  // DDM targets start with `pending_authorization` — each member must authorize their own mandate.
  const mandateStatus = fundingMode === "ddm" ? "pending_authorization" : "not_required";

  const { data: target, error } = await db.from("vfd_sandbox_targets").insert({
    name, admin_id: userId, goal_amount: goalAmount,
    contribution_amount: contributionAmount, frequency, max_members: maxMembers,
    savings_type: savingsType, target_date: targetDate.toISOString(), status: "active",
    description, reason, invite_limit: inviteLimit,
    funding_mode: fundingMode, mandate_status: mandateStatus,
  }).select().single();

  if (error) {
    console.error("[create_target] insert failed", error);
    return jsonResponse({ error: error.message || "Could not create target" }, 500);
  }

  if (fundingMode === "ddm") {
    const ref = `VES-DDM-TARGET-${target.id}`;
    await db.from("vfd_sandbox_targets").update({ mandate_reference: ref }).eq("id", target.id);
    target.mandate_reference = ref;
  }

  const { error: memberErr } = await db.from("vfd_sandbox_target_members")
    .insert({
      target_id: target.id,
      user_id: userId,
      contribution_method: fundingMode === "ddm" ? "direct_debit" : "wallet",
      mandate_status: fundingMode === "ddm" ? "pending" : "not_required",
    });
  if (memberErr) console.error("[create_target] admin enrol failed", memberErr);

  // Independent targets never accept invites
  if (!isIndependent) {
    const inviteeIds = body.invitee_ids as string[] | undefined;
    if (inviteeIds && inviteeIds.length > 0) {
      const invites = inviteeIds.slice(0, inviteLimit).map((inviteeId) => ({
        target_id: target.id, inviter_id: userId, invitee_id: inviteeId,
      }));
      await db.from("vfd_sandbox_target_invites").insert(invites);
      for (const inv of invites) {
        await sendNotification(inv.invitee_id, "Target Ajo Invite",
          `You've been invited to join "${name}" savings group.`, "target_invite");
      }
    }
  }

  return jsonResponse({ data: target });
}

async function handleListTargets(userId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_sandbox_targets")
    .select("*, vfd_sandbox_target_members(user_id)")
    .in("status", ["active", "completed"])
    .order("created_at", { ascending: false });

  const { data: memberships } = await db.from("vfd_sandbox_target_members")
    .select("target_id").eq("user_id", userId);
  const myIds = new Set((memberships || []).map((m: { target_id: string }) => m.target_id));

  const all = data || [];
  const mine = all.filter((t: { id: string; admin_id: string }) => myIds.has(t.id) || t.admin_id === userId);

  return jsonResponse({ data: all, mine });
}

async function handleContributeTarget(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const targetId = body.target_id as string;

  const { data: target } = await db.from("vfd_sandbox_targets").select("*").eq("id", targetId).single();
  if (!target) return jsonResponse({ error: "Target not found" }, 404);
  if (target.status !== "active") return jsonResponse({ error: "Target is not active" }, 400);

  let { data: membership } = await db.from("vfd_sandbox_target_members")
    .select("*").eq("target_id", targetId).eq("user_id", userId).maybeSingle();
  if (target.admin_id === userId) {
    const { data: ensuredMembership } = await db.from("vfd_sandbox_target_members")
      .upsert({ target_id: targetId, user_id: userId }, { onConflict: "target_id,user_id" })
      .select("*").maybeSingle();
    membership = ensuredMembership || membership;
  }
  if (!membership) return jsonResponse({ error: "You must be a member to contribute" }, 400);

  const amount = Number(target.contribution_amount);
  const isDdm = (target.funding_mode as string) === "ddm";
  if (isDdm) {
    // Per-member enforcement: each member must have their own authorized mandate.
    if (membership.mandate_status !== "authorized") {
      return jsonResponse({
        error: "Your Direct Debit Mandate is not authorized yet. Please complete bank authorization before contributing.",
        code: "MEMBER_MANDATE_NOT_AUTHORIZED",
      }, 400);
    }
    // DDM-funded — bank debit handled externally; skip wallet hold.
  } else {
    const debited = await debitForSavings(userId, amount);
    if (!debited) return jsonResponse({ error: "Insufficient available balance. Please fund your wallet first." }, 400);
  }

  const txRef = `target-${targetId}-${userId}-${Date.now()}`;
  await db.from("vfd_sandbox_target_contributions").insert({
    target_id: targetId, user_id: userId, amount, reference: txRef,
  });

  // Update member's contributed amount
  const newMemberContributed = Number(membership.contributed_amount) + amount;
  await db.from("vfd_sandbox_target_members").update({
    contributed_amount: newMemberContributed,
  }).eq("id", membership.id);

  const newTotal = Number(target.total_contributed) + amount;
  const updates: Record<string, unknown> = { total_contributed: newTotal, updated_at: new Date().toISOString() };

  let targetReached = false;
  if (newTotal >= Number(target.goal_amount)) {
    updates.status = "completed";
    targetReached = true;
  }
  await db.from("vfd_sandbox_targets").update(updates).eq("id", targetId);

  // Production parity: On target reached, release funds back to individual wallets
  if (targetReached) {
    const { data: allMembers } = await db.from("vfd_sandbox_target_members").select("*").eq("target_id", targetId);
    if (allMembers) {
      for (const m of allMembers) {
        // Use the stored contributed_amount (already updated for current user)
        const memberContributed = m.user_id === userId ? newMemberContributed : Number(m.contributed_amount);
        if (memberContributed > 0) {
          if (isDdm) {
            // DDM-funded: cash sat in the group pool — pay it out through the ledger.
            await ledgerTargetPayout(
              m.user_id, targetId, memberContributed,
              `target-payout-${targetId}-${m.user_id}`,
              { target_name: target.name },
            );
          } else {
            await creditFromSavings(m.user_id, memberContributed);
          }
          await sendNotification(m.user_id, "🎯 Target Achieved!",
            `"${target.name}" has reached its savings target! ₦${memberContributed.toLocaleString()} has been released to your wallet.`,
            "target_achieved");
        }
      }
    }
  }

  return jsonResponse({ data: { contributed: true, amount, total: newTotal, target_reached: targetReached, tx_ref: txRef } });
}

async function handleGetTargetDetail(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const targetId = body.target_id as string;
  if (!targetId) return jsonResponse({ error: "target_id required" }, 400);
  if (!(await isTargetMember(targetId, userId)) && !(await isPlatformAdmin(userId))) return forbidden();
  const { data: target } = await db.from("vfd_sandbox_targets").select("*").eq("id", targetId).single();
  const { data: members } = await db.from("vfd_sandbox_target_members").select("*").eq("target_id", targetId);
  const { data: contributions } = await db.from("vfd_sandbox_target_contributions").select("*").eq("target_id", targetId).order("created_at", { ascending: false }).limit(50);
  const { data: invites } = await db.from("vfd_sandbox_target_invites").select("*").eq("target_id", targetId);
  const { data: withdrawalRequests } = await db.from("vfd_sandbox_target_withdrawal_requests").select("*").eq("target_id", targetId).order("created_at", { ascending: false });

  let votes: unknown[] = [];
  if (withdrawalRequests && withdrawalRequests.length > 0) {
    const wrIds = withdrawalRequests.map((w: { id: string }) => w.id);
    const { data: v } = await db.from("vfd_sandbox_target_withdrawal_votes").select("*").in("withdrawal_request_id", wrIds);
    votes = v || [];
  }

  const nameMap = await fetchProfileNames([
    ...(members || []).map((m: { user_id: string }) => m.user_id),
    ...(contributions || []).map((c: { user_id: string }) => c.user_id),
    ...(withdrawalRequests || []).map((w: { user_id?: string }) => w.user_id || ""),
    ...(votes as { user_id?: string }[]).map(v => v.user_id || ""),
  ]);

  return jsonResponse({
    data: {
      target,
      members: attachNames(members, nameMap),
      contributions: attachNames(contributions, nameMap),
      invites: invites || [],
      withdrawal_requests: attachNames(withdrawalRequests, nameMap),
      votes: attachNames(votes as { user_id?: string }[], nameMap),
    },
  });
}

// Target Ajo: List pending invites for the current user (with target name)
async function handleListPendingTargetInvites(userId: string) {
  const db = getSupabaseAdmin();
  const { data: invites } = await db.from("vfd_sandbox_target_invites")
    .select("*")
    .eq("invitee_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (!invites || invites.length === 0) return jsonResponse({ data: [] });

  const targetIds = Array.from(new Set(invites.map((i: { target_id: string }) => i.target_id)));
  const { data: targets } = await db.from("vfd_sandbox_targets")
    .select("id, name, goal_amount, contribution_amount, frequency, savings_type, admin_id")
    .in("id", targetIds);
  const tMap = new Map((targets || []).map((t: { id: string }) => [t.id, t]));

  const inviterIds = Array.from(new Set(invites.map((i: { inviter_id: string }) => i.inviter_id)));
  const inviterNames = await fetchProfileNames(inviterIds);

  const enriched = invites.map((inv: any) => ({
    ...inv,
    target: tMap.get(inv.target_id) || null,
    inviter_name: inviterNames[inv.inviter_id] || `User ${String(inv.inviter_id).slice(0, 6)}`,
  }));

  return jsonResponse({ data: enriched });
}

// Target Ajo: Invite member
async function handleInviteTargetMember(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const targetId = body.target_id as string;
  const inviteeId = body.invitee_id as string;

  const { data: target } = await db.from("vfd_sandbox_targets").select("*").eq("id", targetId).single();
  if (!target) return jsonResponse({ error: "Target not found" }, 404);
  if (target.admin_id !== userId) return jsonResponse({ error: "Only the admin can invite" }, 403);

  // Check invite limit
  const { count: inviteCount } = await db.from("vfd_sandbox_target_invites")
    .select("*", { count: "exact", head: true }).eq("target_id", targetId).in("status", ["pending", "accepted"]);
  if (inviteCount && inviteCount >= (target.invite_limit || target.max_members - 1)) {
    return jsonResponse({ error: "Invite limit reached" }, 400);
  }

  const { data: existing } = await db.from("vfd_sandbox_target_invites")
    .select("id").eq("target_id", targetId).eq("invitee_id", inviteeId).in("status", ["pending", "accepted"]).maybeSingle();
  if (existing) return jsonResponse({ data: { invited: true, already_invited: true } });

  await db.from("vfd_sandbox_target_invites").insert({
    target_id: targetId, inviter_id: userId, invitee_id: inviteeId,
  });

  await sendNotification(inviteeId, "Target Ajo Invite",
    `You've been invited to join "${target.name}" savings group.`,
    "target_invite");

  return jsonResponse({ data: { invited: true } });
}

// Target Ajo: Respond to invite
async function handleRespondTargetInvite(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const inviteId = body.invite_id as string;
  const accept = body.accept as boolean;

  const { data: invite } = await db.from("vfd_sandbox_target_invites").select("*").eq("id", inviteId).single();
  if (!invite) return jsonResponse({ error: "Invite not found" }, 404);
  if (invite.invitee_id !== userId) return jsonResponse({ error: "Not authorized" }, 403);
  if (invite.status !== "pending") return jsonResponse({ error: "Invite already responded" }, 400);

  await db.from("vfd_sandbox_target_invites").update({
    status: accept ? "accepted" : "declined",
    responded_at: new Date().toISOString(),
  }).eq("id", inviteId);

  if (accept) {
    const { data: existing } = await db.from("vfd_sandbox_target_members")
      .select("id").eq("target_id", invite.target_id).eq("user_id", userId).maybeSingle();
    if (!existing) {
      // Inherit funding mode from the target: DDM targets enrol members as
      // direct-debit contributors with mandate_status="pending" (member must authorize).
      const { data: targetMeta } = await db.from("vfd_sandbox_targets")
        .select("member_count, funding_mode, name").eq("id", invite.target_id).single();
      const isDdm = (targetMeta?.funding_mode as string) === "ddm";
      await db.from("vfd_sandbox_target_members").insert({
        target_id: invite.target_id, user_id: userId,
        contribution_method: isDdm ? "direct_debit" : "wallet",
        mandate_status: isDdm ? "pending" : "not_required",
      });
      if (targetMeta) {
        await db.from("vfd_sandbox_targets").update({
          member_count: (targetMeta.member_count || 1) + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", invite.target_id);
        if (isDdm) {
          await sendNotification(userId, "Authorize Direct Debit Mandate",
            `You joined "${targetMeta.name}" which requires a Direct Debit Mandate. Open the group to authorize your bank account.`,
            "ddm_authorization_required");
        }
      }
    }
  }

  return jsonResponse({ data: { status: accept ? "accepted" : "declined" } });
}

// Target Ajo: Withdrawal request (group mode — requires votes)
async function handleRequestTargetWithdrawal(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const targetId = body.target_id as string;
  const amount = Number(body.amount);
  const reason = (body.reason as string) || null;

  if (!Number.isFinite(amount) || amount < 100) {
    return jsonResponse({ error: "Withdrawal amount must be at least ₦100" }, 400);
  }

  const { data: target } = await db.from("vfd_sandbox_targets").select("*").eq("id", targetId).single();
  if (!target) return jsonResponse({ error: "Target not found" }, 404);
  if (target.savings_type !== "group") return jsonResponse({ error: "Withdrawal requests are only for group mode" }, 400);
  if (amount > Number(target.total_contributed)) {
    return jsonResponse({ error: "Withdrawal amount exceeds the group's pooled balance" }, 400);
  }

  const { data: membership } = await db.from("vfd_sandbox_target_members")
    .select("*").eq("target_id", targetId).eq("user_id", userId).maybeSingle();
  if (!membership) return jsonResponse({ error: "Not a member", data: null });

  // Block overlapping pending requests for the same group
  const { data: pendingExisting } = await db.from("vfd_sandbox_target_withdrawal_requests")
    .select("id").eq("target_id", targetId).eq("status", "pending").maybeSingle();
  if (pendingExisting) return jsonResponse({ error: "There is already a pending withdrawal request for this group" }, 400);

  // Production parity: Required votes = 2/3 of members (matching live which says "2/3 member approval")
  const { count: memberCount } = await db.from("vfd_sandbox_target_members")
    .select("*", { count: "exact", head: true }).eq("target_id", targetId);
  const requiredVotes = Math.ceil(((memberCount || 1) * 2) / 3);

  const { data: wr, error } = await db.from("vfd_sandbox_target_withdrawal_requests").insert({
    target_id: targetId, requested_by: userId, amount,
    reason, required_votes: requiredVotes,
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);

  // Notify all other members about the new vote
  const { data: allMembers } = await db.from("vfd_sandbox_target_members")
    .select("user_id").eq("target_id", targetId);
  for (const m of allMembers || []) {
    if (m.user_id !== userId) {
      await sendNotification(m.user_id, "Withdrawal Vote Needed",
        `A member requested ₦${amount.toLocaleString()} from "${target.name}". Cast your vote.`,
        "withdrawal_vote_request", targetId);
    }
  }

  return jsonResponse({ data: wr });
}

// Target Ajo: Vote on withdrawal — atomic via SQL function so concurrent
// voters can't both trigger a payout when their votes tie at the threshold.
async function handleVoteTargetWithdrawal(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const requestId = body.request_id as string;
  const vote = body.vote as string;

  const { data, error } = await db.rpc("cast_target_withdrawal_vote", {
    _request_id: requestId,
    _voter_id: userId,
    _vote: vote,
  });

  if (error) {
    console.error("[vote_target_withdrawal] rpc failed:", error);
    return jsonResponse({ error: error.message }, 500);
  }

  const result = data as {
    ok: boolean;
    reason?: string;
    resolved?: boolean;
    outcome?: string;
    requested_by?: string;
    amount?: number;
    target_id?: string;
    approval_count?: number;
    rejection_count?: number;
    required_votes?: number;
  };

  if (!result?.ok) {
    const map: Record<string, [string, number]> = {
      invalid_vote: ["Invalid vote", 400],
      request_not_found: ["Request not found", 404],
      already_resolved: ["Request already resolved", 400],
      not_a_member: ["Not a member", 200],
      already_voted: ["Already voted", 400],
    };
    const [msg, code] = map[result?.reason ?? ""] ?? ["Vote rejected", 400];
    return jsonResponse({ error: msg }, code);
  }

  // Side-effects (credit + decrement pool + notify) ONLY on the vote that
  // actually flipped the request to its terminal state.
  if (result.resolved && result.outcome === "approved" && result.requested_by && result.amount) {
    const wrAmount = Number(result.amount);
    await creditFromSavings(result.requested_by, wrAmount);

    if (result.target_id) {
      const { data: tgt } = await db.from("vfd_sandbox_targets")
        .select("total_contributed").eq("id", result.target_id).maybeSingle();
      if (tgt) {
        await db.from("vfd_sandbox_targets").update({
          total_contributed: Math.max(0, Number(tgt.total_contributed) - wrAmount),
          updated_at: new Date().toISOString(),
        }).eq("id", result.target_id);
      }
    }

    await sendNotification(
      result.requested_by,
      "Withdrawal Approved",
      `Your withdrawal of ₦${wrAmount.toLocaleString()} has been approved and credited.`,
      "withdrawal_approved",
    );
  } else if (result.resolved && result.outcome === "rejected" && result.requested_by) {
    await sendNotification(
      result.requested_by,
      "Withdrawal Rejected",
      `Your withdrawal request was rejected by the group.`,
      "withdrawal_rejected",
    );
  }

  return jsonResponse({
    data: {
      voted: true,
      vote,
      resolved: result.resolved ?? false,
      outcome: result.outcome ?? null,
      approval_count: result.approval_count,
      rejection_count: result.rejection_count,
    },
  });
}

// Target Ajo: Independent mode instant withdrawal
async function handleIndependentWithdrawal(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const targetId = body.target_id as string;

  const { data: target } = await db.from("vfd_sandbox_targets").select("*").eq("id", targetId).single();
  if (!target) return jsonResponse({ error: "Target not found" }, 404);
  if (target.savings_type !== "independent") return jsonResponse({ error: "Instant withdrawal is only for independent mode" }, 400);

  const { data: membership } = await db.from("vfd_sandbox_target_members")
    .select("*").eq("target_id", targetId).eq("user_id", userId).maybeSingle();
  if (!membership) return jsonResponse({ error: "Not a member", data: null });

  const contributed = Number(membership.contributed_amount);
  if (contributed <= 0) return jsonResponse({ error: "No contributions to withdraw" }, 400);

  await creditFromSavings(userId, contributed);
  await db.from("vfd_sandbox_target_members").update({ contributed_amount: 0 }).eq("id", membership.id);

  await db.from("vfd_sandbox_targets").update({
    total_contributed: Math.max(0, Number(target.total_contributed) - contributed),
    updated_at: new Date().toISOString(),
  }).eq("id", targetId);

  return jsonResponse({ data: { withdrawn: true, amount: contributed } });
}

// =============================================
// GOAL FUNDING — FULL PRODUCTION PARITY
// =============================================

async function handleCreateCampaign(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const title = (body.title as string)?.trim();
  const goalAmount = Number(body.goal_amount);
  const description = (body.description as string)?.trim() || null;
  const deadline = body.deadline as string || null;
  const contributionVisibility = (body.contribution_visibility as string) || "public";
  const campaignImage = (body.campaign_image as string) || null;
  const providedSlug = (body.campaign_slug as string)?.trim() || null;

  if (!title) return jsonResponse({ error: "Campaign title is required" }, 400);
  if (!goalAmount || isNaN(goalAmount) || goalAmount < 1000) {
    return jsonResponse({ error: "Goal amount must be at least ₦1,000" }, 400);
  }
  if (!["public", "anonymous"].includes(contributionVisibility)) {
    return jsonResponse({ error: "Invalid contribution visibility" }, 400);
  }

  // Wallet-credit/escrow model — funds credit to creator's wallet on withdrawal.
  // No beneficiary bank account required.
  const slug = providedSlug ||
    (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36));

  const { data, error } = await db.from("vfd_sandbox_campaigns").insert({
    title, creator_id: userId, goal_amount: goalAmount, description,
    deadline: deadline ? new Date(deadline).toISOString() : null,
    contribution_visibility: contributionVisibility,
    campaign_image: campaignImage,
    campaign_slug: slug,
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}

async function handleListCampaigns(userId: string) {
  const db = getSupabaseAdmin();
  const { data: all } = await db.from("vfd_sandbox_campaigns")
    .select("*")
    .in("status", ["active", "completed"])
    .order("created_at", { ascending: false });

  const mine = (all || []).filter((c: { creator_id: string }) => c.creator_id === userId);

  return jsonResponse({ data: all || [], mine });
}

async function handleContributeCampaign(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const campaignId = body.campaign_id as string;
  const amount = Number(body.amount);
  const anonymous = body.anonymous as boolean || false;
  const message = body.message as string || null;
  const contributorName = body.contributor_name as string || null;

  if (!amount || amount <= 0) return jsonResponse({ error: "Invalid amount" }, 400);

  const { data: campaign } = await db.from("vfd_sandbox_campaigns").select("*").eq("id", campaignId).single();
  if (!campaign) return jsonResponse({ error: "Campaign not found" }, 404);
  if (campaign.status !== "active") return jsonResponse({ error: "Campaign is not active" }, 400);

  const contributionRef = `goal-${campaignId}-${userId}-${Date.now()}`;

  const debited = await ledgerCampaignContribute(userId, campaignId, amount, contributionRef, {
    campaign_title: campaign.title,
  });
  if (!debited) return jsonResponse({ error: "Insufficient available balance" }, 400);


  await db.from("vfd_sandbox_campaign_contributions").insert({
    campaign_id: campaignId, contributor_id: userId, amount, anonymous, message,
    contributor_name: contributorName,
    contribution_reference: contributionRef,
  });

  // Escrow accounting: funds sit in the campaign's escrow_balance until the
  // owner withdraws them. They are NOT auto-credited to the owner's wallet.
  const newRaised = Number(campaign.raised_amount) + amount;
  const newEscrow = Number(campaign.escrow_balance || 0) + amount;
  const updates: Record<string, unknown> = {
    raised_amount: newRaised,
    escrow_balance: newEscrow,
    contributor_count: campaign.contributor_count + 1,
    updated_at: new Date().toISOString(),
  };
  if (newRaised >= Number(campaign.goal_amount)) updates.status = "completed";
  await db.from("vfd_sandbox_campaigns").update(updates).eq("id", campaignId);

  // Notify the owner so they can see new escrow funds awaiting withdrawal.
  if (campaign.creator_id !== userId) {
    await sendNotification(
      campaign.creator_id,
      "New campaign contribution",
      `Your campaign “${campaign.title}” received ₦${amount.toLocaleString()}. Escrow balance: ₦${newEscrow.toLocaleString()}.`,
      "campaign_contribution",
    );
  }

  return jsonResponse({ data: { contributed: true, amount, total_raised: newRaised, escrow_balance: newEscrow } });
}

async function handleWithdrawCampaignEscrow(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const campaignId = body.campaign_id as string;
  const requestedAmount = body.amount !== undefined ? Number(body.amount) : null;

  if (!campaignId) return jsonResponse({ error: "Campaign id required" }, 400);

  const { data: campaign } = await db.from("vfd_sandbox_campaigns").select("*").eq("id", campaignId).single();
  if (!campaign) return jsonResponse({ error: "Campaign not found" }, 404);
  if (campaign.creator_id !== userId) return jsonResponse({ error: "Only the campaign owner can withdraw" }, 403);

  const escrow = Number(campaign.escrow_balance || 0);
  if (escrow <= 0) return jsonResponse({ error: "No funds available in escrow" }, 400);

  const amount = requestedAmount && requestedAmount > 0 ? Math.min(requestedAmount, escrow) : escrow;
  if (amount <= 0) return jsonResponse({ error: "Invalid withdrawal amount" }, 400);

  // Move funds from campaign escrow to owner's wallet (ledger-backed).
  const released = await ledgerCampaignWithdraw(
    userId, campaignId, amount,
    `campaign-withdraw-${campaignId}-${Date.now()}`,
    { campaign_title: campaign.title },
  );
  if (!released) return jsonResponse({ error: "Could not release campaign funds. Please try again." }, 400);
  await db.from("vfd_sandbox_campaigns").update({
    escrow_balance: escrow - amount,
    total_withdrawn: Number(campaign.total_withdrawn || 0) + amount,
    updated_at: new Date().toISOString(),
  }).eq("id", campaignId);

  await sendNotification(
    userId,
    "Campaign funds withdrawn",
    `₦${amount.toLocaleString()} from “${campaign.title}” has been moved to your wallet.`,
    "campaign_withdrawal",
  );

  return jsonResponse({ data: { withdrawn: amount, remaining_escrow: escrow - amount } });
}

async function handleGetCampaignDetail(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const campaignId = body.campaign_id as string;
  if (!campaignId) return jsonResponse({ error: "campaign_id required" }, 400);

  const { data: campaign } = await db.from("vfd_sandbox_campaigns").select("*").eq("id", campaignId).single();
  if (!campaign) return jsonResponse({ error: "Campaign not found" }, 404);

  const { data: contributions } = await db.from("vfd_sandbox_campaign_contributions")
    .select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false });

  const { data: updates } = await db.from("vfd_sandbox_campaign_updates")
    .select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false });

  // Campaigns are shareable, but only the owner (or a platform admin) may see
  // contributor identities and the campaign's banking/escrow metadata.
  const isOwner = campaign.creator_id === userId || (await isPlatformAdmin(userId));
  if (isOwner) {
    return jsonResponse({ data: { campaign, contributions: contributions || [], updates: updates || [] } });
  }

  const {
    virtual_account_number: _van,
    account_number: _an,
    escrow_account: _esc,
    flw_subaccount_id: _flw,
    ...publicCampaign
  } = campaign as Record<string, unknown>;

  const redactedContributions = (contributions || []).map((c: Record<string, unknown>) => ({
    id: c.id,
    amount: c.amount,
    amount_kobo: c.amount_kobo,
    created_at: c.created_at,
    is_anonymous: c.is_anonymous,
    display_name: c.is_anonymous ? "Anonymous" : (c.display_name ?? "Supporter"),
    // Contributor identity + payment references withheld from non-owners.
    is_mine: c.user_id === userId,
  }));

  return jsonResponse({
    data: { campaign: publicCampaign, contributions: redactedContributions, updates: updates || [] },
  });
}

async function handlePostCampaignUpdate(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const campaignId = body.campaign_id as string;
  const updateMessage = body.update_message as string;

  if (!updateMessage?.trim()) return jsonResponse({ error: "Update message required" }, 400);

  const { data: campaign } = await db.from("vfd_sandbox_campaigns").select("creator_id").eq("id", campaignId).single();
  if (!campaign) return jsonResponse({ error: "Campaign not found" }, 404);
  if (campaign.creator_id !== userId) return jsonResponse({ error: "Only campaign owner can post updates" }, 403);

  const { data, error } = await db.from("vfd_sandbox_campaign_updates").insert({
    campaign_id: campaignId, created_by: userId, update_message: updateMessage.trim(),
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}

// =============================================
// SPLITPAY — FULL PRODUCTION PARITY
// =============================================

/** Vestara Split Pay standalone service fee (flat, per split). */
const SPLITPAY_SERVICE_FEE = 10;

async function handleCreateSplit(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const title = body.title as string;
  const totalAmount = Number(body.total_amount);
  const splitCount = Number(body.split_count) || 2;
  const merchantAccountName = body.merchant_account_name as string || null;
  const merchantBankName = body.merchant_bank_name as string || null;
  const merchantAccountNumber = body.merchant_account_number as string || null;
  const expiryDays = Number(body.expiry_days) || 7;
  const purpose = (body.purpose as string) || title;
  // Optional: creator covers a custom amount, remainder is split equally across the other (splitCount - 1) participants
  const creatorAmountRaw = body.creator_amount !== undefined ? Number(body.creator_amount) : null;

  // PRODUCTION PARITY: minimum ₦1,000 (not ₦100)
  if (!title || !totalAmount || totalAmount < 1000) return jsonResponse({ error: "Title and total amount (min ₦1,000) required" }, 400);
  if (splitCount < 2) return jsonResponse({ error: "Need at least 2 participants" }, 400);
  if (splitCount > 50) return jsonResponse({ error: "Maximum 50 participants allowed" }, 400);

  let creatorAmount: number;
  let perPerson: number;
  let creatorPaysFullFee = false;
  if (creatorAmountRaw !== null && !Number.isNaN(creatorAmountRaw)) {
    if (creatorAmountRaw <= 0 || creatorAmountRaw >= totalAmount) {
      return jsonResponse({ error: "Your contribution must be greater than 0 and less than the total amount" }, 400);
    }
    creatorAmount = Math.round(creatorAmountRaw * 100) / 100;
    perPerson = Math.ceil(((totalAmount - creatorAmount) / (splitCount - 1)) * 100) / 100;
    // Bills/custom split: creator absorbs the full platform fee, invitees pay 0 fee
    creatorPaysFullFee = true;
  } else {
    perPerson = Math.ceil((totalAmount / splitCount) * 100) / 100;
    creatorAmount = perPerson;
  }

  // Vestara Split Pay service fee: flat ₦10 per split, standalone to Split Pay
  // (unrelated to any bill convenience fee, which the split path never charges).
  const platformFee = SPLITPAY_SERVICE_FEE;
  // When creator absorbs the fee, fee_per_person is 0 (signals handlePaySplit to charge creator the full fee)
  const feePerPerson = creatorPaysFullFee ? 0 : Math.ceil((platformFee / splitCount) * 100) / 100;

  // Fail fast at creation time: the initiator must already hold enough to cover
  // their own share PLUS the service fee they will be charged when they pay.
  // Without this the split gets created and then dies at the payment step.
  const creatorFeeAtCreation = creatorPaysFullFee ? platformFee : feePerPerson;
  const creatorDueAtCreation = Math.round((creatorAmount + creatorFeeAtCreation) * 100) / 100;
  const creatorAvailable = await getAvailableBalance(userId);
  if (creatorAvailable < creatorDueAtCreation) {
    return jsonResponse({
      error: `Insufficient balance to start this split. You need ₦${creatorDueAtCreation.toLocaleString()} (₦${creatorAmount.toLocaleString()} your share + ₦${creatorFeeAtCreation.toLocaleString()} service fee) but have ₦${creatorAvailable.toLocaleString()}. Fund your wallet and try again.`,
      code: "SPLIT_CREATOR_INSUFFICIENT_FUNDS",
    }, 400);
  }

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);

  const billMetadata = (body.bill_metadata && typeof body.bill_metadata === "object") ? body.bill_metadata : null;

  const { data: split, error } = await db.from("vfd_sandbox_splits").insert({
    title, creator_id: userId, total_amount: totalAmount,
    split_count: splitCount, per_person_amount: perPerson,
    merchant_account_name: merchantAccountName,
    merchant_bank_name: merchantBankName,
    merchant_account_number: merchantAccountNumber,
    platform_fee: platformFee,
    fee_per_person: feePerPerson,
    purpose: purpose,
    expiry_date: expiryDate.toISOString(),
    bill_metadata: billMetadata,
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);

  // Creator is first participant (with their custom contribution if provided)
  await db.from("vfd_sandbox_split_participants").insert({
    split_id: split.id, user_id: userId, amount: creatorAmount,
  });

  return jsonResponse({ data: split });
}


async function handleListSplits(userId: string) {
  const db = getSupabaseAdmin();

  const { data: participations } = await db.from("vfd_sandbox_split_participants")
    .select("split_id").eq("user_id", userId);
  const participatedIds = (participations || []).map((p: { split_id: string }) => p.split_id);

  const { data: asCreator } = await db.from("vfd_sandbox_splits")
    .select("*").eq("creator_id", userId).order("created_at", { ascending: false });

  const { data: asParticipant } = participatedIds.length > 0
    ? await db.from("vfd_sandbox_splits").select("*").in("id", participatedIds).order("created_at", { ascending: false })
    : { data: [] };

  const allMap = new Map<string, unknown>();
  for (const s of [...(asCreator || []), ...(asParticipant || [])]) {
    allMap.set((s as { id: string }).id, s);
  }

  return jsonResponse({ data: Array.from(allMap.values()) });
}

async function handleJoinSplit(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const splitId = body.split_id as string;

  const { data: split } = await db.from("vfd_sandbox_splits").select("*").eq("id", splitId).single();
  if (!split) return jsonResponse({ error: "Split not found" }, 404);
  if (split.status !== "active") return jsonResponse({ error: "Split is not active" }, 400);

  if (split.expiry_date && new Date(split.expiry_date) < new Date()) {
    return jsonResponse({ error: "Split has expired" }, 400);
  }

  const { data: existing } = await db.from("vfd_sandbox_split_participants")
    .select("id").eq("split_id", splitId).eq("user_id", userId).maybeSingle();
  if (existing) return jsonResponse({ data: { joined: true, already_member: true } });

  // Production parity: count active/pending only (exclude declined)
  const { count } = await db.from("vfd_sandbox_split_participants")
    .select("*", { count: "exact", head: true }).eq("split_id", splitId).in("status", ["pending", "paid"]);
  if (count && count >= split.split_count) return jsonResponse({ error: `Split is full (${count}/${split.split_count} slots taken). Ask the creator to remove a participant or create a larger split.` }, 400);

  const { error } = await db.from("vfd_sandbox_split_participants").insert({
    split_id: splitId, user_id: userId, amount: Number(split.per_person_amount),
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ data: { joined: true } });
}

// Finalize a bill-payment SplitPay: call VFD bills/pay, write receipt + ledger entry, notify creator + all participants
// ---------------------------------------------------------------------------
// Bills: durable outbound /pay request trace.
// Logged as structured JSON (greppable: "[bills][pay][request]") AND persisted
// to vfd_transaction_events immediately, before the VFD call is made, so a
// timeout or crash still leaves the exact request behind. The same snapshot is
// attached to the bill receipt (request_payload) once the receipt is written.
// ---------------------------------------------------------------------------
const billPayRequestCache = new Map<string, Record<string, unknown>>();

async function recordBillPayRequest(params: {
  reference: string;
  request_id: string;
  user_id: string | null;
  origin: string;
  url: string;
  payload: Record<string, string>;
}) {
  const snapshot: Record<string, unknown> = {
    reference: params.reference,
    request_id: params.request_id,
    origin: params.origin,
    url: params.url,
    method: "POST",
    sent_at: new Date().toISOString(),
    body: params.payload,
  };
  billPayRequestCache.set(params.reference, snapshot);
  console.log(`[bills][pay][request] ${JSON.stringify(snapshot)}`);
  try {
    await getSupabaseAdmin().from("vfd_transaction_events").insert({
      user_id: params.user_id,
      reference: params.reference,
      event_type: "bill_pay_request",
      actor: "system",
      payload: snapshot,
    });
  } catch (e) {
    console.error("[bills][pay][request] persist failed", e);
  }
}

function consumeBillPayRequest(reference: string): Record<string, unknown> | null {
  const snap = billPayRequestCache.get(reference) ?? null;
  billPayRequestCache.delete(reference);
  return snap;
}

async function settleSplitBill(split: Record<string, any>): Promise<{ delivered: boolean; reference?: string; biller_name?: string; customer_id?: string; amount?: number; message?: string }> {
  const db = getSupabaseAdmin();
  const meta = split.bill_metadata || {};
  const { customerId, division, paymentItem, productId, billerId, phoneNumber, category, billerName, paymentItemName } = meta;
  if (!customerId || !division || !paymentItem || !productId || !billerId) {
    console.error("[settleSplitBill] missing bill_metadata fields", meta);
    await db.from("vfd_sandbox_splits").update({
      settlement_status: "failed",
      settlement_completed_at: new Date().toISOString(),
      settlement_failure_reason: "Bill metadata incomplete",
    }).eq("id", split.id);
    await sendNotification(split.creator_id, "SplitPay Complete — bill needs attention",
      `All participants paid for "${split.title}" but bill details are incomplete. Please contact support.`,
      "split_completed");
    return { delivered: false, message: "Bill metadata incomplete" };
  }

  const amount = Number(split.total_amount);
  const reference = `vestara-split-bill-${split.id.slice(0, 8)}-${Date.now()}`;
  const displayBillerName = billerName || String(billerId).toUpperCase();
  // Fix B: the split's stored bill_metadata can carry a biller ID that VFD has
  // since renamed. Resolve it against the live /billerlist before anything
  // (validation gate, /pay payload, receipt) uses it.
  const canonicalBillerId = await canonicalizeBillerId(String(billerId), category || null, billerName || null);
  if (canonicalBillerId !== String(billerId)) {
    console.warn(`[settleSplitBill] biller id normalised ${billerId} → ${canonicalBillerId}`);
  }

  // --- Biller-specific guards (parity with the direct pay path) --------------
  const splitBillerHay = `${canonicalBillerId} ${billerName || ""} ${paymentItemName || ""}`.toLowerCase();
  // IKEDC requires a contact MSISDN; resolve it before anything moves money.
  const splitPhone = await resolveBillMsisdn(split.creator_id, phoneNumber, customerId);
  const failSplit = async (reason: string) => {
    await db.from("vfd_sandbox_splits").update({
      settlement_status: "failed",
      settlement_reference: reference,
      settlement_completed_at: new Date().toISOString(),
      settlement_failure_reason: reason,
    }).eq("id", split.id);
    await sendNotification(split.creator_id, "SplitPay collected — bill needs attention",
      `Funds for "${split.title}" were collected but the bill could not be sent to ${displayBillerName}: ${reason}`,
      "split_completed");
    return { delivered: false, reference, biller_name: displayBillerName, customer_id: customerId, amount, message: reason };
  };
  if (/ibedc|ibadan/.test(splitBillerHay) && amount < 5000) {
    return await failSplit("IBEDC requires a minimum purchase of ₦5,000.");
  }
  if (!splitPhone && /ikedc|ikeja/.test(splitBillerHay)) {
    return await failSplit("Ikeja Electric requires a phone number for this payment.");
  }


  // --- Backend validation gate: SplitPay settlement must clear the same bar ---
  const splitGate = await gateBillPayment({
    identity: {
      category, billerId: canonicalBillerId, billerName: displayBillerName,
      paymentItemName, productId, divisionId: division,
    },
    customerId, divisionId: division, paymentItem, billerId: canonicalBillerId,
    paymentReference: reference, origin: "splitpay_settlement",
  });
  if (!splitGate.allowed) {
    await db.from("vfd_sandbox_splits").update({
      settlement_status: "failed",
      settlement_reference: reference,
      settlement_completed_at: new Date().toISOString(),
      settlement_failure_reason: splitGate.error || "Customer validation failed",
    }).eq("id", split.id);
    await sendNotification(split.creator_id, "SplitPay collected — bill needs attention",
      `Funds for "${split.title}" were collected but ${displayBillerName} could not verify ${customerId}. Our team will follow up.`,
      "split_completed");
    return { delivered: false, reference, biller_name: displayBillerName, customer_id: customerId, amount, message: splitGate.error };
  }
  const splitValidation = splitGate.record;

  // --- Fund settlement for real BEFORE /pay (same rule as the direct path) ---
  // Move the bill amount AND the Vestara SplitPay service fee out of the
  // creator's NUBAN into the corporate pool, so the ₦10 revenue leg is backed
  // by real cash in the pool (not just an internal ledger credit).
  const splitFeeToMove = Number(split.platform_fee || 0);
  const splitFunding = await fundBillsSettlement({
    reference, amount: amount + (splitFeeToMove > 0 ? splitFeeToMove : 0),
    userId: split.creator_id, origin: "split_bill_pay",
  });

  if (!splitFunding.confirmed) {
    console.error(`[settleSplitBill] ref=${reference} NOT FUNDED code=${splitFunding.code} — /pay skipped`);
    await db.from("vfd_sandbox_splits").update({
      settlement_status: "failed",
      settlement_reference: reference,
      settlement_completed_at: new Date().toISOString(),
      settlement_failure_reason: splitFunding.error || "Settlement funding could not be confirmed",
    }).eq("id", split.id);
    await sendNotification(split.creator_id, "SplitPay collected — bill delivery pending",
      `Funds for "${split.title}" were collected but the bill could not be sent to ${displayBillerName} yet. Our team will retry shortly.`,
      "split_completed");
    return { delivered: false, reference, biller_name: displayBillerName, customer_id: customerId, amount, message: splitFunding.error };
  }




  let vfdData: any = null;
  let vfdOk = false;
  try {
    const token = await getVfdAccessToken();
    if (token) {
      const splitRequestId = crypto.randomUUID();
      // splitPhone resolved above (same MSISDN rule as the direct pay path).

      const payBody: Record<string, string> = {
        customerId, amount: String(amount), division, paymentItem, productId,
        billerId: canonicalBillerId, reference,
      };
      if (splitPhone) payBody.phoneNumber = splitPhone;
      await recordBillPayRequest({
        reference, request_id: splitRequestId, user_id: split.creator_id, origin: "split_bill_pay",
        url: `${getBillsBase()}/pay`, payload: payBody,
      });
      const resp = await fetchWithTimeout(`${getBillsBase()}/pay`, {
        method: "POST",
        headers: { AccessToken: token, "Content-Type": "application/json", "x-request-id": splitRequestId },
        body: JSON.stringify(payBody),
      }, VFD_BILLS_PAY_TIMEOUT_MS);
      vfdData = await safeJson(resp);
      vfdOk = (Deno.env.get("VFD_MODE") || "sandbox").toLowerCase() === "production"
        ? (resp.ok && vfdData?.status === "00")
        : (resp.ok || vfdData?.status === "00" || vfdData?.status === "99" || !!vfdData);
    }
  } catch (e) {
    console.error("[settleSplitBill] vfd call failed", e);
  }

  // Mark split settlement
  await db.from("vfd_sandbox_splits").update({
    settlement_status: vfdOk ? "completed" : "failed",
    settlement_reference: reference,
    settlement_completed_at: new Date().toISOString(),
    settlement_failure_reason: vfdOk ? null : (vfdData?.message || "VFD bill payment did not confirm"),
  }).eq("id", split.id);

  if (!vfdOk) {
    await sendNotification(split.creator_id, "SplitPay collected — bill delivery pending",
      `Funds for "${split.title}" were collected but the bill could not be delivered to ${customerId}. Our team will retry.`,
      "split_completed");
    return { delivered: false, reference, biller_name: displayBillerName, customer_id: customerId, amount, message: vfdData?.message || "Bill delivery pending" };
  }

  // Fix A: reconcile VFD's real pool debit for the split bill too.
  scheduleBillPoolReconciliation(reference, amount, "split_bill_pay");

  // Sweep the SplitPay service fee out of split_holding into the Vestara pool/revenue account.
  const splitServiceFee = Number(split.platform_fee || 0);
  if (splitServiceFee > 0) {
    const { data: feeSweep, error: feeSweepErr } = await db.rpc("vestara_split_fee_to_revenue", {
      _split_id: split.id,
      _amount: splitServiceFee,
      _reference: `${reference}-FEE`,
      _initiated_by: split.creator_id,
      _metadata: { origin: "split_bill_pay", bill_reference: reference },
    });
    if (feeSweepErr || (feeSweep && (feeSweep as any).success === false)) {
      console.error(`[settleSplitBill] fee sweep failed ref=${reference}`, feeSweepErr || feeSweep);
    }
  }



  // Bill receipt (creator owns the beneficiary record)
  const expiresAt = computeBillExpiry(category || "", paymentItemName || null);
  const splitDelivery = deriveBillDelivery({
    category: category || "", billerName: displayBillerName,
    paymentItemName: paymentItemName || null, amount, reference,
    vfdResponse: vfdData as Record<string, unknown> | null,
  });
  await db.from("vfd_sandbox_bill_receipts").insert({
    request_payload: consumeBillPayRequest(reference),
    delivery_type: splitDelivery.delivery_type,
    delivery_token: splitDelivery.delivery_token,
    delivery_units: splitDelivery.delivery_units,
    delivery_status: splitDelivery.delivery_status,
    delivery_detail: splitDelivery.delivery_detail,
    user_id: split.creator_id,
    reference,
    category: category || "Other",
    biller_id: canonicalBillerId,
    biller_name: displayBillerName,
    payment_item_name: paymentItemName || null,
    customer_id: customerId,
    phone_number: phoneNumber || null,
    amount,
    convenience_fee: 0,
    status: "completed",
    expires_at: expiresAt,
    raw_response: { via: "splitpay", split_id: split.id, vfd: vfdData, validation: validationAudit(splitValidation) },
  });

  // Note: per-share debits are already recorded in vfd_sandbox_transactions by handlePaySplit
  // for each participant (including the creator). The bill delivery itself is recorded in
  // vfd_sandbox_bill_receipts above — no extra wallet transaction needed here.

  // Notify creator + every paid participant so each gets an in-app popup of the successful bill delivery
  const { data: paidForNotify } = await db
    .from("vfd_sandbox_split_participants")
    .select("user_id")
    .eq("split_id", split.id)
    .eq("status", "paid");
  const recipientIds = new Set<string>([split.creator_id, ...((paidForNotify || []).map((p: any) => p.user_id))]);
  const deliveryTitle = "Bill delivered";
  const deliveryMsg = splitDelivery.delivery_token
    ? `₦${amount.toLocaleString()} ${displayBillerName} delivered to ${customerId}. Token: ${splitDelivery.delivery_token}`
    : `₦${amount.toLocaleString()} ${displayBillerName} delivered to ${customerId}. Ref: ${reference}`;
  for (const rid of recipientIds) {
    await sendNotification(rid, deliveryTitle, deliveryMsg, "bill_payment");
  }

  // Reconciliation: verify each paid participant has a wallet tx row, and the receipt was written.
  await reconcileSplitPayments(split, { reference, expectReceipt: true });

  return { delivered: true, reference, biller_name: displayBillerName, customer_id: customerId, amount };
}

async function queueSplitBillSettlement(split: Record<string, any>): Promise<{ queued: boolean; status: string; message: string }> {
  const db = getSupabaseAdmin();
  // Allow reclaiming a row stuck in "processing" for >2 minutes (background task killed mid-flight).
  const staleCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: claimed, error } = await db.from("vfd_sandbox_splits")
    .update({ settlement_status: "processing", updated_at: new Date().toISOString() })
    .eq("id", split.id)
    .or(`settlement_status.is.null,settlement_status.in.(pending,failed),and(settlement_status.eq.processing,updated_at.lt.${staleCutoff})`)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[queueSplitBillSettlement] claim failed", error);
    return { queued: false, status: "error", message: "Bill delivery could not be queued" };
  }
  if (!claimed) {
    return { queued: false, status: split.settlement_status || "processing", message: "Bill delivery is already in progress" };
  }

  const settlementPromise = settleSplitBill(claimed).catch(async (e) => {
    console.error("[queueSplitBillSettlement] background settlement failed", e);
    await db.from("vfd_sandbox_splits").update({
      settlement_status: "failed",
      settlement_completed_at: new Date().toISOString(),
      settlement_failure_reason: e instanceof Error ? e.message : "Background bill delivery failed",
    }).eq("id", split.id);
  });

  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(settlementPromise);

  return { queued: true, status: "processing", message: "Bill delivery is processing; success notification will appear when delivered." };
}

/**
 * Recovery sweep: a fully-paid bill SplitPay whose background settlement was
 * killed mid-flight stays stuck on settlement_status="processing" forever
 * (nothing retries it unless somebody happens to open the split detail page).
 * This cron-callable sweep re-queues every such split — and retries failures —
 * so the bill always gets delivered.
 */
async function handleRecoverStuckSplitSettlements(): Promise<Response> {
  const db = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data: candidates, error } = await db
    .from("vfd_sandbox_splits")
    .select("*")
    .is("settlement_completed_at", null)
    .not("bill_metadata", "is", null)
    .in("status", ["completed", "active"])
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(25);

  if (error) {
    console.error("[recoverStuckSplits] query failed", error);
    return jsonResponse({ error: "Recovery sweep failed" }, 500);
  }

  const results: Array<Record<string, unknown>> = [];
  for (const split of candidates || []) {
    const fullyPaid = split.status === "completed"
      || Number(split.paid_count || 0) >= Number(split.split_count || 0);
    if (!fullyPaid) continue;
    const st = split.settlement_status;
    if (st && !["processing", "pending", "failed"].includes(st)) continue;

    console.warn(`[recoverStuckSplits] re-settling split=${split.id} status=${st}`);
    try {
      const outcome = await settleSplitBill({ ...split, settlement_status: "processing" });
      results.push({ split_id: split.id, delivered: outcome.delivered, reference: outcome.reference, message: outcome.message });
    } catch (e) {
      console.error(`[recoverStuckSplits] split=${split.id} failed`, e);
      await db.from("vfd_sandbox_splits").update({
        settlement_status: "failed",
        settlement_completed_at: new Date().toISOString(),
        settlement_failure_reason: e instanceof Error ? e.message : "Recovery sweep failed",
      }).eq("id", split.id);
      results.push({ split_id: split.id, delivered: false, message: "Recovery sweep failed" });
    }
  }

  return jsonResponse({ success: true, scanned: (candidates || []).length, recovered: results });
}


// Verify every paid participant has a vfd_sandbox_transactions row; backfill if missing.
// If expectReceipt, verify a bill receipt exists for the delivery reference.
async function reconcileSplitPayments(
  split: Record<string, any>,
  opts: { reference?: string; expectReceipt?: boolean } = {},
): Promise<string[]> {
  const db = getSupabaseAdmin();
  const splitId = split.id;
  const issues: string[] = [];

  const { data: paidParticipants } = await db
    .from("vfd_sandbox_split_participants")
    .select("user_id, amount, status")
    .eq("split_id", splitId)
    .eq("status", "paid");

  const storedFeePerPerson = Number(split.fee_per_person);
  for (const p of paidParticipants || []) {
    const ref = `splitpay-${splitId}-${p.user_id}`;
    const { data: existing } = await db
      .from("vfd_sandbox_transactions")
      .select("id")
      .eq("reference", ref)
      .maybeSingle();
    if (existing) continue;

    const shareAmt = Number(p.amount);
    let feeShare = 0;
    if (storedFeePerPerson === 0) {
      feeShare = p.user_id === split.creator_id ? Number(split.platform_fee || 0) : 0;
    } else {
      feeShare = storedFeePerPerson;
    }
    const totalDebit = shareAmt + feeShare;
    const payerLabel = split.bill_metadata
      ? `SplitPay (Bill): ${split.title}`
      : `SplitPay: ${split.title}`;
    await db.from("vfd_sandbox_transactions").insert({
      user_id: p.user_id,
      transaction_type: "debit",
      amount: totalDebit,
      description: feeShare > 0
        ? `${payerLabel} — share ₦${shareAmt.toLocaleString()} + fee ₦${feeShare.toLocaleString()} (reconciled)`
        : `${payerLabel} — share ₦${shareAmt.toLocaleString()} (reconciled)`,
      reference: ref,
      status: "completed",
    });
    issues.push(`backfilled wallet tx for ${p.user_id}`);
  }

  if (opts.expectReceipt && opts.reference) {
    const { data: receipt } = await db
      .from("vfd_sandbox_bill_receipts")
      .select("id")
      .eq("reference", opts.reference)
      .maybeSingle();
    if (!receipt) issues.push(`missing bill receipt for ${opts.reference}`);
  }

  if (issues.length) console.warn("[reconcileSplitPayments]", splitId, issues);
  return issues;
}

async function handlePaySplit(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const splitId = body.split_id as string;

  const { data: split } = await db.from("vfd_sandbox_splits").select("*").eq("id", splitId).single();
  if (!split) return jsonResponse({ error: "Split not found" }, 404);
  if (split.status !== "active") return jsonResponse({ error: "Split is not active" }, 400);

  // PRODUCTION PARITY: enforce expiry on pay
  if (split.expiry_date && new Date(split.expiry_date) < new Date()) {
    return jsonResponse({ error: "Split has expired" }, 400);
  }

  let { data: participant } = await db.from("vfd_sandbox_split_participants")
    .select("*").eq("split_id", splitId).eq("user_id", userId).maybeSingle();

  // Auto-enroll the split creator if they are not yet a participant (legacy splits)
  if (!participant && split.creator_id === userId) {
    const { data: ensured } = await db.from("vfd_sandbox_split_participants")
      .upsert(
        { split_id: splitId, user_id: userId, amount: Number(split.per_person_amount) },
        { onConflict: "split_id,user_id" },
      )
      .select("*").maybeSingle();
    participant = ensured || participant;
  }

  if (!participant) return jsonResponse({ error: "Not a participant" }, 400);
  if (participant.status === "paid") {
    const { data: activeParticipants } = await db.from("vfd_sandbox_split_participants")
      .select("status").eq("split_id", splitId).in("status", ["pending", "paid"]);
    const paidCount = (activeParticipants || []).filter(p => p.status === "paid").length;
    const activeCount = (activeParticipants || []).length;
    const allPaid = paidCount >= Math.min(split.split_count, activeCount);
    if (allPaid && split.bill_metadata && !["completed", "processing"].includes(split.settlement_status || "")) {
      const billDelivery = await queueSplitBillSettlement(split);
      return jsonResponse({ data: { paid: true, already_paid: true, all_paid: true, bill_delivery: billDelivery } });
    }
    return jsonResponse({ error: "Already paid" }, 400);
  }
  if (participant.status === "declined") return jsonResponse({ error: "You have declined this split" }, 400);

  // Use participant's own stored amount (supports unequal splits where creator covers a custom share)
  const amount = Number(participant.amount);
  const storedFeePerPerson = Number(split.fee_per_person);
  // When fee_per_person is 0, the creator absorbs the entire platform fee (bills/custom splits).
  // Otherwise, the legacy behaviour: each participant pays their proportional fee share.
  let feeShare: number;
  if (storedFeePerPerson === 0) {
    feeShare = userId === split.creator_id ? Number(split.platform_fee || SPLITPAY_SERVICE_FEE) : 0;
  } else {
    feeShare = storedFeePerPerson || (Math.ceil((SPLITPAY_SERVICE_FEE / split.split_count) * 100) / 100);
  }
  const totalDebit = amount + feeShare;


  // Ledger-backed: bill share + fee share move from wallet into the split holding account,
  // so a later cancellation/removal can release the exact same funds back.
  const debited = await ledgerSplitPay(userId, splitId, totalDebit, `splitpay-${splitId}-${userId}`, {
    split_title: split.title, bill_share: amount, fee_share: feeShare,
  });
  if (!debited) return jsonResponse({ error: `Insufficient available balance. Need ₦${totalDebit.toLocaleString()} (₦${amount.toLocaleString()} share${feeShare > 0 ? ` + ₦${feeShare.toLocaleString()} fee` : ""})` }, 400);

  await db.from("vfd_sandbox_split_participants").update({
    status: "paid", paid_at: new Date().toISOString(),
  }).eq("id", participant.id);

  await db.from("vfd_sandbox_split_transactions").insert({
    split_id: splitId, user_id: userId, amount: totalDebit,
  });

  // Record in general wallet transaction history so the payer sees it in their feed.
  const payerLabel = split.bill_metadata
    ? `SplitPay (Bill): ${split.title}`
    : `SplitPay: ${split.title}`;
  await db.from("vfd_sandbox_transactions").insert({
    user_id: userId,
    transaction_type: "debit",
    amount: totalDebit,
    description: feeShare > 0
      ? `${payerLabel} — share ₦${amount.toLocaleString()} + fee ₦${feeShare.toLocaleString()}`
      : `${payerLabel} — share ₦${amount.toLocaleString()}`,
    reference: `splitpay-${splitId}-${userId}`,
    status: "completed",
  });


  // Production parity: count active/pending participants (exclude declined) for completion check
  const { data: activeParticipants } = await db.from("vfd_sandbox_split_participants")
    .select("status").eq("split_id", splitId).in("status", ["pending", "paid"]);
  
  const paidCount = (activeParticipants || []).filter(p => p.status === "paid").length;
  const activeCount = (activeParticipants || []).length;
  
  const updates: Record<string, unknown> = { paid_count: paidCount, updated_at: new Date().toISOString() };

  let allPaid = false;
  // Production parity: complete when paid count >= required count (active participants, not split_count)
  if (paidCount >= Math.min(split.split_count, activeCount)) {
    updates.status = "completed";
    allPaid = true;
  }
  await db.from("vfd_sandbox_splits").update(updates).eq("id", splitId);

  // If all paid, simulate merchant settlement
  if (allPaid && split.merchant_account_name) {
    await db.from("vfd_sandbox_splits").update({
      settlement_status: "completed",
      settlement_reference: `split-merchant-${splitId}`,
      settlement_completed_at: new Date().toISOString(),
    }).eq("id", splitId);

    await sendNotification(split.creator_id, "SplitPay Complete!",
      `All participants have paid for "${split.title}". Settlement sent to ${split.merchant_account_name}.`,
      "split_completed");

    // Sweep the SplitPay service fee into the Vestara pool/revenue account.
    const merchantFee = Number(split.platform_fee || 0);
    if (merchantFee > 0) {
      const { data: mFee, error: mFeeErr } = await db.rpc("vestara_split_fee_to_revenue", {
        _split_id: splitId,
        _amount: merchantFee,
        _reference: `split-merchant-${splitId}-FEE`,
        _initiated_by: split.creator_id,
        _metadata: { origin: "split_merchant_settlement" },
      });
      if (mFeeErr || (mFee && (mFee as any).success === false)) {
        console.error(`[handlePaySplit] fee sweep failed split=${splitId}`, mFeeErr || mFee);
      }
    }

    await reconcileSplitPayments(split, { expectReceipt: false });
  }


  let billDelivery: any = null;
  if (allPaid && split.bill_metadata) {
    // Immediate confirmation to the creator the moment the last contributor pays —
    // independent of how long the actual VFD bill-delivery takes in the background.
    if (split.creator_id !== userId) {
      await sendNotification(split.creator_id, "SplitPay fully funded",
        `All ${paidCount} contributors paid for "${split.title}". Delivering the bill now…`,
        "split_payment");
    }
    // Bill-payment SplitPay: queue delivery so a slow VFD bills endpoint cannot hold the payer request open.
    billDelivery = await queueSplitBillSettlement(split);
  } else if (!allPaid && split.creator_id !== userId) {
    // Notify creator of incremental payment
    await sendNotification(split.creator_id, "SplitPay Payment Received",
      `A participant just paid their share of "${split.title}" (${paidCount}/${split.split_count} paid).`,
      "split_payment");
  }

  return jsonResponse({ data: { paid: true, amount: totalDebit, bill_share: amount, fee_share: feeShare, all_paid: allPaid, bill_delivery: billDelivery } });
}

// SplitPay: creator (or Vestara admin) covers every outstanding share so the bill can complete.
// The payer's wallet funds each pending share; once all shares are settled the normal
// bill-payment / merchant settlement flow runs exactly as if each participant had paid.
async function handleCoverSplitShares(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const splitId = body.split_id as string;

  const { data: split } = await db.from("vfd_sandbox_splits").select("*").eq("id", splitId).single();
  if (!split) return jsonResponse({ error: "Split not found" }, 404);
  if (split.status !== "active") return jsonResponse({ error: "Split is not active" }, 400);

  let allowed = split.creator_id === userId;
  if (!allowed) {
    const { data: isAdmin } = await db.rpc("is_any_admin", { _user_id: userId });
    allowed = Boolean(isAdmin);
  }
  if (!allowed) return jsonResponse({ error: "Only the split creator can cover outstanding shares" }, 403);

  const { data: pending } = await db.from("vfd_sandbox_split_participants")
    .select("*").eq("split_id", splitId).eq("status", "pending");
  if (!pending || pending.length === 0) return jsonResponse({ error: "There are no outstanding shares on this split" }, 400);

  const covered: Array<{ participant_id: string; amount: number }> = [];
  for (const p of pending) {
    const amount = Number(p.amount);
    const reference = `splitpay-cover-${splitId}-${p.id}`;
    const debited = await ledgerSplitPay(userId, splitId, amount, reference, {
      split_title: split.title, bill_share: amount, fee_share: 0,
      covered_for_user: p.user_id, covered_by: userId,
    });
    if (!debited) {
      return jsonResponse({
        error: `Insufficient available balance to cover the outstanding ₦${amount.toLocaleString()} share.`,
        data: { covered },
      }, 400);
    }

    await db.from("vfd_sandbox_split_participants")
      .update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", p.id);
    await db.from("vfd_sandbox_split_transactions").insert({ split_id: splitId, user_id: userId, amount });
    await db.from("vfd_sandbox_transactions").insert({
      user_id: userId,
      transaction_type: "debit",
      amount,
      description: `SplitPay: covered outstanding share of ₦${amount.toLocaleString()} for "${split.title}"`,
      reference,
      status: "completed",
    });
    covered.push({ participant_id: p.id, amount });
  }

  const { data: activeParticipants } = await db.from("vfd_sandbox_split_participants")
    .select("status").eq("split_id", splitId).in("status", ["pending", "paid"]);
  const paidCount = (activeParticipants || []).filter((p) => p.status === "paid").length;
  const activeCount = (activeParticipants || []).length;
  const allPaid = paidCount >= Math.min(split.split_count, activeCount);

  await db.from("vfd_sandbox_splits").update({
    paid_count: paidCount,
    status: allPaid ? "completed" : split.status,
    updated_at: new Date().toISOString(),
  }).eq("id", splitId);

  let billDelivery: any = null;
  if (allPaid) {
    const fresh = { ...split, paid_count: paidCount, status: "completed" };
    if (split.bill_metadata) {
      billDelivery = await queueSplitBillSettlement(fresh);
    } else if (split.merchant_account_name) {
      await db.from("vfd_sandbox_splits").update({
        settlement_status: "completed",
        settlement_reference: `split-merchant-${splitId}`,
        settlement_completed_at: new Date().toISOString(),
      }).eq("id", splitId);
      const merchantFee = Number(split.platform_fee || 0);
      if (merchantFee > 0) {
        await db.rpc("vestara_split_fee_to_revenue", {
          _split_id: splitId,
          _amount: merchantFee,
          _reference: `split-merchant-${splitId}-FEE`,
          _initiated_by: split.creator_id,
          _metadata: { origin: "split_merchant_settlement_covered" },
        });
      }
      await reconcileSplitPayments(fresh, { expectReceipt: false });
    }
    await sendNotification(split.creator_id, "SplitPay fully funded",
      `Outstanding shares on "${split.title}" were covered. Delivering the bill now…`, "split_payment");
  }

  return jsonResponse({ data: { covered, count: covered.length, all_paid: allPaid, bill_delivery: billDelivery } });
}


// SplitPay: Decline
async function handleDeclineSplit(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const splitId = body.split_id as string;

  const { data: participant } = await db.from("vfd_sandbox_split_participants")
    .select("*").eq("split_id", splitId).eq("user_id", userId).maybeSingle();
  if (!participant) return jsonResponse({ error: "Not a participant" }, 400);
  if (participant.status === "paid") return jsonResponse({ error: "Cannot decline after payment" }, 400);

  await db.from("vfd_sandbox_split_participants").update({ status: "declined" }).eq("id", participant.id);

  return jsonResponse({ data: { declined: true } });
}

// SplitPay: Cancel (creator only, refunds paid participants)
async function handleCancelSplit(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const splitId = body.split_id as string;

  const { data: split } = await db.from("vfd_sandbox_splits").select("*").eq("id", splitId).single();
  if (!split) return jsonResponse({ error: "Split not found" }, 404);
  if (split.creator_id !== userId) return jsonResponse({ error: "Only the creator can cancel" }, 400);
  if (split.status === "completed") return jsonResponse({ error: "Cannot cancel completed split" }, 400);

  // Refund paid participants (amount + fee share)
  const { data: paidParticipants } = await db.from("vfd_sandbox_split_participants")
    .select("*").eq("split_id", splitId).eq("status", "paid");

  let refundedCount = 0;
  const storedFeePerPerson = Number(split.fee_per_person);
  for (const p of paidParticipants || []) {
    const feeShare = storedFeePerPerson === 0
      ? (p.user_id === split.creator_id ? Number(split.platform_fee || SPLITPAY_SERVICE_FEE) : 0)
      : (storedFeePerPerson || (Math.ceil((SPLITPAY_SERVICE_FEE / split.split_count) * 100) / 100));
    const refundAmount = Number(p.amount) + feeShare;
    const refunded = await ledgerSplitRefund(
      p.user_id, splitId, refundAmount,
      `splitpay-${splitId}-${p.user_id}-REFUND`,
      { reason: "split_cancelled", split_title: split.title },
    );
    if (!refunded) continue;
    refundedCount++;
    await sendNotification(p.user_id, "SplitPay Refund",
      `"${split.title}" has been cancelled. ₦${refundAmount.toLocaleString()} has been refunded.`,
      "split_refund");
  }

  await db.from("vfd_sandbox_splits").update({
    status: "cancelled", updated_at: new Date().toISOString(),
  }).eq("id", splitId);

  return jsonResponse({ data: { cancelled: true, refunded_count: refundedCount } });
}

// SplitPay: Remove participant (creator only)
async function handleRemoveSplitParticipant(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const splitId = body.split_id as string;
  const participantUserId = body.participant_user_id as string;

  const { data: split } = await db.from("vfd_sandbox_splits").select("*").eq("id", splitId).single();
  if (!split) return jsonResponse({ error: "Split not found" }, 404);
  if (split.creator_id !== userId) return jsonResponse({ error: "Only the creator can remove participants" }, 400);
  if (participantUserId === split.creator_id) return jsonResponse({ error: "The split creator cannot be removed — they are always part of the split." }, 400);
  if (split.status !== "active") return jsonResponse({ error: "Can only manage active splits" }, 400);

  const { data: participant } = await db.from("vfd_sandbox_split_participants")
    .select("*").eq("split_id", splitId).eq("user_id", participantUserId).maybeSingle();
  if (!participant) return jsonResponse({ error: "Participant not found" }, 400);

  // Refund if already paid (creator-absorbed-fee splits: invitee paid 0 fee)
  if (participant.status === "paid") {
    const storedFeePerPerson = Number(split.fee_per_person);
    const feeShare = storedFeePerPerson === 0
      ? (participantUserId === split.creator_id ? Number(split.platform_fee || SPLITPAY_SERVICE_FEE) : 0)
      : (storedFeePerPerson || (Math.ceil((SPLITPAY_SERVICE_FEE / split.split_count) * 100) / 100));
    const refundAmount = Number(participant.amount) + feeShare;
    const refunded = await ledgerSplitRefund(
      participantUserId, splitId, refundAmount,
      `splitpay-${splitId}-${participantUserId}-REFUND`,
      { reason: "participant_removed", split_title: split.title },
    );
    if (!refunded) return jsonResponse({ error: "Could not refund this participant. Please try again." }, 400);
    await db.from("vfd_sandbox_splits").update({
      paid_count: Math.max(0, split.paid_count - 1),
      updated_at: new Date().toISOString(),
    }).eq("id", splitId);
  }

  await db.from("vfd_sandbox_split_participants").delete().eq("id", participant.id);

  await sendNotification(participantUserId, "Removed from SplitPay",
    `You have been removed from "${split.title}".`,
    "split_removed");

  return jsonResponse({ data: { removed: true } });
}

// SplitPay: Invite a specific user (creator only) — pre-adds them as a pending participant
async function handleInviteSplitMember(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const splitId = body.split_id as string;
  const inviteeId = body.invitee_id as string;
  if (!splitId || !inviteeId) return jsonResponse({ error: "split_id and invitee_id required" }, 400);

  const { data: split } = await db.from("vfd_sandbox_splits").select("*").eq("id", splitId).single();
  if (!split) return jsonResponse({ error: "Split not found" }, 404);
  if (split.creator_id !== userId) return jsonResponse({ error: "Only the creator can invite participants" }, 403);
  if (split.status !== "active") return jsonResponse({ error: "Split is not active" }, 400);
  if (inviteeId === userId) return jsonResponse({ error: "You're already in this split" }, 400);

  const { data: existing } = await db.from("vfd_sandbox_split_participants")
    .select("id, status").eq("split_id", splitId).eq("user_id", inviteeId).maybeSingle();
  if (existing) return jsonResponse({ data: { already_invited: true } });

  const { count } = await db.from("vfd_sandbox_split_participants")
    .select("*", { count: "exact", head: true }).eq("split_id", splitId).in("status", ["pending", "paid"]);

  // Auto-grow capacity if creator is inviting past the cap and no one has paid yet.
  if (count && count >= split.split_count) {
    const { count: paidCount } = await db.from("vfd_sandbox_split_participants")
      .select("*", { count: "exact", head: true }).eq("split_id", splitId).eq("status", "paid");
    if (paidCount && paidCount > 0) {
      return jsonResponse({ error: `Split is full (${count}/${split.split_count} slots taken). Someone has already paid, so capacity is locked. Remove a pending participant to invite more.` }, 400);
    }
    const newCount = count + 1;
    const newPerPerson = Math.ceil((Number(split.total_amount) / newCount) * 100) / 100;
    const newFeePerPerson = split.fee_per_person > 0
      ? Math.ceil((Number(split.platform_fee) / newCount) * 100) / 100
      : 0;
    const { error: capErr } = await db.from("vfd_sandbox_splits").update({
      split_count: newCount,
      per_person_amount: newPerPerson,
      fee_per_person: newFeePerPerson,
    }).eq("id", splitId);
    if (capErr) return jsonResponse({ error: `Could not grow split capacity: ${capErr.message}` }, 500);
    // Re-price existing pending participants so everyone owes the same fair share.
    await db.from("vfd_sandbox_split_participants").update({ amount: newPerPerson })
      .eq("split_id", splitId).eq("status", "pending");
    split.split_count = newCount;
    split.per_person_amount = newPerPerson;
    split.fee_per_person = newFeePerPerson;
  }

  const { error } = await db.from("vfd_sandbox_split_participants").insert({
    split_id: splitId, user_id: inviteeId, amount: Number(split.per_person_amount), status: "pending",
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  const { data: inviter } = await db.from("profiles").select("full_name, username").eq("id", userId).maybeSingle();
  const inviterName = inviter?.username ? `@${inviter.username}` : inviter?.full_name || "Someone";
  await sendNotification(inviteeId, "SplitPay Invite",
    `${inviterName} invited you to split "${split.title}" — your share is ₦${Number(split.per_person_amount).toLocaleString()}.`,
    "split_invite", splitId);

  return jsonResponse({ data: { invited: true } });
}

// SplitPay: Get detail
async function handleGetSplitDetail(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const splitId = body.split_id as string;
  if (!splitId) return jsonResponse({ error: "split_id required" }, 400);

  const { data: split } = await db.from("vfd_sandbox_splits").select("*").eq("id", splitId).single();
  if (!split) return jsonResponse({ error: "Split not found" }, 404);

  const { data: myParticipant } = await db.from("vfd_sandbox_split_participants")
    .select("id").eq("split_id", splitId).eq("user_id", userId).maybeSingle();
  const isInsider =
    split.creator_id === userId || !!myParticipant || (await isPlatformAdmin(userId));

  if (!isInsider) {
    // Splits are joinable by link: expose only the minimum needed to decide to join.
    return jsonResponse({
      data: {
        split: {
          id: split.id,
          title: split.title,
          description: split.description,
          total_amount: split.total_amount,
          amount_per_person: split.amount_per_person,
          split_count: split.split_count,
          paid_count: split.paid_count,
          status: split.status,
          expiry_date: split.expiry_date,
          created_at: split.created_at,
        },
        participants: [],
        transactions: [],
        preview: true,
      },
    });
  }

  // Self-heal: if a bill SplitPay is fully paid but stuck in "processing"/"failed"/null for >2 min,
  // re-queue the bill delivery so the creator + contributors eventually get their success popup.
  const isFullyPaid = split.status === "completed" || Number(split.paid_count || 0) >= Number(split.split_count || 0);
  const settlementStuck = !split.settlement_completed_at
    && ["processing", "failed", null, undefined].includes(split.settlement_status as any);
  const ageMs = split.updated_at ? Date.now() - new Date(split.updated_at).getTime() : Infinity;
  if (isFullyPaid && split.bill_metadata && settlementStuck && ageMs > 2 * 60 * 1000) {
    await queueSplitBillSettlement(split);
  }


  const { data: participants } = await db.from("vfd_sandbox_split_participants")
    .select("*").eq("split_id", splitId);

  const { data: transactions } = await db.from("vfd_sandbox_split_transactions")
    .select("*").eq("split_id", splitId).order("created_at", { ascending: false });

  const nameMap = await fetchProfileNames([
    ...(participants || []).map((p: { user_id: string }) => p.user_id),
    ...(transactions || []).map((t: { user_id?: string }) => t.user_id || ""),
  ]);

  return jsonResponse({
    data: {
      split,
      participants: attachNames(participants, nameMap),
      transactions: attachNames(transactions, nameMap),
    },
  });
}

// =============================================
// ASSOCIATION HANDLERS
// =============================================

async function handleCreateAssociation(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const name = body.name as string;
  const description = (body.description as string) || null;
  const maxMembers = Math.min(Math.max(Number(body.max_members) || 50, 5), 200);
  const signaturesUrl = (body.signatures_url as string) || null;
  const requestLetterUrl = (body.request_letter_url as string) || null;
  const executiveIdsUrl = (body.executive_ids_url as string) || null;

  if (!name?.trim()) return jsonResponse({ error: "Association name is required" }, 400);
  if (!signaturesUrl || !requestLetterUrl || !executiveIdsUrl) {
    return jsonResponse({ error: "All three documents (signatures list, request letter, executive IDs) are required" }, 400);
  }

  const { data: assoc, error } = await db.from("vfd_sandbox_associations").insert({
    name: name.trim(), description, admin_id: userId,
    max_members: maxMembers, member_count: 1,
    status: "active",
    approval_status: "pending",
    signatures_url: signaturesUrl,
    request_letter_url: requestLetterUrl,
    executive_ids_url: executiveIdsUrl,
  }).select().single();
  if (error) return jsonResponse({ error: error.message }, 500);

  await db.from("vfd_sandbox_association_memberships").insert({
    association_id: assoc.id, user_id: userId, role: "admin",
  });

  await db.from("vfd_sandbox_association_wallets").insert({
    association_id: assoc.id, available_balance: 0,
  });

  return jsonResponse({ data: assoc });
}

async function handleListAssociations(userId: string) {
  const db = getSupabaseAdmin();

  // Public list: only approved associations
  const { data: approved } = await db.from("vfd_sandbox_associations")
    .select("*").eq("status", "active").eq("approval_status", "approved")
    .order("created_at", { ascending: false });

  // My memberships (any approval status — I might be admin of a pending one)
  const { data: memberships } = await db.from("vfd_sandbox_association_memberships")
    .select("association_id, role").eq("user_id", userId);
  const myIds = (memberships || []).map((m: { association_id: string }) => m.association_id);

  let mine: unknown[] = [];
  if (myIds.length > 0) {
    const { data } = await db.from("vfd_sandbox_associations")
      .select("*").in("id", myIds).order("created_at", { ascending: false });
    mine = data || [];
  }

  // Pending invites for this user
  const { data: invites } = await db.from("vfd_sandbox_association_invites")
    .select("id, association_id, inviter_id, created_at, vfd_sandbox_associations(id,name,description,member_count,max_members,approval_status)")
    .eq("invitee_id", userId).eq("status", "pending");

  return jsonResponse({ all: approved || [], mine, invites: invites || [] });
}

async function handleJoinAssociation(userId: string, body: Record<string, unknown>) {
  // Direct join is invite-only now: this endpoint requires an accepted invite OR a valid invite to consume.
  const db = getSupabaseAdmin();
  const associationId = body.association_id as string;
  const role = ((body.role as string) === "exco") ? "exco" : "member";
  if (!associationId) return jsonResponse({ error: "association_id required" }, 400);

  const { data: assoc } = await db.from("vfd_sandbox_associations").select("*").eq("id", associationId).single();
  if (!assoc) return jsonResponse({ error: "Association not found" }, 404);
  if (assoc.status !== "active") return jsonResponse({ error: "Association is not active" }, 400);
  if (assoc.approval_status !== "approved") return jsonResponse({ error: "Association is awaiting platform approval" }, 400);
  if (assoc.member_count >= assoc.max_members) return jsonResponse({ error: "Association is full" }, 400);

  // Must have a pending invite
  const { data: invite } = await db.from("vfd_sandbox_association_invites")
    .select("*").eq("association_id", associationId).eq("invitee_id", userId).eq("status", "pending").maybeSingle();
  if (!invite) return jsonResponse({ error: "You must be invited by the association admin to join" }, 403);

  const { data: existing } = await db.from("vfd_sandbox_association_memberships")
    .select("id").eq("association_id", associationId).eq("user_id", userId).maybeSingle();
  if (existing) {
    await db.from("vfd_sandbox_association_invites").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", invite.id);
    return jsonResponse({ data: { joined: true, already_member: true } });
  }

  const { error } = await db.from("vfd_sandbox_association_memberships").insert({
    association_id: associationId, user_id: userId, role,
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  await db.from("vfd_sandbox_association_invites").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", invite.id);

  await db.from("vfd_sandbox_associations").update({
    member_count: assoc.member_count + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", associationId);

  // Notify admin
  if (assoc.admin_id !== userId) {
    await sendNotification(assoc.admin_id, "New Association Member",
      `A new ${role} has joined "${assoc.name}".`,
      "association_joined");
  }

  return jsonResponse({ data: { joined: true, role } });
}

async function handleGetAssociationDetail(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const associationId = body.association_id as string;
  if (!associationId) return jsonResponse({ error: "association_id required" }, 400);

  const { data: assoc } = await db.from("vfd_sandbox_associations").select("*").eq("id", associationId).single();
  if (!assoc) return jsonResponse({ error: "Association not found" }, 404);

  const { data: wallet } = await db.from("vfd_sandbox_association_wallets")
    .select("available_balance").eq("association_id", associationId).maybeSingle();

  const { data: members } = await db.from("vfd_sandbox_association_memberships")
    .select("user_id, role, joined_at").eq("association_id", associationId).order("joined_at");

  const isMember = (members || []).some((m: { user_id: string }) => m.user_id === userId);

  // Only members can see contributions ledger / chat
  const { data: contributions } = isMember
    ? await db.from("vfd_sandbox_association_contributions")
        .select("*").eq("association_id", associationId).order("created_at", { ascending: false }).limit(100)
    : { data: [] };

  const nameMap = await fetchProfileNames([
    ...(members || []).map((m: { user_id: string }) => m.user_id),
    ...((contributions as { user_id: string }[] | null) || []).map((c) => c.user_id),
  ]);

  // Smart summary (members only)
  let summary: Record<string, number> | null = null;
  if (isMember) {
    const totalInflow = ((contributions as { amount: number }[] | null) || []).reduce((s, c) => s + Number(c.amount), 0);
    const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const inflow30 = ((contributions as { amount: number; created_at: string }[] | null) || [])
      .filter(c => new Date(c.created_at).getTime() >= last30)
      .reduce((s, c) => s + Number(c.amount), 0);
    summary = {
      total_inflow: totalInflow,
      inflow_last_30_days: inflow30,
      // outflow tracking would need a payouts table; for now expose 0
      total_outflow: 0,
      contributor_count: new Set(((contributions as { user_id: string }[] | null) || []).map(c => c.user_id)).size,
    };
  }

  return jsonResponse({
    data: {
      ...assoc,
      wallet_balance: wallet?.available_balance || 0,
      members: attachNames(members, nameMap),
      contributions: attachNames(contributions as { user_id?: string }[] | null, nameMap),
      is_member: isMember,
      summary,
    },
  });
}

async function handleContributeAssociation(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const associationId = body.association_id as string;
  const amount = Number(body.amount);
  const narration = (body.narration as string) || null;

  if (!associationId) return jsonResponse({ error: "association_id required" }, 400);
  if (!amount || amount < 100) return jsonResponse({ error: "Minimum contribution is ₦100" }, 400);

  const { data: assoc } = await db.from("vfd_sandbox_associations").select("*").eq("id", associationId).single();
  if (!assoc) return jsonResponse({ error: "Association not found" }, 404);
  if (assoc.status !== "active") return jsonResponse({ error: "Association is not active" }, 400);
  if (assoc.approval_status !== "approved") return jsonResponse({ error: "Association is awaiting platform approval" }, 400);

  let { data: membership } = await db.from("vfd_sandbox_association_memberships")
    .select("id").eq("association_id", associationId).eq("user_id", userId).maybeSingle();
  if (assoc.admin_id === userId) {
    const { data: ensuredMembership } = await db.from("vfd_sandbox_association_memberships")
      .upsert({ association_id: associationId, user_id: userId, role: "admin" }, { onConflict: "association_id,user_id" })
      .select("id").maybeSingle();
    membership = ensuredMembership || membership;
  }
  if (!membership) return jsonResponse({ error: "You must be a member to contribute" }, 403);

  const debited = await ledgerDebitWallet(
    userId, amount, `assoc-contrib-${associationId}-${userId}-${Date.now()}`,
    { source: "association_contribution", association_id: associationId },
  );
  if (!debited) {
    const avail = await getAvailableBalance(userId);
    return jsonResponse({ error: `Insufficient balance. Available: ₦${avail.toLocaleString()}` }, 400);
  }

  const { data: wallet } = await db.from("vfd_sandbox_association_wallets")
    .select("*").eq("association_id", associationId).single();
  await db.from("vfd_sandbox_association_wallets").update({
    available_balance: Number(wallet!.available_balance) + amount,
    updated_at: new Date().toISOString(),
  }).eq("association_id", associationId);

  await db.from("vfd_sandbox_association_contributions").insert({
    association_id: associationId, user_id: userId, amount, narration,
  });

  // Notify admin (skip if contributor is admin)
  if (assoc.admin_id !== userId) {
    await sendNotification(assoc.admin_id, "Association Contribution",
      `A member contributed ₦${amount.toLocaleString()} to "${assoc.name}".`,
      "association_contribution");
  }

  return jsonResponse({ data: { contributed: true, amount } });
}

// =============================================
// ASSOCIATION INVITES + CHAT
// =============================================

async function handleInviteAssocMember(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const associationId = body.association_id as string;
  const inviteeId = body.invitee_id as string;
  if (!associationId || !inviteeId) return jsonResponse({ error: "association_id and invitee_id required" }, 400);

  const { data: assoc } = await db.from("vfd_sandbox_associations").select("*").eq("id", associationId).single();
  if (!assoc) return jsonResponse({ error: "Association not found" }, 404);
  if (assoc.admin_id !== userId) return jsonResponse({ error: "Only the association admin can invite members" }, 403);
  if (assoc.member_count >= assoc.max_members) return jsonResponse({ error: "Association is full" }, 400);

  const { data: existing } = await db.from("vfd_sandbox_association_memberships")
    .select("id").eq("association_id", associationId).eq("user_id", inviteeId).maybeSingle();
  if (existing) return jsonResponse({ error: "User is already a member" }, 400);

  const { data: existingInvite } = await db.from("vfd_sandbox_association_invites")
    .select("id, status").eq("association_id", associationId).eq("invitee_id", inviteeId).maybeSingle();
  if (existingInvite?.status === "pending") return jsonResponse({ error: "User already has a pending invite" }, 400);

  if (existingInvite) {
    await db.from("vfd_sandbox_association_invites").update({
      status: "pending", inviter_id: userId, responded_at: null, created_at: new Date().toISOString(),
    }).eq("id", existingInvite.id);
  } else {
    await db.from("vfd_sandbox_association_invites").insert({
      association_id: associationId, inviter_id: userId, invitee_id: inviteeId,
    });
  }

  await sendNotification(inviteeId, "Association Invite",
    `You've been invited to join "${assoc.name}". Open Vestara to accept.`,
    "association_invite");

  return jsonResponse({ data: { invited: true } });
}

async function handleRespondAssocInvite(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const inviteId = body.invite_id as string;
  const accept = body.accept as boolean;
  const role = ((body.role as string) === "exco") ? "exco" : "member";

  const { data: invite } = await db.from("vfd_sandbox_association_invites").select("*").eq("id", inviteId).single();
  if (!invite) return jsonResponse({ error: "Invite not found" }, 404);
  if (invite.invitee_id !== userId) return jsonResponse({ error: "Not your invite" }, 403);
  if (invite.status !== "pending") return jsonResponse({ error: "Invite already responded to" }, 400);

  if (!accept) {
    await db.from("vfd_sandbox_association_invites").update({
      status: "declined", responded_at: new Date().toISOString(),
    }).eq("id", inviteId);
    return jsonResponse({ data: { declined: true } });
  }

  // Accept: reuse handleJoinAssociation logic but with the role from this call.
  return await handleJoinAssociation(userId, { association_id: invite.association_id, role });
}

async function handleListAssocChat(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const associationId = body.association_id as string;
  if (!associationId) return jsonResponse({ error: "association_id required" }, 400);

  const { data: membership } = await db.from("vfd_sandbox_association_memberships")
    .select("id").eq("association_id", associationId).eq("user_id", userId).maybeSingle();
  if (!membership) return jsonResponse({ error: "Members only" }, 403);

  const { data: msgs } = await db.from("vfd_sandbox_association_chat")
    .select("*").eq("association_id", associationId).order("created_at", { ascending: true }).limit(200);

  const nameMap = await fetchProfileNames((msgs || []).map((m: { user_id: string }) => m.user_id));
  return jsonResponse({ data: attachNames(msgs, nameMap) });
}

async function handlePostAssocChat(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const associationId = body.association_id as string;
  const message = (body.message as string || "").trim();
  if (!associationId || !message) return jsonResponse({ error: "association_id and message required" }, 400);
  if (message.length > 2000) return jsonResponse({ error: "Message too long (max 2000 chars)" }, 400);

  const { data: membership } = await db.from("vfd_sandbox_association_memberships")
    .select("id").eq("association_id", associationId).eq("user_id", userId).maybeSingle();
  if (!membership) return jsonResponse({ error: "Members only" }, 403);

  const { data: msg, error } = await db.from("vfd_sandbox_association_chat").insert({
    association_id: associationId, user_id: userId, message, message_type: "text",
  }).select().single();
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ data: msg });
}

// Admin: list pending associations for review
async function handleAdminListPendingAssoc(userId: string) {
  const db = getSupabaseAdmin();
  // Verify caller is platform admin
  const { data: hasRole } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!hasRole) return jsonResponse({ error: "Admin access required" }, 403);

  const { data } = await db.from("vfd_sandbox_associations")
    .select("*").eq("approval_status", "pending").order("created_at", { ascending: false });

  const nameMap = await fetchProfileNames((data || []).map((a: { admin_id: string }) => a.admin_id));
  const enriched = (data || []).map((a: { admin_id: string }) => ({ ...a, admin_name: nameMap[a.admin_id] }));
  return jsonResponse({ data: enriched });
}

// Admin: one-off cash sweep of a SplitPay service fee into the corporate pool.
// Used to back-fill fees that were recognised as revenue internally before the
// funding transfer started including them, so bank vs ledger reconciles.
async function handleAdminSweepSplitFee(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  // "system" = trusted cron caller, already authenticated by CRON_SECRET.
  if (userId !== "system" && !(await isPlatformAdmin(userId))) {
    return jsonResponse({ error: "Admin access required" }, 403);
  }

  const billReference = String(body.bill_reference || "").trim();
  const amount = Number(body.amount || 0);
  if (!billReference || !(amount > 0)) {
    return jsonResponse({ error: "bill_reference and a positive amount are required" }, 400);
  }

  const { data: split } = await db
    .from("vfd_sandbox_splits")
    .select("id, creator_id, platform_fee")
    .eq("settlement_reference", billReference)
    .maybeSingle();
  const creatorId = (split?.creator_id as string | null) || (body.creator_id as string | null);
  if (!creatorId) {
    return jsonResponse({ error: "Could not resolve the split creator for that reference" }, 404);
  }

  const sweepRef = `${billReference}-FEE-SWEEP`;
  const { data: already } = await db
    .from("vfd_transaction_events")
    .select("id")
    .eq("reference", `${sweepRef}-FUND`)
    .eq("event_type", "bill_settlement_funding_confirmed")
    .maybeSingle();
  if (already) {
    return jsonResponse({ success: true, already_swept: true, reference: `${sweepRef}-FUND` });
  }

  const funding = await fundBillsSettlement({
    reference: sweepRef,
    amount,
    userId: creatorId,
    origin: "split_fee_backfill_sweep",
  });

  if (!funding.confirmed) {
    return jsonResponse({
      error: funding.error || "Fee sweep could not be confirmed",
      code: funding.code,
      reference: funding.reference,
    }, 502);
  }

  return jsonResponse({
    success: true,
    reference: funding.reference,
    amount,
    message: `₦${amount} swept from the creator's NUBAN to the corporate pool.`,
  });
}


// Admin: approve / reject association
async function handleAdminReviewAssoc(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { data: hasRole } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!hasRole) return jsonResponse({ error: "Admin access required" }, 403);

  const associationId = body.association_id as string;
  const decision = body.decision as string; // "approve" | "reject"
  const reason = (body.reason as string) || null;
  if (!associationId || !decision) return jsonResponse({ error: "association_id and decision required" }, 400);
  if (!["approve", "reject"].includes(decision)) return jsonResponse({ error: "decision must be 'approve' or 'reject'" }, 400);

  const newStatus = decision === "approve" ? "approved" : "rejected";
  const { data: assoc, error } = await db.from("vfd_sandbox_associations").update({
    approval_status: newStatus,
    rejection_reason: decision === "reject" ? reason : null,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
  }).eq("id", associationId).select().single();
  if (error) return jsonResponse({ error: error.message }, 500);

  await sendNotification(assoc.admin_id,
    decision === "approve" ? "Association Approved" : "Association Rejected",
    decision === "approve"
      ? `Your association "${assoc.name}" has been approved. You can now invite members.`
      : `Your association "${assoc.name}" was rejected. ${reason || "Please contact support."}`,
    decision === "approve" ? "association_approved" : "association_rejected");

  return jsonResponse({ data: assoc });
}

// Generate a short-lived signed URL for a private association doc (admin panel preview)
async function handleAdminAssocDocUrl(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { data: hasRole } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!hasRole) return jsonResponse({ error: "Admin access required" }, 403);

  const path = body.path as string;
  if (!path) return jsonResponse({ error: "path required" }, 400);

  const { data, error } = await db.storage.from("sandbox-association-docs").createSignedUrl(path, 60 * 60); // 1 hour
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data: { url: data.signedUrl } });
}

// =============================================
// BILLS PAYMENT (VFD BaaS)
// =============================================

const VFD_BILLS_BASE_TEST = "https://api-devapps.vfdbank.systems/vtech-bills/api/v2/billspaymentstore";
const VFD_BILLS_BASE_LIVE = "https://api-apps.vfdbank.systems/vtech-bills/api/v2/billspaymentstore";
const VFD_BILLS_PAY_TIMEOUT_MS = 25_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 25_000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await vfdFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getVfdAccessToken(): Promise<string | null> {
  // VFD credentials live exclusively on the static-IP gateway. Never mint a
  // token from this function or fall back to a direct VFD authentication call.
  return await getGatewayAccessToken();
}

function getBillsBase(): string {
  const mode = (Deno.env.get("VFD_MODE") || "sandbox").toLowerCase();
  return mode === "production" || mode === "live" ? VFD_BILLS_BASE_LIVE : VFD_BILLS_BASE_TEST;
}

// ===========================================================================
// BILLS SETTLEMENT FUNDING (real money movement BEFORE /pay)
//
// VFD debits our settlement position (the corporate pool) when they process a
// bill. Each bill therefore performs a REAL VFD intra transfer from the
// CUSTOMER'S OWN NUBAN into the pool for that exact bill, using the crash-safe
// pattern proven in vfd-banking's admin_move_savings_to_subaccount:
// deterministic pre-claimed reference + independent verification via
// /transactions?reference=, never trusting a status code (98 != success).
//
// No balance-sufficiency read is used: the pool is funded BY this request, so
// concurrent bills cannot both pass a stale shared-balance check.
//
// ASSUMPTION (flagged): only the BILL AMOUNT is transferred to the pool, not
// the convenience fee. The convenience fee is Vestara/biller revenue collected
// from the customer's wallet and is not part of what VFD debits for the vend.
// ===========================================================================
const VFD_WALLET_BASE_TEST = "https://api-devapps.vfdbank.systems/vtech-wallet/api/v2/wallet2";
const VFD_WALLET_BASE_LIVE = "https://api-apps.vfdbank.systems/vtech-wallet/api/v2/wallet2";

function getWalletBase(): string {
  const mode = (Deno.env.get("VFD_MODE") || "sandbox").toLowerCase();
  return mode === "production" || mode === "live" ? VFD_WALLET_BASE_LIVE : VFD_WALLET_BASE_TEST;
}

// Confirmed Vestara corporate pool NUBAN (destination of bills funding).
const VFD_CORPORATE_POOL_NUBAN =
  Deno.env.get("VFD_CORPORATE_POOL_NUBAN") || "1047279595";
// Account VFD debits for bills — the corporate pool itself (1047279595).
// If VFD later issues a dedicated bills float account, set this env var and
// customer transfers are routed there instead; no other change is needed.
const VFD_BILLS_SETTLEMENT_NUBAN =
  Deno.env.get("VFD_BILLS_SETTLEMENT_NUBAN") || VFD_CORPORATE_POOL_NUBAN;

async function walletRequest(
  endpoint: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  query?: Record<string, string>,
): Promise<{ data: Record<string, unknown>; status: number }> {
  const token = await getVfdAccessToken();
  if (!token) return { data: { error: "VFD auth failed" }, status: 401 };
  const url = new URL(`${getWalletBase()}${endpoint}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const resp = await vfdFetch(url.toString(), {
    method,
    headers: { "Content-Type": "application/json", AccessToken: token },
    body: body && method === "POST" ? JSON.stringify(body) : undefined,
  });
  return { data: await safeJson(resp), status: resp.status };
}

async function transferSignature(fromAccount: string, toAccount: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(`${fromAccount}${toAccount}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Independent verification: a transfer counts as funded ONLY when VFD's own
// transaction record reports transactionStatus "00". Any pending / failed /
// unreadable envelope is treated as NOT funded.
async function verifyVfdTransfer(reference: string): Promise<{ confirmed: boolean; evidence: unknown }> {
  try {
    const { data } = await walletRequest("/transactions", "GET", undefined, { reference });
    const inner = (data?.data as Record<string, unknown>) ?? {};
    const txStatus = String(inner?.transactionStatus ?? inner?.status ?? data?.status ?? "").trim();
    const txMessage = String(inner?.transactionStatusMessage ?? data?.message ?? "");
    return {
      confirmed: txStatus === "00" && !/pending|fail|revers/i.test(txMessage),
      evidence: data,
    };
  } catch (e) {
    return { confirmed: false, evidence: { error: e instanceof Error ? e.message : String(e) } };
  }
}

type SettlementFunding = {
  confirmed: boolean;
  reference: string;
  code?: string;
  error?: string;
  evidence?: unknown;
  replayed?: boolean;
};

// Real per-transaction settlement funding: the CUSTOMER'S OWN VFD NUBAN is
// debited and the corporate pool (VFD_BILLS_SETTLEMENT_NUBAN, default
// 1047279595) is credited for the exact bill amount BEFORE /pay is called.
// No balance-sufficiency read, no shared-float assumption: each request funds
// the pool itself, atomically and independently verified via
// /transactions?reference= (VFD status 98 is NEVER treated as success).
async function fundBillsSettlement(params: {
  reference: string;
  amount: number;
  userId: string | null;
  origin: string;
}): Promise<SettlementFunding> {
  const db = getSupabaseAdmin();
  const fundingRef = `${params.reference}-FUND`;

  if (!VFD_BILLS_SETTLEMENT_NUBAN) {
    return {
      confirmed: false,
      reference: fundingRef,
      code: "BILLS_SETTLEMENT_NOT_CONFIGURED",
      error: "Bill payments are temporarily unavailable while our settlement account is being configured. No funds were debited.",
    };
  }
  if (!params.userId) {
    return {
      confirmed: false,
      reference: fundingRef,
      code: "SETTLEMENT_PAYER_UNKNOWN",
      error: "We could not identify the paying account for this bill. Your wallet was not debited.",
    };
  }

  // 1) Resolve the customer's own VFD NUBAN (the real source of funds).
  const { data: client } = await db
    .from("vfd_sandbox_clients")
    .select("vfd_account_number, metadata, full_name")
    .eq("user_id", params.userId)
    .maybeSingle();
  const customerNuban = (client?.vfd_account_number as string | null) || null;
  if (!customerNuban) {
    return {
      confirmed: false, reference: fundingRef, code: "CUSTOMER_NUBAN_MISSING",
      error: "Your bank account is not fully provisioned yet, so this bill cannot be paid. Your wallet was not debited.",
    };
  }
  if ((client?.metadata as Record<string, unknown> | null)?.virtual_nuban) {
    return {
      confirmed: false, reference: fundingRef, code: "CUSTOMER_NUBAN_VIRTUAL",
      error: "Your account is still on a temporary number, so funds cannot be moved for this bill yet. Your wallet was not debited.",
    };
  }
  if (customerNuban === VFD_BILLS_SETTLEMENT_NUBAN) {
    return {
      confirmed: false, reference: fundingRef, code: "SELF_TRANSFER_BLOCKED",
      error: "This payment could not be processed. Your wallet was not debited.",
    };
  }

  // 2) Pre-claim the deterministic reference BEFORE any outbound call, so a
  // crash mid-flight leaves a breadcrumb and a retry replays the SAME
  // reference (VFD rejects it as a duplicate instead of debiting twice).
  await db.from("vfd_transaction_events").insert({
    user_id: params.userId,
    reference: fundingRef,
    event_type: "bill_settlement_funding_claim",
    actor: "system",
    payload: {
      origin: params.origin,
      bill_reference: params.reference,
      amount: params.amount,
      from: customerNuban,
      to: VFD_BILLS_SETTLEMENT_NUBAN,
      claimed_at: new Date().toISOString(),
    },
  }).then(undefined, (e: unknown) => console.error("[bills][fund] pre-claim persist failed", e));

  // 3) Resumability: if this reference already settled, do not move money again.
  const prior = await verifyVfdTransfer(fundingRef);
  if (prior.confirmed) {
    return { confirmed: true, reference: fundingRef, evidence: prior.evidence, replayed: true };
  }

  // 4) Enquiries: customer (sender) and pool (beneficiary).
  const { data: fromEnq, status: fromStatus } = await walletRequest(
    "/account/enquiry", "GET", undefined, { accountNumber: customerNuban },
  );
  if (fromStatus !== 200 || fromEnq?.status !== "00") {
    return {
      confirmed: false, reference: fundingRef, code: "CUSTOMER_ENQUIRY_FAILED",
      error: "We could not reach your bank account. Your wallet was not debited. Please try again shortly.",
      evidence: fromEnq,
    };
  }
  // Beneficiary enquiry on the corporate pool. VFD's wallet2 /account/enquiry
  // resolves SUB-ACCOUNTS by accountNumber; the corporate/pool account itself
  // is not addressable that way and answers 01 "Account Not Found". For the
  // corporate account VFD returns its details when accountNumber is OMITTED
  // (the account tied to our credentials), so fall back to that.
  let { data: toEnq, status: toStatus } = await walletRequest(
    "/account/enquiry", "GET", undefined, { accountNumber: VFD_BILLS_SETTLEMENT_NUBAN },
  );
  if (toStatus !== 200 || toEnq?.status !== "00") {
    console.warn(
      `[bills][fund] pool enquiry by accountNumber failed (${String(toEnq?.status)}: ` +
      `${String(toEnq?.message)}) — retrying corporate self-enquiry`,
    );
    const self = await walletRequest("/account/enquiry", "GET", undefined, {});
    console.log(`[bills][fund][self-enquiry] ${JSON.stringify(self.data ?? {}).slice(0, 800)}`);
    const selfEnv = (self.data?.data as Record<string, unknown>) || {};
    const selfAcct = (selfEnv?.account as Record<string, unknown>) || selfEnv;
    const selfNuban = String(selfEnv?.accountNo ?? selfAcct?.accountNo ?? "");
    if (self.status === 200 && self.data?.status === "00" && (!selfNuban || selfNuban === VFD_BILLS_SETTLEMENT_NUBAN)) {
      toEnq = self.data;
      toStatus = self.status;
    } else {
      console.error(
        `[bills][fund] corporate self-enquiry mismatch: returned=${selfNuban || "none"} ` +
        `expected=${VFD_BILLS_SETTLEMENT_NUBAN} status=${String(self.data?.status)}`,
      );
    }
  }
  if (toStatus !== 200 || toEnq?.status !== "00") {
    return {
      confirmed: false, reference: fundingRef, code: "SETTLEMENT_DEST_ENQUIRY_FAILED",
      error: "We could not reach our settlement account. Your wallet was not debited. Please try again shortly.",
      evidence: toEnq,
    };
  }

  const fEnv = (fromEnq?.data as Record<string, unknown>) || {};
  const fAcct = (fEnv?.account as Record<string, unknown>) || fEnv;
  const tEnv = (toEnq?.data as Record<string, unknown>) || {};
  const tAcct = (tEnv?.account as Record<string, unknown>) || tEnv;
  const fromSavingsId = String(fAcct?.id ?? fEnv?.accountId ?? "");
  if (!fromSavingsId) {
    return {
      confirmed: false, reference: fundingRef, code: "CUSTOMER_ACCOUNT_ID_MISSING",
      error: "Your bank account details are incomplete. Your wallet was not debited.",
      evidence: fromEnq,
    };
  }

  // Beneficiary identity. Empty strings must NOT satisfy `??`, so coalesce on
  // "first non-empty". Env overrides win: the corporate pool's client/savings
  // ids are stable and VFD's enquiry does not always echo them.
  const firstNonEmpty = (...vals: unknown[]): string => {
    for (const v of vals) {
      const s = v === undefined || v === null ? "" : String(v).trim();
      if (s) return s;
    }
    return "";
  };
  const toClient = firstNonEmpty(
    Deno.env.get("VFD_POOL_CLIENT_NAME"), tEnv?.client, tAcct?.client, tEnv?.name, tAcct?.name,
  );
  const toClientId = firstNonEmpty(
    Deno.env.get("VFD_POOL_CLIENT_ID"), tEnv?.clientId, tAcct?.clientId,
  );
  const toSavingsId = firstNonEmpty(
    Deno.env.get("VFD_POOL_SAVINGS_ID"), tAcct?.id, tEnv?.accountId, tEnv?.id,
  );
  if (!toClient || !toClientId || !toSavingsId) {
    console.error(
      `[bills][fund] pool identity incomplete client="${toClient}" clientId="${toClientId}" ` +
      `savingsId="${toSavingsId}" enquiry=${JSON.stringify(toEnq ?? {}).slice(0, 500)}`,
    );
    return {
      confirmed: false, reference: fundingRef, code: "SETTLEMENT_DEST_IDENTITY_MISSING",
      error: "We could not reach our settlement account. Your wallet was not debited. Please try again shortly.",
      evidence: toEnq,
    };
  }

  const payload = {
    fromAccount: customerNuban,
    fromClientId: String(fEnv?.clientId ?? ""),
    fromClient: String(fEnv?.client ?? client?.full_name ?? ""),
    fromSavingsId,
    fromBvn: String(fEnv?.bvn ?? ""),
    toAccount: VFD_BILLS_SETTLEMENT_NUBAN,
    toBank: "999999",
    toClient,
    toClientId,
    toSavingsId,
    toSession: "",
    toBvn: String(tEnv?.bvn ?? ""),
    signature: await transferSignature(customerNuban, VFD_BILLS_SETTLEMENT_NUBAN),
    amount: String(params.amount),
    remark: `Bill settlement ${params.reference}`.slice(0, 60),
    transferType: "intra",
    reference: fundingRef,
    uniqueSenderAccountId: fromSavingsId,
  };


  console.log(`[bills][fund][request] ${JSON.stringify(payload)}`);
  const { data: transferResp } = await walletRequest("/transfer", "POST", payload);
  const vfdStatus = String(transferResp?.status ?? "");
  const vfdMessage = String(transferResp?.message ?? "");
  const duplicate = vfdStatus === "98" || /reference exist/i.test(vfdMessage);

  // Never trust the transfer response alone — confirm against VFD's own record.
  const verified = await verifyVfdTransfer(fundingRef);

  await db.from("vfd_transaction_events").insert({
    user_id: params.userId,
    reference: fundingRef,
    event_type: "bill_settlement_funding_result",
    actor: "system",
    payload: {
      origin: params.origin,
      bill_reference: params.reference,
      from: customerNuban,
      to: VFD_BILLS_SETTLEMENT_NUBAN,
      amount: params.amount,
      transfer_status: vfdStatus,
      transfer_message: vfdMessage,
      duplicate,
      verified: verified.confirmed,
      transfer_response: transferResp,
      tsq: verified.evidence,
    },
  }).then(undefined, (e: unknown) => console.error("[bills][fund] result persist failed", e));

  if (!verified.confirmed) {
    const insufficient = /insufficient|balance/i.test(vfdMessage);
    return {
      confirmed: false,
      reference: fundingRef,
      code: insufficient
        ? "CUSTOMER_INSUFFICIENT_FUNDS"
        : duplicate ? "SETTLEMENT_FUNDING_UNCONFIRMED" : "SETTLEMENT_FUNDING_FAILED",
      error: insufficient
        ? "You do not have enough money in your account for this bill. Nothing was debited — top up and try again."
        : duplicate
          ? "This payment was already submitted to the bank and has not settled yet. It is being tracked — nothing was debited twice."
          : (vfdMessage || "We could not move your funds for this bill, so it was not paid. Nothing was debited. Please try again."),
      evidence: { transfer: transferResp, tsq: verified.evidence },
    };
  }

  return { confirmed: true, reference: fundingRef, evidence: verified.evidence, replayed: duplicate };
}

async function safeJson(resp: Response): Promise<Record<string, unknown>> {
  try {
    const raw = await resp.text();
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function handleBillsCategories() {
  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);
  const resp = await vfdFetch(`${getBillsBase()}/billercategory`, { headers: { AccessToken: token } });
  const raw = await safeJson(resp);
  if (!resp.ok) {
    console.error(`[bills_categories] upstream_status=${resp.status}`, JSON.stringify(raw).slice(0, 500));
    return jsonResponse({ error: "The bill payment service is temporarily unavailable.", upstream_status: resp.status }, 502);
  }
  return jsonResponse({ data: raw });
}

async function handleBillsBillers(body: Record<string, unknown>) {
  const cat = body.categoryName as string || "";
  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);
  const url = cat ? `${getBillsBase()}/billerlist?categoryName=${encodeURIComponent(cat)}` : `${getBillsBase()}/billerlist`;
  const resp = await vfdFetch(url, { headers: { AccessToken: token } });
  const raw = await safeJson(resp) as Record<string, unknown> | null;
  console.log(`[bills_billers] cat=${cat} status=${resp.status} resp=`, JSON.stringify(raw)?.slice(0, 500));
  if (!resp.ok) {
    console.error(`[bills_billers] upstream_status=${resp.status} category=${cat}`);
    return jsonResponse({ error: "Billers could not be loaded right now.", upstream_status: resp.status }, 502);
  }

  // Normalize: VFD response shape is { status, message, data: [...] }; sometimes nested under data.data
  let billersList: unknown[] = [];
  const rawData = raw?.data;
  if (Array.isArray(rawData)) {
    billersList = rawData;
  } else if (rawData && typeof rawData === "object" && Array.isArray((rawData as Record<string, unknown>).data)) {
    billersList = (rawData as { data: unknown[] }).data;
  }

  // Always return a normalized envelope so the frontend has predictable access
  return jsonResponse({
    data: { data: billersList, status: raw?.status, message: raw?.message },
    raw,
    vfd_status: resp.status,
  });
}

async function handleBillsItems(body: Record<string, unknown>) {
  const { billerId, divisionId, productId } = body as { billerId: string; divisionId: string; productId: string };
  if (!billerId || !divisionId || !productId) return jsonResponse({ error: "billerId, divisionId, productId required" }, 400);
  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);
  const resp = await vfdFetch(
    `${getBillsBase()}/billerItems?billerId=${encodeURIComponent(billerId)}&divisionId=${encodeURIComponent(divisionId)}&productId=${encodeURIComponent(productId)}`,
    { headers: { AccessToken: token } }
  );
  return jsonResponse({ data: await safeJson(resp) });
}

// --- Backend customer-validation gate (source of truth for ALL pay paths) ---
// The frontend may validate for UX, but its verdict is never trusted: every
// path that reaches VFD /pay runs this first.
const VFD_BILLS_VALIDATE_TIMEOUT_MS = 15_000;

async function runVfdCustomerValidate(a: {
  customerId: string; divisionId: string; paymentItem: string; billerId: string; requestId: string;
}): Promise<{ ok: boolean; body: Record<string, unknown> | null }> {
  const token = await getVfdAccessToken();
  if (!token) return { ok: false, body: { message: "VFD auth failed" } };
  const url = `${getBillsBase()}/customervalidate?customerId=${encodeURIComponent(a.customerId)}` +
    `&divisionId=${encodeURIComponent(a.divisionId)}&paymentItem=${encodeURIComponent(a.paymentItem)}` +
    `&billerId=${encodeURIComponent(a.billerId)}`;
  const resp = await fetchWithTimeout(
    url,
    { headers: { AccessToken: token, "x-request-id": a.requestId } },
    VFD_BILLS_VALIDATE_TIMEOUT_MS,
  );
  const body = await safeJson(resp);
  return { ok: resp.ok, body };
}

/** Runs the policy + validation call and logs the outcome for reconciliation. */
async function gateBillPayment(args: {
  identity: BillIdentity;
  customerId: string; divisionId: string; paymentItem: string; billerId: string;
  paymentReference: string; origin: string;
}) {
  const result = await enforceBillCustomerValidation({
    identity: args.identity,
    customerId: args.customerId,
    divisionId: args.divisionId,
    paymentItem: args.paymentItem,
    billerId: args.billerId,
    paymentReference: args.paymentReference,
    validate: runVfdCustomerValidate,
  });
  const r = result.record;
  console.log(
    `[bills][validate] origin=${args.origin} ref=${args.paymentReference} family=${r.family} ` +
    `matched_by=${r.matched_by} required=${r.required} performed=${r.performed} passed=${r.passed} ` +
    `validation_request_id=${r.validation_request_id ?? "-"} status=${r.validation_status ?? "-"} ` +
    `biller=${r.biller_id ?? "-"} customer=${r.customer_id ?? "-"} at=${r.validated_at ?? "-"} ` +
    `message=${String(r.validation_message ?? "").slice(0, 160)}`,
  );
  return result;
}

/** Exposes the backend policy so the UI never keeps its own category list. */
function handleBillsValidationPolicy(body: Record<string, unknown>) {
  const policy = billCategoryRequiresValidation({
    category: (body.category as string) || null,
    billerId: (body.billerId as string) || null,
    billerName: (body.billerName as string) || null,
    paymentItemName: (body.paymentItemName as string) || null,
    productId: (body.productId as string) || null,
    divisionId: (body.divisionId as string) || null,
  });
  return jsonResponse({ data: policy });
}

/** Compact record persisted alongside the receipt for reconciliation. */
function validationAudit(r: ValidationRecord) {
  return {
    required: r.required,
    family: r.family,
    matched_by: r.matched_by,
    performed: r.performed,
    passed: r.passed,
    validation_request_id: r.validation_request_id,
    validation_status: r.validation_status,
    validation_message: r.validation_message,
    customer_name: r.customer_name,
    validated_at: r.validated_at,
    biller_id: r.biller_id,
    customer_id: r.customer_id,
    payment_reference: r.payment_reference,
  };
}


async function handleBillsValidate(body: Record<string, unknown>) {
  const { customerId, divisionId, paymentItem, billerId } = body as {
    customerId: string; divisionId: string; paymentItem: string; billerId: string;
  };
  if (!customerId || !divisionId || !paymentItem || !billerId) return jsonResponse({ error: "Missing validate fields" }, 400);
  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);
  const resp = await vfdFetch(
    `${getBillsBase()}/customervalidate?customerId=${encodeURIComponent(customerId)}&divisionId=${encodeURIComponent(divisionId)}&paymentItem=${encodeURIComponent(paymentItem)}&billerId=${encodeURIComponent(billerId)}`,
    { headers: { AccessToken: token } }
  );
  const data = await safeJson(resp) as Record<string, unknown>;
  // Production: return the biller's real verdict. Sandbox keeps the tolerance
  // so VFD test inputs ("Contact Admin") don't block the flow.
  const isProd = (Deno.env.get("VFD_MODE") || "sandbox").toLowerCase() === "production";
  if (isProd) return jsonResponse({ data });
  const normalized = data?.status === "00"
    ? data
    : { ...data, status: "00", message: "Customer validated (sandbox)", customerName: (data as Record<string, unknown>)?.customerName || "Sandbox Customer" };
  return jsonResponse({ data: normalized });
}

/**
 * VFD /pay requires a contact MSISDN on every bill payment. Resolve it from the
 * explicit input, then a phone-shaped customerId (airtime/data), then the
 * customer's registered phone number on their Vestara account.
 */
async function resolveBillMsisdn(
  userId: string,
  explicitPhone?: string | null,
  customerId?: string | null,
): Promise<string> {
  const clean = (v?: string | null) => String(v ?? "").replace(/[\s-]/g, "");
  const looksLikePhone = (v: string) => /^(0|234|\+234)?\d{10,13}$/.test(v);

  const direct = clean(explicitPhone);
  if (direct && looksLikePhone(direct)) return direct;

  const cust = clean(customerId);
  if (cust && looksLikePhone(cust)) return cust;

  try {
    const db = getSupabaseAdmin();
    const { data: client } = await db.from("vfd_sandbox_clients")
      .select("phone").eq("user_id", userId).maybeSingle();
    const fromClient = clean((client as { phone?: string } | null)?.phone);
    if (fromClient && looksLikePhone(fromClient)) return fromClient;

    const { data: profile } = await db.from("profiles")
      .select("phone").eq("id", userId).maybeSingle();
    const fromProfile = clean((profile as { phone?: string } | null)?.phone);
    if (fromProfile && looksLikePhone(fromProfile)) return fromProfile;
  } catch (e) {
    console.error("[bills] resolveBillMsisdn lookup failed", e);
  }
  return "";
}

// Convenience fee published by VFD on the biller list. Always resolved
// server-side from VFD (never trusted from the client) so the customer is
// debited exactly the fee the biller charges.
async function resolveConvenienceFee(category: string | null, billerId: string): Promise<number> {
  try {
    const token = await getVfdAccessToken();
    if (!token) return 0;
    const cat = (category || "").trim();
    const url = cat
      ? `${getBillsBase()}/billerlist?categoryName=${encodeURIComponent(cat)}`
      : `${getBillsBase()}/billerlist`;
    const resp = await vfdFetch(url, { headers: { AccessToken: token } });
    const raw = await safeJson(resp) as Record<string, unknown> | null;
    const rawData = raw?.data as unknown;
    let list: unknown[] = [];
    if (Array.isArray(rawData)) list = rawData;
    else if (rawData && typeof rawData === "object" && Array.isArray((rawData as Record<string, unknown>).data)) {
      list = (rawData as { data: unknown[] }).data;
    }
    const match = list.find((b) => String((b as Record<string, unknown>)?.id ?? "") === String(billerId));
    const fee = Number((match as Record<string, unknown> | undefined)?.convenienceFee ?? 0);
    return Number.isFinite(fee) && fee > 0 ? fee : 0;
  } catch (e) {
    console.error("[bills] resolveConvenienceFee failed", e);
    return 0;
  }
}

/**
 * Re-resolve the biller item from VFD immediately before /pay.
 *
 * billerId / divisionId / productId / paymentItem can be sent by the client
 * from a saved beneficiary or a cached catalogue page, and VFD rotates these
 * values. Vending with a stale item is a common cause of a bill that debits
 * and then never resolves. This call re-reads /billerItems and returns the
 * canonical values plus the item's amount rules.
 *
 * Fails CLOSED only when VFD answers and the item is genuinely absent; if VFD
 * is unreachable we keep the caller's values and log, so a catalogue outage
 * cannot block every payment.
 */
type FreshBillerItem = {
  reachable: boolean;
  found: boolean;
  billerId: string;
  divisionId: string;
  productId: string;
  paymentItem: string;
  paymentItemName: string | null;
  amountFixed: boolean;
  fixedAmount: number | null;
  minimumAmount: number | null;
  maximumAmount: number | null;
  raw: Record<string, unknown> | null;
};

async function resolveFreshBillerItem(a: {
  billerId: string; divisionId: string; productId: string; paymentItem: string;
}): Promise<FreshBillerItem> {
  const base: FreshBillerItem = {
    reachable: false, found: false,
    billerId: a.billerId, divisionId: a.divisionId, productId: a.productId,
    paymentItem: a.paymentItem, paymentItemName: null,
    amountFixed: false, fixedAmount: null, minimumAmount: null, maximumAmount: null,
    raw: null,
  };
  try {
    const token = await getVfdAccessToken();
    if (!token) return base;
    const resp = await fetchWithTimeout(
      `${getBillsBase()}/billerItems?billerId=${encodeURIComponent(a.billerId)}` +
      `&divisionId=${encodeURIComponent(a.divisionId)}&productId=${encodeURIComponent(a.productId)}`,
      { headers: { AccessToken: token } },
      VFD_BILLS_VALIDATE_TIMEOUT_MS,
    );
    const raw = await safeJson(resp) as Record<string, unknown>;
    if (!resp.ok) return { ...base, raw };
    const inner = (raw.data && typeof raw.data === "object" ? raw.data : {}) as Record<string, unknown>;
    const list: unknown[] = Array.isArray(inner.paymentitems)
      ? inner.paymentitems as unknown[]
      : Array.isArray(inner.paymentItems)
        ? inner.paymentItems as unknown[]
        : Array.isArray(raw.data) ? raw.data as unknown[] : [];
    const wanted = String(a.paymentItem).trim().toLowerCase();
    const item = (list as Array<Record<string, unknown>>).find((it) => {
      const candidates = [it?.id, it?.code, it?.paymentitemid, it?.paymentCode, it?.paymentitemname, it?.paymentItemName]
        .map((v) => String(v ?? "").trim().toLowerCase());
      return candidates.includes(wanted);
    });
    if (!item) return { ...base, reachable: true, raw };
    const num = (v: unknown) => {
      const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const fixedFlag = String(item.isAmountFixed ?? item.amountFixed ?? "").toLowerCase();
    return {
      reachable: true,
      found: true,
      billerId: String(item.billerid ?? item.billerId ?? a.billerId),
      divisionId: String(item.divisionId ?? item.division ?? a.divisionId),
      productId: String(item.productId ?? item.productid ?? a.productId),
      paymentItem: String(item.paymentCode ?? item.code ?? item.id ?? a.paymentItem),
      paymentItemName: (item.paymentitemname ?? item.paymentItemName) ? String(item.paymentitemname ?? item.paymentItemName) : null,
      amountFixed: fixedFlag === "true" || fixedFlag === "yes" || fixedFlag === "1",
      fixedAmount: num(item.amount),
      minimumAmount: num(item.minimumAmount ?? item.minAmount),
      maximumAmount: num(item.maximumAmount ?? item.maxAmount),
      raw,
    };
  } catch (e) {
    console.error("[bills][item] refresh failed", e instanceof Error ? e.message : String(e));
    return base;
  }
}

/**
 * Poll VFD /transactionStatus after /pay with backoff (30s, 2min, 5min) so a
 * bill that VFD resolves asynchronously does not sit "pending" in our DB until
 * the 10-minute cron sweep. Each pass reuses the reconciler, so settlement,
 * refund and ledger correction stay in one place.
 */
function scheduleBillTsqPolls(userId: string, reference: string) {
  const delays = [30_000, 90_000, 180_000]; // 30s, 2min, 5min from /pay
  const task = (async () => {
    for (const wait of delays) {
      await new Promise((r) => setTimeout(r, wait));
      try {
        const db = getSupabaseAdmin();
        const { data: row } = await db.from("vfd_sandbox_bill_receipts")
          .select("status, delivery_status").eq("reference", reference).maybeSingle();
        if (!row) return;
        if (row.status !== "pending" && row.delivery_status !== "pending") return;
        console.log(`[bills][tsq-poll] ref=${reference} re-checking after ${wait}ms`);
        await handleReconcilePendingBills(userId, { limit: 25 });
      } catch (e) {
        console.error(`[bills][tsq-poll] ref=${reference} failed`, e instanceof Error ? e.message : String(e));
      }
    }
  })();
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(task);
}

// ===========================================================================
// BILLER ID CANONICALISATION (Fix B)
//
// VFD renamed some biller IDs (MTN "2626" → "MTN_NIGERIA2"). Anything stored
// from an older session — beneficiaries, recurring bills, client payloads —
// can still carry the stale ID, which makes strict lookups (convenience fee,
// biller item refresh) silently miss. Every /pay path canonicalises the ID
// against a freshly pulled /billerlist before it is used or persisted.
// ===========================================================================
const LEGACY_BILLER_ID_ALIASES: Record<string, string> = {
  "2626": "MTN_NIGERIA2",
};

let billerListCache: { at: number; list: Array<Record<string, unknown>> } | null = null;

async function fetchBillerList(category: string | null): Promise<Array<Record<string, unknown>>> {
  const cat = (category || "").trim();
  if (!cat && billerListCache && Date.now() - billerListCache.at < 5 * 60_000) return billerListCache.list;
  try {
    const token = await getVfdAccessToken();
    if (!token) return [];
    const url = cat
      ? `${getBillsBase()}/billerlist?categoryName=${encodeURIComponent(cat)}`
      : `${getBillsBase()}/billerlist`;
    const resp = await vfdFetch(url, { headers: { AccessToken: token } });
    const raw = await safeJson(resp) as Record<string, unknown> | null;
    const rawData = raw?.data as unknown;
    let list: unknown[] = [];
    if (Array.isArray(rawData)) list = rawData;
    else if (rawData && typeof rawData === "object" && Array.isArray((rawData as Record<string, unknown>).data)) {
      list = (rawData as { data: unknown[] }).data;
    }
    const typed = list as Array<Record<string, unknown>>;
    if (!cat && typed.length) billerListCache = { at: Date.now(), list: typed };
    return typed;
  } catch (e) {
    console.error("[bills] fetchBillerList failed", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/** Returns the live billerlist ID for a possibly stale stored/sent biller ID. */
async function canonicalizeBillerId(
  billerId: string,
  category: string | null,
  billerName?: string | null,
): Promise<string> {
  const given = String(billerId || "").trim();
  if (!given) return given;
  const list = await fetchBillerList(category);
  if (!list.length) return LEGACY_BILLER_ID_ALIASES[given] || given;

  const ids = new Set(list.map((b) => String(b?.id ?? "")));
  if (ids.has(given)) return given;

  const alias = LEGACY_BILLER_ID_ALIASES[given];
  if (alias && ids.has(alias)) {
    console.warn(`[bills] biller id drift: "${given}" → "${alias}" (alias table)`);
    return alias;
  }
  // Last resort: unique name match against the live list.
  const wanted = String(billerName || "").trim().toLowerCase();
  if (wanted) {
    const matches = list.filter((b) => String(b?.name ?? "").trim().toLowerCase() === wanted);
    if (matches.length === 1) {
      const resolved = String(matches[0]?.id ?? "");
      console.warn(`[bills] biller id drift: "${given}" → "${resolved}" (name match "${wanted}")`);
      return resolved;
    }
  }
  console.warn(`[bills] biller id "${given}" not present in live billerlist and no alias found`);
  return given;
}

// ===========================================================================
// FIX A — VFD POOL DEBIT RECONCILIATION
//
// Internally a settled bill posts bills_hold → settlement for the FULL face
// amount. VFD's real pool debit is smaller (they retain a biller margin) and
// they separately debit a per-transaction CHRG. Both are real money events and
// were previously invisible. After settlement we read the pool's bank
// statement, find the two lines carrying our reference, and post:
//   (a) face − actual "Bill Payment" debit  → DEBIT settlement / CREDIT revenue
//   (b) the "CHRG/..." debit                → DEBIT vfd_charges_expense / CREDIT settlement
// via vestara_bill_reconcile_vfd_debit (idempotent on <ref>-VFDDISC/-VFDCHRG).
// ===========================================================================
type PoolDebitLines = { billDebit: number | null; charge: number; evidence: unknown };

async function fetchPoolDebitLines(reference: string): Promise<PoolDebitLines> {
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const { data } = await walletRequest("/account/transactions", "GET", undefined, {
    accountNo: VFD_BILLS_SETTLEMENT_NUBAN,
    // "bank" is the ledger view that carries the biller debit + CHRG lines.
    transactionType: "bank",
    startDate: `${fmt(start)} 00:00:00`,
    endDate: `${fmt(end)} 23:59:59`,
    page: "0",
    size: "100",
  });
  const inner = (data?.data as Record<string, unknown>) || {};
  const content = (inner?.content as Array<Record<string, unknown>>) || [];
  let billDebit: number | null = null;
  let charge = 0;
  const hits: Array<Record<string, unknown>> = [];
  for (const row of content) {
    const remarks = String(row?.remarks ?? "");
    if (!remarks.includes(reference)) continue;
    if (String(row?.transactionType ?? "").toUpperCase() !== "DEBIT") continue;
    const amt = Number(row?.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    hits.push(row);
    if (/^CHRG\b|^CHRG\//i.test(remarks)) charge += amt;
    else billDebit = (billDebit ?? 0) + amt;
  }
  return {
    billDebit: billDebit === null ? null : Math.round(billDebit * 100) / 100,
    charge: Math.round(charge * 100) / 100,
    evidence: hits,
  };
}

/**
 * Reconcile one settled bill against the pool statement.
 * Returns true once the correcting entries are posted.
 */
async function reconcileBillPoolDebit(params: {
  reference: string;
  faceAmount: number;
  origin: string;
}): Promise<{ reconciled: boolean; reason?: string; discount?: number; charge?: number }> {
  const db = getSupabaseAdmin();
  // Already reconciled? (idempotency guard before we spend a VFD call)
  const { data: existing } = await db
    .from("vestara_transactions")
    .select("reference")
    .in("reference", [`${params.reference}-VFDDISC`, `${params.reference}-VFDCHRG`]);
  if ((existing?.length ?? 0) > 0) return { reconciled: true, reason: "already" };

  const lines = await fetchPoolDebitLines(params.reference);
  if (lines.billDebit === null) return { reconciled: false, reason: "debit_not_posted_yet" };

  const { data, error } = await db.rpc("vestara_bill_reconcile_vfd_debit", {
    _reference: params.reference,
    _face_amount: params.faceAmount,
    _actual_debit: lines.billDebit,
    _charge_amount: lines.charge,
    _metadata: { origin: params.origin, statement_lines: lines.evidence },
  });
  const res = data as { success?: boolean; error?: string; discount?: number; charge?: number } | null;
  if (error || !res?.success) {
    console.error("[bills][recon] rpc failed", error || res?.error);
    return { reconciled: false, reason: res?.error || "rpc_failed" };
  }
  await db.from("vfd_transaction_events").insert({
    user_id: null,
    reference: `${params.reference}-VFDRECON`,
    event_type: "bill_pool_debit_reconciled",
    actor: "system",
    payload: {
      origin: params.origin,
      face_amount: params.faceAmount,
      actual_debit: lines.billDebit,
      charge: lines.charge,
      discount: Math.round((params.faceAmount - lines.billDebit) * 100) / 100,
      statement_lines: lines.evidence,
    },
  }).then(undefined, () => {});
  console.log(
    `[bills][recon] ref=${params.reference} face=${params.faceAmount} actual=${lines.billDebit} ` +
    `chrg=${lines.charge} discount=${Math.round((params.faceAmount - lines.billDebit) * 100) / 100}`,
  );
  return { reconciled: true, discount: res.discount, charge: res.charge };
}

/**
 * VFD posts the pool debit a beat after /pay returns, so the first read can
 * legitimately find nothing. Retry with backoff (20s, 1m, 5m, 15m) in the
 * background. If every attempt still misses (function evicted, long VFD lag),
 * the 10-minute bills cron sweep picks it up via
 * `reconcileOutstandingBillPoolDebits`, so nothing is dropped silently.
 */
function scheduleBillPoolReconciliation(reference: string, faceAmount: number, origin: string) {
  const delays = [20_000, 60_000, 300_000, 900_000];
  const task = (async () => {
    for (const wait of delays) {
      await new Promise((r) => setTimeout(r, wait));
      try {
        const res = await reconcileBillPoolDebit({ reference, faceAmount, origin });
        if (res.reconciled) return;
        console.log(`[bills][recon] ref=${reference} not on statement yet (${res.reason}) — will retry`);
      } catch (e) {
        console.error(`[bills][recon] ref=${reference} attempt failed`, e instanceof Error ? e.message : String(e));
      }
    }
    console.warn(`[bills][recon] ref=${reference} unreconciled after backoff — left to the cron sweep`);
  })();
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(task);
}

/**
 * Durable catch-up: every settled bill receipt from the last 3 days that has
 * no correcting entries yet is retried. Runs on the bills reconciler cron and
 * is callable on demand, so reconciliation never depends on one live request
 * surviving long enough to see the statement.
 */
async function reconcileOutstandingBillPoolDebits(limit = 50): Promise<{
  checked: number; reconciled: number; pending: number; details: unknown[];
}> {
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: receipts } = await db
    .from("vfd_sandbox_bill_receipts")
    .select("reference, amount, status, created_at")
    .eq("status", "completed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  let reconciled = 0;
  let pending = 0;
  const details: unknown[] = [];
  for (const r of receipts ?? []) {
    const reference = String(r.reference || "");
    if (!reference) continue;
    const res = await reconcileBillPoolDebit({
      reference, faceAmount: Number(r.amount ?? 0), origin: "cron_sweep",
    });
    if (res.reconciled) reconciled += 1; else pending += 1;
    details.push({ reference, ...res });
  }
  return { checked: receipts?.length ?? 0, reconciled, pending, details };
}



async function handleBillsPay(userId: string, body: Record<string, unknown>) {
  const { customerId, amount, phoneNumber } = body as {
    customerId: string; amount: string; phoneNumber?: string;
  };
  let { division, paymentItem, productId, billerId } = body as {
    division: string; paymentItem: string; productId: string; billerId: string;
  };
  if (!customerId || !amount || !division || !paymentItem || !productId || !billerId) {
    return jsonResponse({ error: "Missing required payment fields" }, 400);
  }
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) return jsonResponse({ error: "Invalid amount" }, 400);

  // --- Step 0: canonicalise the biller ID (Fix B) ------------------------------
  // Saved beneficiaries / recurring bills / older clients can still send an ID
  // VFD has renamed (e.g. MTN "2626" → "MTN_NIGERIA2"). Resolve it against the
  // live /billerlist before it is used for the item refresh, the convenience
  // fee lookup, the /pay payload or anything we persist.
  {
    const canonical = await canonicalizeBillerId(
      billerId, (body.category as string) || null, (body.billerName as string) || null,
    );
    if (canonical && canonical !== billerId) {
      console.warn(`[bills][pay] biller id normalised ${billerId} → ${canonical}`);
      billerId = canonical;
    }
  }

  // --- Step 1: refresh the biller item from VFD (never vend on stale values) --
  const fresh = await resolveFreshBillerItem({ billerId, divisionId: division, productId, paymentItem });
  console.log(
    `[bills][item] biller=${billerId} item=${paymentItem} reachable=${fresh.reachable} found=${fresh.found} ` +
    `fixed=${fresh.amountFixed} fixed_amount=${fresh.fixedAmount ?? "-"} min=${fresh.minimumAmount ?? "-"} max=${fresh.maximumAmount ?? "-"}`,
  );
  if (fresh.reachable && !fresh.found) {
    return jsonResponse({
      error: "This biller package is no longer available from the provider. Please reselect the biller and package, then try again.",
      code: "BILLER_ITEM_STALE",
    }, 400);
  }
  if (fresh.found) {
    billerId = fresh.billerId || billerId;
    division = fresh.divisionId || division;
    productId = fresh.productId || productId;
    paymentItem = fresh.paymentItem || paymentItem;
    if (fresh.amountFixed && fresh.fixedAmount && Math.abs(fresh.fixedAmount - numAmount) > 0.009) {
      return jsonResponse({
        error: `This package has a fixed price of ₦${fresh.fixedAmount.toLocaleString()}. Please pay exactly that amount.`,
        code: "BILLER_FIXED_AMOUNT",
        required_amount: fresh.fixedAmount,
      }, 400);
    }
    if (fresh.minimumAmount && numAmount < fresh.minimumAmount) {
      return jsonResponse({
        error: `${fresh.paymentItemName || "This biller"} requires a minimum of ₦${fresh.minimumAmount.toLocaleString()}.`,
        code: "BILLER_MINIMUM_AMOUNT",
        minimum: fresh.minimumAmount,
      }, 400);
    }
    if (fresh.maximumAmount && numAmount > fresh.maximumAmount) {
      return jsonResponse({
        error: `${fresh.paymentItemName || "This biller"} allows a maximum of ₦${fresh.maximumAmount.toLocaleString()}.`,
        code: "BILLER_MAXIMUM_AMOUNT",
        maximum: fresh.maximumAmount,
      }, 400);
    }
  }
  // Biller convenience fee is charged on top of the bill amount: the customer
  // is debited (bill + fee) while VFD's /pay only carries the bill amount.
  const convenienceFee = await resolveConvenienceFee((body.category as string) || null, billerId);
  const totalDebit = numAmount + convenienceFee;

  // Biller-specific rules published by VFD: IBEDC (Band A) will not process a
  // vend below ₦5,000, so reject it up-front instead of losing the money to a
  // failed purchase at the biller.
  const billerHay = `${billerId} ${(body.billerName as string) || ""} ${(body.paymentItemName as string) || ""}`.toLowerCase();
  if (/ibedc|ibadan/.test(billerHay) && numAmount < 5000) {
    return jsonResponse({
      error: "IBEDC requires a minimum purchase of ₦5,000. Please enter ₦5,000 or more.",
      code: "BILLER_MINIMUM_AMOUNT",
      minimum: 5000,
    }, 400);
  }



  const bal = await ensureBalanceRow(userId, true);
  const available = bal.total_balance - bal.locked_balance - bal.savings_balance;
  if (totalDebit > available) {
    const shortfall = Math.max(0, totalDebit - available);
    return jsonResponse({
      error: `Insufficient wallet balance. You need ₦${totalDebit.toLocaleString()}${convenienceFee > 0 ? ` (₦${numAmount.toLocaleString()} + ₦${convenienceFee.toLocaleString()} convenience fee)` : ""} but have ₦${available.toLocaleString()} available. Please fund your wallet with at least ₦${shortfall.toLocaleString()}.`,
      code: "INSUFFICIENT_BALANCE",
      required: totalDebit,
      convenience_fee: convenienceFee,
      available,
      shortfall,
    }, 400);
  }

  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);

  const reference = `vestara-bill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestId = crypto.randomUUID();
  const payCategory = ((body.category as string) || "").toLowerCase();
  void payCategory;
  // VFD's /pay spec lists phoneNumber as a required field for every bill, not
  // only telco items: it is the contact/delivery MSISDN the biller notifies.
  // Resolve in order: explicit input → phone-shaped customerId → the customer's
  // registered phone on their Vestara account.
  const resolvedPhone = await resolveBillMsisdn(userId, phoneNumber, customerId);
  // VFD documents phoneNumber as mandatory for Ikeja Electric (IKEDC).
  if (!resolvedPhone && /ikedc|ikeja/.test(billerHay)) {
    return jsonResponse({
      error: "Ikeja Electric requires a phone number for this payment. Please enter the customer's phone number.",
      code: "PHONE_NUMBER_REQUIRED",
    }, 400);
  }



  // --- Backend validation gate (never trusts the frontend's verdict) ---
  const payIdentity: BillIdentity = {
    category: (body.category as string) || null,
    billerId,
    billerName: (body.billerName as string) || null,
    paymentItemName: (body.paymentItemName as string) || null,
    productId,
    divisionId: division,
  };
  const gate = await gateBillPayment({
    identity: payIdentity,
    customerId, divisionId: division, paymentItem, billerId,
    paymentReference: reference, origin: "bills_pay",
  });
  if (!gate.allowed) {
    return jsonResponse({ error: gate.error, code: gate.code, validation: validationAudit(gate.record) }, 400);
  }
  const validationRecord = gate.record;

  // --- Step 8.5: move the customer's REAL money into the pool, BEFORE /pay --
  // A verified VFD intra transfer from the customer's own NUBAN to the
  // corporate pool for the bill amount. /pay is NEVER called unless this
  // transfer is independently confirmed via /transactions?reference=.
  const funding = await fundBillsSettlement({
    reference, amount: numAmount, userId, origin: "bills_pay",
  });
  if (!funding.confirmed) {
    console.error(`[bills][fund] ref=${reference} NOT FUNDED code=${funding.code} — /pay skipped`);
    return jsonResponse({
      error: funding.error,
      code: funding.code,
      data: { reference, funding_reference: funding.reference, evidence: funding.evidence },
    }, 503);
  }
  console.log(`[bills][fund] ref=${reference} funded=${funding.reference} replayed=${!!funding.replayed}`);

  // --- Step 8.6: reserve the customer's wallet funds (hold) ----------------
  // Sequenced AFTER confirmed settlement funding and BEFORE /pay. If the
  // biller declines, the hold is released back to the wallet.
  const dbHold = getSupabaseAdmin();
  const { data: hdData, error: hdErr } = await dbHold.rpc("vestara_bill_reserve", {
    _user_id: userId,
    _amount: totalDebit,
    _reference: reference,
    _metadata: {
      source: "bill_payment",
      biller_id: billerId,
      customer_id: customerId,
      division,
      product_id: productId,
      bill_amount: numAmount,
      convenience_fee: convenienceFee,
      settlement_funding_reference: funding.reference,
    },
  });
  const hdResult = hdData as { success?: boolean; error?: string } | null;
  if (hdErr || !hdResult?.success) {
    console.error("[bills] vestara_bill_reserve failed:", hdErr || hdResult);
    return jsonResponse(
      { error: "Bill payment could not be recorded. Please contact support.", details: hdErr?.message || hdResult?.error },
      500,
    );
  }




  // amount uses the validated numeric value (never the raw client string), and
  // `reference` is freshly generated per attempt — VFD rejects reused refs.
  const payBody: Record<string, string> = { customerId, amount: numAmount.toString(), division, paymentItem, productId, billerId, reference };
  if (resolvedPhone) payBody.phoneNumber = resolvedPhone;

  // Durable forensic trace of the exact outbound /pay request, written BEFORE
  // the call so it survives a timeout, crash, or log rotation.
  await recordBillPayRequest({
    reference, request_id: requestId, user_id: userId, origin: "bills_pay",
    url: `${getBillsBase()}/pay`, payload: payBody,
  });

  const resp = await fetchWithTimeout(
    `${getBillsBase()}/pay`,
    {
      method: "POST",
      headers: { AccessToken: token, "Content-Type": "application/json", "x-request-id": requestId },
      body: JSON.stringify(payBody),
    },
    VFD_BILLS_PAY_TIMEOUT_MS,
  );
  let data = await safeJson(resp);

  // In production every non-"00"/non-pending response is a genuine biller
  // failure — the wallet must NOT be debited and no artefact fabricated.
  // VFD "09" means the biller accepted but has not confirmed yet: re-query the
  // transaction once, and if still unresolved treat it as an accepted-pending
  // purchase (debited, delivery pending) — never as a hard failure.
  //
  // IMPORTANT: on /transactionStatus the envelope `status` only reports whether
  // the *lookup* succeeded ("00" = Successful Transaction Retrieval). The real
  // biller outcome lives in `data.transactionStatus`. Reading the envelope alone
  // marked pending purchases as delivered — always use the effective status.
  const isProduction = (Deno.env.get("VFD_MODE") || "sandbox").toLowerCase() === "production";
  let isPending = false;
  let effStatus = effectiveBillStatus(data as Record<string, unknown> | null);
  console.log(
    `[bills][pay] ref=${reference} request_id=${requestId} biller=${billerId} item=${paymentItem} ` +
    `amount=${numAmount} msisdn_sent=${resolvedPhone ? "yes" : "no"} http=${resp.status} ` +
    `status=${String(effStatus ?? "")} outcome=${classifyBillStatus(effStatus)} ` +
    `message=${String((data as Record<string, unknown>)?.message ?? "").slice(0, 160)}`,
  );

  let payOutcome = classifyBillStatus(effStatus);
  if (isProduction && (payOutcome === "pending" || payOutcome === "unknown")) {
    const lookup = await lookupVfdBillStatus(reference);
    const statusEff = effectiveBillStatus(lookup.body);
    const statusOutcome = classifyBillStatus(statusEff);
    if (lookup.lookup_ok && (statusOutcome === "success" || statusOutcome === "failed" || statusOutcome === "reversed")) {
      data = lookup.body as Record<string, unknown>;
      effStatus = statusEff;
      payOutcome = statusOutcome;
    } else {
      // Either still processing at the biller, or we could not reach VFD. Both
      // are held (not refunded, not settled) and left to the reconciler.
      isPending = true;
      payOutcome = "pending";
    }
    console.log(
      `[bills][pay] ref=${reference} request_id=${requestId} post_tsq lookup_ok=${lookup.lookup_ok} ` +
      `tsq_request_id=${lookup.request_id} status=${String(statusEff ?? "")} outcome=${payOutcome}`,
    );
  }
  const isSuccess = isProduction
    ? (payOutcome === "success" || isPending)
    : (resp.ok || effStatus === "00" || effStatus === "99" || !!data);


  if (isSuccess) {
    const db = getSupabaseAdmin();
    // The wallet hold was already placed at step 8.6, after settlement funding
    // was confirmed and before /pay. Here we only settle it.
    // Confirmed delivery → settle the hold to the settlement account now.
    let holdState = "held";
    let settledAt: string | null = null;
    if (!isPending) {
      // Fix D: the hold covers amount + convenience fee. Settlement receives
      // only the bill amount (the real bank movement); the fee is credited to
      // revenue as its own explicit leg.
      const { data: stData, error: stErr } = await db.rpc("vestara_bill_settle", {
        _reference: reference,
        _metadata: { biller_id: billerId, customer_id: customerId },
        _fee_amount: convenienceFee,
      });
      const stResult = stData as { success?: boolean; error?: string } | null;
      if (stErr || !stResult?.success) {
        console.error("[bills] vestara_bill_settle failed (left held, reconciler will retry):", stErr || stResult);
      } else {
        holdState = "settled";
        settledAt = new Date().toISOString();
        // Fix A: capture VFD's REAL pool debit (biller margin + CHRG) and post
        // the correcting entries once the statement shows the lines.
        scheduleBillPoolReconciliation(reference, numAmount, "bills_pay");
      }
    }

    // No cache mirroring here: vestara_bill_reserve posts through
    // vestara_post_transaction, which updates the displayed balance in the
    // same database transaction.


    const category = (body.category as string) || "";
    const billerName = (body.billerName as string) || billerId.toUpperCase();
    const paymentItemName = (body.paymentItemName as string) || null;
    const recurringBillId = (body.recurring_bill_id as string) || null;
    const description = convenienceFee > 0
      ? `Bill Payment: ${billerName} - ${customerId} (incl. ₦${convenienceFee.toLocaleString()} fee)`
      : `Bill Payment: ${billerName} - ${customerId}`;
    await db.from("vfd_sandbox_transactions").insert({
      user_id: userId, transaction_type: "debit", amount: totalDebit,
      description, reference, status: "completed",
    });

    // Receipt with expiry for subscription-based services
    const expiresAt = computeBillExpiry(category, paymentItemName);
    // Value delivery: prepaid meter token / recharge PIN / top-up confirmation.
    // The artefact must come from VFD — never synthesised. If /pay did not carry
    // it, re-query the biller transaction once before recording the receipt.
    let delivery = deriveBillDelivery({
      category, billerName, paymentItemName, amount: numAmount, reference,
      vfdResponse: data as Record<string, unknown> | null,
    });
    // Re-query whenever the artefact (meter token, recharge PIN, airtime
    // top-up token) is still missing — not just for electricity tokens.
    if (delivery.delivery_status === "pending" || !delivery.delivery_token) {
      const statusResp = await fetchVfdBillArtefact(reference);
      if (statusResp) {
        const retry = deriveBillDelivery({
          category, billerName, paymentItemName, amount: numAmount, reference,
          vfdResponse: statusResp,
        });
        if (retry.delivery_token) delivery = retry;
      }
    }
    if (isPending) {
      delivery = {
        ...delivery,
        delivery_status: "pending",
        delivery_detail: {
          ...delivery.delivery_detail,
          instruction: "The biller has accepted this purchase but has not confirmed delivery yet. It will update automatically once confirmed.",
        },
      };
    }
    // Provider trace kept on the receipt so any VFD dispute can be traced to the
    // exact request. No credentials or customer PII are stored here.
    delivery = {
      ...delivery,
      delivery_detail: {
        ...delivery.delivery_detail,
        vfd: {
          request_id: requestId,
          http_status: resp.status,
          status_code: effStatus,
          outcome: payOutcome,
          message: String((data as Record<string, unknown>)?.message ?? "").slice(0, 200),
          msisdn_sent: !!resolvedPhone,
        },
      },
    };


    await db.from("vfd_sandbox_bill_receipts").insert({
      request_payload: consumeBillPayRequest(reference),
      delivery_type: delivery.delivery_type,
      delivery_token: delivery.delivery_token,
      delivery_units: delivery.delivery_units,
      delivery_status: delivery.delivery_status,
      delivery_detail: delivery.delivery_detail,
      user_id: userId,
      reference,
      category: category || "Other",
      biller_id: billerId,
      biller_name: billerName,
      payment_item_name: paymentItemName,
      customer_id: customerId,
      phone_number: phoneNumber || null,
      amount: numAmount,
      convenience_fee: convenienceFee,
      status: isPending ? "pending" : "completed",
      expires_at: expiresAt,
      raw_response: { ...(data || {}), validation: validationAudit(validationRecord) },
      recurring_bill_id: recurringBillId,
      hold_state: holdState,
      held_at: new Date().toISOString(),
      settled_at: settledAt,
    });


    // Upsert beneficiary (auto-save) — last_used touch; preserve user-edited nickname on repeat pay
    if (category && billerId && customerId) {
      const { data: existingBene } = await db.from("vfd_sandbox_bill_beneficiaries")
        .select("id, nickname")
        .eq("user_id", userId).eq("biller_id", billerId).eq("customer_id", customerId)
        .maybeSingle();
      const nickname = existingBene?.nickname || `${billerName} • ${customerId.slice(-4)}`;
      await db.from("vfd_sandbox_bill_beneficiaries")
        .upsert({
          user_id: userId,
          nickname,
          category,
          biller_id: billerId,
          biller_name: billerName,
          division,
          product_id: productId,
          payment_item_code: paymentItem,
          payment_item_name: paymentItemName,
          customer_id: customerId,
          phone_number: phoneNumber || null,
          last_used_at: new Date().toISOString(),
        }, { onConflict: "user_id,biller_id,customer_id", ignoreDuplicates: false });

      // Prune: keep newest 20 per category, evict by oldest last_used_at
      const { data: catRows } = await db.from("vfd_sandbox_bill_beneficiaries")
        .select("id, last_used_at")
        .eq("user_id", userId).eq("category", category)
        .order("last_used_at", { ascending: false, nullsFirst: false });
      if (catRows && catRows.length > 20) {
        const toDelete = catRows.slice(20).map(r => r.id);
        await db.from("vfd_sandbox_bill_beneficiaries").delete().in("id", toDelete);
      }
    }

    const isAirtimeLike = /airtime|data/i.test(category) || /airtime|data/i.test(paymentItemName || "");
    const notifTitle = isPending
      ? (isAirtimeLike ? "Airtime purchase pending" : "Bill payment pending")
      : delivery.delivery_type === "token"
        ? (delivery.delivery_token ? "Electricity token delivered" : "Token pending from disco")
        : isAirtimeLike
          ? (delivery.delivery_token ? "Recharge PIN delivered" : "Airtime top-up successful")
          : "Bill payment successful";
    const notifBody = isPending
      ? `₦${numAmount.toLocaleString()} to ${billerName} (${customerId}) has been accepted but not yet confirmed by the biller. We'll notify you the moment it completes, or refund you if it fails. Ref: ${reference}`
      : delivery.delivery_token
        ? `₦${numAmount.toLocaleString()} paid to ${billerName} (${customerId}). ${isAirtimeLike ? "Recharge PIN" : "Token"}: ${delivery.delivery_token}${delivery.delivery_units ? ` • ${delivery.delivery_units}` : ""}`
        : delivery.delivery_type === "token"
          ? `₦${numAmount.toLocaleString()} paid to ${billerName} (${customerId}). Awaiting meter token from the disco. Ref: ${reference}`
          : `₦${numAmount.toLocaleString()} paid to ${billerName} (${customerId}). Ref: ${reference}`;
    await sendNotification(userId, notifTitle, notifBody, "bill_payment");

    // Async settlement at the biller: poll TSQ with backoff (30s/2min/5min)
    // instead of waiting for the 10-minute cron sweep.
    if (isPending) scheduleBillTsqPolls(userId, reference);

    return jsonResponse({ data: { status: "00", message: isPending ? "Purchase accepted — awaiting biller confirmation" : "Payment successful", pending: isPending, reference, receipt_expires_at: expiresAt, bill_amount: numAmount, convenience_fee: convenienceFee, total_debited: totalDebit, ...delivery } });
  }

  console.error(
    `[bills][pay] ref=${reference} request_id=${requestId} DECLINED biller=${billerId} item=${paymentItem} ` +
    `amount=${numAmount} msisdn_sent=${resolvedPhone ? "yes" : "no"} http=${resp.status} ` +
    `status=${String(effStatus ?? "")} outcome=${payOutcome} message=${String(data?.message ?? "").slice(0, 200)}`,
  );
  // The wallet hold was placed before /pay — release it so the customer is
  // made whole on a declined purchase.
  const { error: relErr } = await dbHold.rpc("vestara_bill_release", {
    _reference: reference,
    _metadata: { reason: "biller_declined", biller_id: billerId, customer_id: customerId },
  });
  if (relErr) console.error("[bills] vestara_bill_release failed after decline:", relErr);

  // Persist a failed receipt so every /pay attempt — including declines — has a
  // durable record of the exact request and VFD's raw response.
  try {
    await dbHold.from("vfd_sandbox_bill_receipts").insert({
      request_payload: consumeBillPayRequest(reference),
      user_id: userId,
      reference,
      category: (body.category as string) || "Other",
      biller_id: billerId,
      biller_name: (body.billerName as string) || billerId.toUpperCase(),
      payment_item_name: (body.paymentItemName as string) || null,
      customer_id: customerId,
      phone_number: phoneNumber || null,
      amount: numAmount,
      convenience_fee: convenienceFee,
      status: "failed",
      delivery_status: "failed",
      hold_state: "released",
      held_at: new Date().toISOString(),
      raw_response: {
        ...(data || {}),
        http_status: resp.status,
        effective_status: effStatus,
        outcome: payOutcome,
        request_id: requestId,
        validation: validationAudit(validationRecord),
      },
    });
  } catch (e) {
    console.error("[bills] failed-receipt insert failed", e instanceof Error ? e.message : String(e));
  }

  return jsonResponse({
    error: (data?.message as string) || "The biller could not complete this purchase. Your wallet was not debited. Please try again.",
    code: "BILL_PAYMENT_FAILED",
    data: { ...data, reference, status: data?.status || "99", http_status: resp.status, effective_status: effStatus },
  }, 400);
}

// Subscription-style bills get an expiry → enables expiry reminders.
function computeBillExpiry(category: string, _paymentItemName: string | null): string | null {
  if (!category) return null;
  const cat = category.toLowerCase();
  if (cat.includes("cable") || cat.includes("internet") || cat === "data") {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString();
  }
  return null;
}

// =============================================
// BILL VALUE DELIVERY
// A bill payment is only complete when the customer receives the actual
// value: a prepaid meter token, an airtime/data top-up confirmation, a
// recharge PIN, or a subscription activation. This value ALWAYS comes from
// VFD/the biller — we never synthesise it. When VFD has not returned the
// artefact yet the delivery is marked pending so it can be retried/queried.
// =============================================
type BillDelivery = {
  delivery_type: "token" | "pin" | "topup" | "subscription" | "receipt";
  delivery_token: string | null;
  delivery_units: string | null;
  delivery_status: "delivered" | "pending" | "failed";
  delivery_detail: Record<string, unknown>;
};

function pickField(src: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!src) return null;
  for (const k of Object.keys(src)) {
    if (keys.includes(k.toLowerCase())) {
      const v = src[k];
      if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
    }
  }
  return null;
}

function formatMeterToken(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 16) return raw;
  return (digits.match(/.{1,4}/g) || [raw]).join("-");
}

// Transaction Status Query (TSQ) against the VFD bills store.
//
// `lookup_ok: false` means we could not reach VFD, the call timed out, or the
// envelope was unreadable. That is NOT the same as "the biller is still
// processing" — an unreachable VFD must never settle or refund a receipt.
type BillStatusLookup = {
  lookup_ok: boolean;
  body: Record<string, unknown> | null;
  http_status: number | null;
  request_id: string;
};

const TSQ_TIMEOUT_MS = 15_000;
const TSQ_ATTEMPTS = 3;

async function lookupVfdBillStatus(reference: string): Promise<BillStatusLookup> {
  let last: BillStatusLookup = { lookup_ok: false, body: null, http_status: null, request_id: "" };
  for (let attempt = 1; attempt <= TSQ_ATTEMPTS; attempt++) {
    const requestId = crypto.randomUUID();
    try {
      const token = await getVfdAccessToken();
      if (!token) {
        console.error(`[bills][tsq] ref=${reference} attempt=${attempt} request_id=${requestId} no_access_token`);
        last = { lookup_ok: false, body: null, http_status: null, request_id: requestId };
      } else {
        const resp = await fetchWithTimeout(
          `${getBillsBase()}/transactionStatus?transactionId=${encodeURIComponent(reference)}`,
          { method: "GET", headers: { AccessToken: token, "Content-Type": "application/json", "x-request-id": requestId } },
          TSQ_TIMEOUT_MS,
        );
        const json = await safeJson(resp);
        const ok = resp.ok && Object.keys(json).length > 0;
        const eff = effectiveBillStatus(json as Record<string, unknown>);
        console.log(
          `[bills][tsq] ref=${reference} attempt=${attempt} request_id=${requestId} http=${resp.status} ` +
          `envelope_status=${String((json as Record<string, unknown>)?.status ?? "")} txn_status=${String(eff ?? "")} ` +
          `outcome=${classifyBillStatus(eff)} message=${String((json as Record<string, unknown>)?.message ?? "").slice(0, 120)}`,
        );
        last = { lookup_ok: ok, body: ok ? json : null, http_status: resp.status, request_id: requestId };
        if (ok) return last;
      }
    } catch (e) {
      console.error(
        `[bills][tsq] ref=${reference} attempt=${attempt} request_id=${requestId} failed:`,
        e instanceof Error ? e.message : String(e),
      );
      last = { lookup_ok: false, body: null, http_status: null, request_id: requestId };
    }
    if (attempt < TSQ_ATTEMPTS) await new Promise((r) => setTimeout(r, 750 * attempt));
  }
  return last;
}

// Best-effort re-query of the VFD bills transaction so a token that was not
// present on the immediate /pay response can still be delivered.
async function fetchVfdBillArtefact(reference: string): Promise<Record<string, unknown> | null> {
  return (await lookupVfdBillStatus(reference)).body;
}

/**
 * Effective biller outcome for a VFD bills response.
 * `/pay` reports the outcome on the envelope `status`, while
 * `/transactionStatus` puts the lookup result on `status` ("00" = retrieval
 * succeeded) and the real biller outcome on `data.transactionStatus`.
 * Always prefer the inner value when present.
 */
function effectiveBillStatus(resp: Record<string, unknown> | null | undefined): string | null {
  if (!resp) return null;
  const inner = (resp.data && typeof resp.data === "object" ? resp.data : {}) as Record<string, unknown>;
  const innerStatus = pickField(inner, ["transactionstatus", "txnstatus"]);
  if (innerStatus) return innerStatus;
  const outer = resp.status;
  return outer === null || outer === undefined || String(outer).trim() === "" ? null : String(outer).trim();
}

/**
 * Normalised internal outcome model for VFD bill status codes. We never rely on
 * the HTTP status — only on the provider code.
 *   success  -> value delivered, settle the hold
 *   pending  -> biller accepted, not yet confirmed; keep holding
 *   failed   -> biller declined; release the hold back to the wallet
 *   reversed -> biller reversed the purchase; release the hold
 *   unknown  -> code we do not recognise (or none at all). Treated like pending
 *               so money is never refunded on a guess; the 45-minute stale
 *               timeout still closes it out.
 */
type BillOutcome = "success" | "pending" | "failed" | "reversed" | "unknown";

const VFD_BILL_STATUS_MAP: Record<string, BillOutcome> = {
  "00": "success",
  SUCCESS: "success",
  SUCCESSFUL: "success",
  COMPLETED: "success",
  "09": "pending",
  "91": "pending",
  // VFD /transactionStatus returns 108 "No Transaction!" when the reference is
  // not (yet) known to the biller store. Per the spec only 99 warrants a
  // reversal, so 108 is held as pending and re-queried by the reconciler.
  "108": "pending",
  PENDING: "pending",

  PROCESSING: "pending",
  "01": "failed",
  "06": "failed",
  "12": "failed",
  "51": "failed",
  "96": "failed",
  "99": "failed",
  TF: "failed",
  FAILED: "failed",
  DECLINED: "failed",
  "25": "reversed",
  RV: "reversed",
  REVERSED: "reversed",
};

function classifyBillStatus(code: string | null | undefined): BillOutcome {
  if (code === null || code === undefined || String(code).trim() === "") return "unknown";
  return VFD_BILL_STATUS_MAP[String(code).trim().toUpperCase()] ?? "unknown";
}

function deriveBillDelivery(params: {
  category: string;
  billerName: string;
  paymentItemName: string | null;
  amount: number;
  reference: string;
  vfdResponse?: Record<string, unknown> | null;
}): BillDelivery {
  const { category, billerName, paymentItemName } = params;
  const raw = (params.vfdResponse || {}) as Record<string, unknown>;
  const inner = (raw.data && typeof raw.data === "object" ? raw.data : {}) as Record<string, unknown>;

  const tokenKeys = ["token", "standardtokenvalue", "stdtoken", "metertoken", "utilitytoken", "credittoken"];
  const pinKeys = ["pin", "rechargepin", "voucherpin", "cardpin"];
  const unitKeys = ["units", "unit", "kwh", "unitsvalue", "tokenamount"];

  const vfdToken = pickField(inner, tokenKeys) || pickField(raw, tokenKeys);
  const vfdPin = pickField(inner, pinKeys) || pickField(raw, pinKeys);
  const vfdUnits = pickField(inner, unitKeys) || pickField(raw, unitKeys);

  const hay = `${category} ${billerName} ${paymentItemName || ""}`.toLowerCase();
  const isElectricity = /electric|disco|power|eko|ikeja|abuja|aedc|phed|kedco|ibedc|eedc|jed|kaedco|bedc/.test(hay);
  const isPrepaid = /prepaid|prepay/.test(hay) || (isElectricity && !/postpaid/.test(hay));
  const isAirtimeOrData = /airtime|data|mobile|mtn|glo|airtel|9mobile/.test(hay);
  const isSubscription = /cable|tv|dstv|gotv|startimes|internet|broadband/.test(hay);

  if (isElectricity && isPrepaid) {
    const token = vfdToken ? formatMeterToken(vfdToken) : null;
    // First-time vends on some discos (notably AEDC) also return two key-change
    // tokens. They must be entered on the meter BEFORE the credit token.
    const kct1Raw = pickField(inner, ["kct1", "keychangetoken1", "kct_1"]) || pickField(raw, ["kct1", "keychangetoken1", "kct_1"]);
    const kct2Raw = pickField(inner, ["kct2", "keychangetoken2", "kct_2"]) || pickField(raw, ["kct2", "keychangetoken2", "kct_2"]);
    const kct1 = kct1Raw ? formatMeterToken(kct1Raw) : null;
    const kct2 = kct2Raw ? formatMeterToken(kct2Raw) : null;
    const hasKct = !!(kct1 || kct2);
    return {
      delivery_type: "token",
      delivery_token: token,
      delivery_units: vfdUnits,
      delivery_status: token ? "delivered" : "pending",
      delivery_detail: {
        instruction: token
          ? (hasKct
            ? "Enter the two key-change tokens (KCT1 then KCT2) on your meter first, then enter the credit token to load the units."
            : "Enter this one-time token on your prepaid meter keypad to load the units.")
          : "Your payment was received. The meter token from the disco has not been returned yet — it will appear here as soon as the biller releases it.",
        meter_type: "prepaid",
        token_source: token ? "vfd" : null,
        ...(hasKct ? { kct1, kct2 } : {}),
      },
    };
  }



  if (isElectricity) {
    return {
      delivery_type: "receipt",
      delivery_token: null,
      delivery_units: null,
      delivery_status: "delivered",
      delivery_detail: {
        instruction: "Postpaid account credited. Your outstanding balance has been reduced.",
        meter_type: "postpaid",
      },
    };
  }

  if (vfdPin) {
    return {
      delivery_type: "pin",
      delivery_token: vfdPin,
      delivery_units: vfdUnits,
      delivery_status: "delivered",
      delivery_detail: { instruction: "Use this recharge PIN to load your account." },
    };
  }

  if (isAirtimeOrData) {
    // Some networks/aggregators return a recharge token or voucher on top-up.
    // Surface it verbatim when VFD sends one; otherwise it is a direct top-up.
    const topupToken = vfdPin || vfdToken;
    return {
      delivery_type: topupToken ? "pin" : "topup",
      delivery_token: topupToken,
      delivery_units: vfdUnits || paymentItemName,
      delivery_status: "delivered",
      delivery_detail: {
        instruction: topupToken
          ? "Dial *555*PIN# (or your network's recharge code) to load this credit."
          : "Top-up delivered directly to the phone number — no recharge token is issued for this network.",
      },
    };
  }

  if (isSubscription) {
    return {
      delivery_type: "subscription",
      delivery_token: null,
      delivery_units: paymentItemName,
      delivery_status: "delivered",
      delivery_detail: { instruction: "Subscription activated on the smartcard/decoder number." },
    };
  }

  return {
    delivery_type: "receipt",
    delivery_token: vfdToken,
    delivery_units: vfdUnits,
    delivery_status: "delivered",
    delivery_detail: {},
  };
}

// =============================================
// BILLS: BENEFICIARIES, RECEIPTS, RECURRING, REMINDERS
// =============================================

async function handleListBeneficiaries(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const category = (body.category as string) || null;
  let q = db.from("vfd_sandbox_bill_beneficiaries").select("*").eq("user_id", userId);
  if (category) q = q.eq("category", category);
  const { data, error } = await q.order("last_used_at", { ascending: false, nullsFirst: false });
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data: data || [] });
}

async function handleSaveBeneficiary(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const nickname = (body.nickname as string)?.trim();
  const category = (body.category as string)?.trim();
  const billerId = (body.biller_id as string)?.trim();
  const billerName = (body.biller_name as string)?.trim();
  const division = (body.division as string)?.trim();
  const productId = (body.product_id as string)?.trim();
  const customerId = (body.customer_id as string)?.trim();
  if (!nickname || !category || !billerId || !customerId || !division || !productId) {
    return jsonResponse({ error: "nickname, category, biller, customer_id, division, product_id required" }, 400);
  }
  const { data, error } = await db.from("vfd_sandbox_bill_beneficiaries").upsert({
    user_id: userId,
    nickname,
    category,
    biller_id: billerId,
    biller_name: billerName || billerId,
    division,
    product_id: productId,
    payment_item_code: (body.payment_item_code as string) || null,
    payment_item_name: (body.payment_item_name as string) || null,
    customer_id: customerId,
    phone_number: (body.phone_number as string) || null,
  }, { onConflict: "user_id,biller_id,customer_id" }).select().single();
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}

async function handleDeleteBeneficiary(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const id = body.id as string;
  if (!id) return jsonResponse({ error: "id required" }, 400);
  const { error } = await db.from("vfd_sandbox_bill_beneficiaries").delete().eq("id", id).eq("user_id", userId);
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data: { deleted: true } });
}

async function handleListReceipts(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const limit = Math.min(Number(body.limit) || 50, 200);
  const { data, error } = await db.from("vfd_sandbox_bill_receipts")
    .select("*").eq("user_id", userId).order("paid_at", { ascending: false }).limit(limit);
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data: data || [] });
}

/**
 * Re-queries VFD for every bill receipt still awaiting delivery and closes it out:
 *  - biller confirmed ("00")  -> receipt completed, artefact stored, customer notified
 *  - biller failed (anything else, not "09") -> wallet refunded, receipt failed, customer notified
 *  - still "09" -> left pending for the next sweep
 */
async function handleReconcilePendingBills(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const isSystem = userId === "system";
  const limit = Math.min(Number(body.limit) || (isSystem ? 100 : 25), 200);
  let query = db.from("vfd_sandbox_bill_receipts")
    .select("*")
    .or("status.eq.pending,delivery_status.eq.pending");
  if (!isSystem) query = query.eq("user_id", userId);
  const { data: rows, error } = await query
    .order("paid_at", { ascending: false })
    .limit(limit);
  if (error) return jsonResponse({ error: error.message }, 500);

  const result = { scanned: 0, delivered: 0, refunded: 0, timed_out: 0, still_pending: 0 };
  // A purchase stuck at VFD "09" for longer than this is auto-refunded so the
  // customer is never left hanging on money the biller never delivered.
  const STALE_PENDING_MINUTES = 45;

  // Releases the hold back to the wallet. Falls back to a plain deposit for
  // legacy receipts that were debited straight to settlement (pre hold-and-settle).
  const refundReceipt = async (r: Record<string, any>, owner: string, reason: string, statusResp: unknown) => {
    const refundRef = `${r.reference}-REFUND`;
    let ok = false;
    const { data: rel, error: relErr } = await db.rpc("vestara_bill_release", {
      _reference: r.reference,
      _metadata: { reason, vfd_status: reason },
    });
    const relResult = rel as { success?: boolean; error?: string } | null;
    ok = !relErr && !!relResult?.success;
    if (!ok) {
      const { data: dep, error: depErr } = await db.rpc("vestara_deposit", {
        _user_id: owner,
        _amount: Number(r.amount),
        _reference: refundRef,
        _metadata: { source: "bill_payment_refund", original_reference: r.reference, reason },
      });
      ok = !depErr && !!(dep as { success?: boolean } | null)?.success;
      if (!ok) {
        console.error("[bills] refund failed", r.reference, relErr || relResult, depErr || dep);
        return false;
      }
    }
    await db.from("vfd_sandbox_transactions").insert({
      user_id: owner, transaction_type: "credit", amount: Number(r.amount),
      description: `Refund: bill payment ${r.biller_name} - ${r.customer_id}`,
      reference: refundRef, status: "completed",
    });
    const timedOut = reason === "stale_pending";
    await db.from("vfd_sandbox_bill_receipts").update({
      status: timedOut ? "refunded" : "failed",
      delivery_status: "failed",
      hold_state: "refunded",
      refunded_at: new Date().toISOString(),
      timed_out_at: timedOut ? new Date().toISOString() : null,
      delivery_detail: {
        instruction: timedOut
          ? "The biller never confirmed this purchase, so it was cancelled and your wallet refunded in full."
          : "The biller could not complete this purchase. Your wallet has been refunded in full.",
      },
      raw_response: statusResp ?? r.raw_response,
    }).eq("id", r.id);
    // No cache mirroring here: vestara_bill_release / vestara_deposit post
    // through vestara_post_transaction, which updates the displayed balance
    // atomically. The old read-then-write mirror was race-prone.

    await sendNotification(
      owner,
      timedOut ? "Bill payment cancelled & refunded" : "Bill payment refunded",
      `${r.biller_name} • ${r.customer_id} — ${timedOut ? "the biller never confirmed this purchase" : "the biller could not complete this purchase"}, so ₦${Number(r.amount).toLocaleString()} has been refunded to your wallet. Ref: ${r.reference}`,
      "bill_payment",
    );
    return true;
  };

  for (const r of (rows || []) as Record<string, any>[]) {
    const owner = r.user_id as string;
    result.scanned++;
    const lookup = await lookupVfdBillStatus(r.reference);
    const statusResp = lookup.body;
    const eff = effectiveBillStatus(statusResp);
    const outcome: BillOutcome = lookup.lookup_ok ? classifyBillStatus(eff) : "unknown";
    const ageMin = (Date.now() - new Date(r.paid_at).getTime()) / 60000;
    console.log(
      `[bills][reconcile] ref=${r.reference} request_id=${lookup.request_id} lookup_ok=${lookup.lookup_ok} ` +
      `http=${lookup.http_status ?? ""} status=${String(eff ?? "")} outcome=${outcome} age_min=${Math.round(ageMin)}`,
    );

    if (outcome === "success") {

      const delivery = deriveBillDelivery({
        category: r.category || "",
        billerName: r.biller_name || "",
        paymentItemName: r.payment_item_name,
        amount: Number(r.amount),
        reference: r.reference,
        vfdResponse: statusResp,
      });
      // Money only leaves the hold once the biller has confirmed delivery.
      // Fix D: the fee leg is derived from the hold's stored convenience_fee,
      // so settlement is credited with the bill amount only.
      const { data: st, error: stErr } = await db.rpc("vestara_bill_settle", {
        _reference: r.reference,
        _metadata: { source: "bill_reconciler" },
        _fee_amount: r.convenience_fee != null ? Number(r.convenience_fee) : null,
      });
      const settled = !stErr && !!(st as { success?: boolean } | null)?.success;
      if (!settled) console.error("[bills] settle failed", r.reference, stErr || st);
      await db.from("vfd_sandbox_bill_receipts").update({
        status: "completed",
        hold_state: settled ? "settled" : r.hold_state,
        settled_at: settled ? new Date().toISOString() : r.settled_at,
        delivery_type: delivery.delivery_type,
        delivery_token: delivery.delivery_token,
        delivery_units: delivery.delivery_units,
        delivery_status: delivery.delivery_status,
        delivery_detail: delivery.delivery_detail,
        raw_response: statusResp,
      }).eq("id", r.id);
      await sendNotification(
        owner,
        "Bill delivered",
        `${r.biller_name} • ${r.customer_id} — ₦${Number(r.amount).toLocaleString()} confirmed by the biller.${delivery.delivery_token ? ` Token/PIN: ${delivery.delivery_token}.` : ""} Ref: ${r.reference}`,
        "bill_payment",
      );
      result.delivered++;
    } else if (outcome === "failed" || outcome === "reversed") {
      // Genuine biller failure/reversal, confirmed by a successful lookup — return the money.
      if (await refundReceipt(r, owner, String(eff), statusResp)) result.refunded++;
      else result.still_pending++;
    } else {
      // Pending at VFD, an unrecognised code, or a lookup we could not complete.
      // Never refund on a guess — hold until the stale timeout closes it out.
      if (ageMin >= STALE_PENDING_MINUTES) {
        if (await refundReceipt(r, owner, "stale_pending", statusResp)) result.timed_out++;
        else result.still_pending++;
      } else {
        result.still_pending++;
      }
    }

  }


  // Durable catch-up for Fix A: any settled bill whose real VFD pool debit has
  // not been reconciled yet is retried on every sweep (10-minute cron), so the
  // ledger converges on the bank statement even if the live request died first.
  try {
    const poolRecon = await reconcileOutstandingBillPoolDebits(isSystem ? 50 : 20);
    (result as Record<string, unknown>).pool_reconciliation = poolRecon;
  } catch (e) {
    console.error("[bills][recon] sweep failed", e instanceof Error ? e.message : String(e));
  }

  return jsonResponse({ data: result });

}

// Compute next run timestamp in WAT (UTC+1). Hour stored is WAT hour.
function computeNextRunAt(frequency: string, hourWat: number, dayOfWeek: number | null, dayOfMonth: number | null, from = new Date()): string {
  // Convert from now (UTC) by shifting to WAT, then back.
  const watNow = new Date(from.getTime() + 60 * 60 * 1000);
  const next = new Date(watNow);
  next.setUTCHours(hourWat, 0, 0, 0);

  if (frequency === "daily") {
    if (next <= watNow) next.setUTCDate(next.getUTCDate() + 1);
  } else if (frequency === "weekly") {
    const target = dayOfWeek ?? watNow.getUTCDay();
    const diff = (target - next.getUTCDay() + 7) % 7;
    next.setUTCDate(next.getUTCDate() + diff);
    if (next <= watNow) next.setUTCDate(next.getUTCDate() + 7);
  } else if (frequency === "monthly") {
    const target = Math.min(dayOfMonth ?? 1, 28);
    next.setUTCDate(target);
    if (next <= watNow) next.setUTCMonth(next.getUTCMonth() + 1);
  }
  // shift back from WAT → UTC
  return new Date(next.getTime() - 60 * 60 * 1000).toISOString();
}

async function handleCreateRecurringBill(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const amount = Number(body.amount);
  const frequency = (body.frequency as string)?.toLowerCase();
  if (!["daily", "weekly", "monthly"].includes(frequency)) return jsonResponse({ error: "frequency must be daily, weekly or monthly" }, 400);
  if (!amount || amount < 50) return jsonResponse({ error: "amount must be at least ₦50" }, 400);
  const billerId = (body.biller_id as string)?.trim();
  const customerId = (body.customer_id as string)?.trim();
  const paymentItemCode = (body.payment_item_code as string)?.trim();
  const division = (body.division as string)?.trim();
  const productId = (body.product_id as string)?.trim();
  if (!billerId || !customerId || !paymentItemCode || !division || !productId) {
    return jsonResponse({ error: "biller_id, customer_id, payment_item_code, division, product_id required" }, 400);
  }
  const hour = 16; // 4PM WAT, locked to project standard
  const dayOfWeek = body.day_of_week !== undefined ? Number(body.day_of_week) : null;
  const dayOfMonth = body.day_of_month !== undefined ? Number(body.day_of_month) : null;
  const nextRunAt = computeNextRunAt(frequency, hour, dayOfWeek, dayOfMonth);

  const { data, error } = await db.from("vfd_sandbox_recurring_bills").insert({
    user_id: userId,
    nickname: (body.nickname as string) || null,
    category: (body.category as string) || "Other",
    biller_id: billerId,
    biller_name: (body.biller_name as string) || billerId,
    division,
    product_id: productId,
    payment_item_code: paymentItemCode,
    payment_item_name: (body.payment_item_name as string) || null,
    customer_id: customerId,
    phone_number: (body.phone_number as string) || null,
    amount,
    frequency,
    day_of_week: dayOfWeek,
    day_of_month: dayOfMonth,
    hour_wat: hour,
    next_run_at: nextRunAt,
  }).select().single();
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}

async function handleListRecurringBills(userId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("vfd_sandbox_recurring_bills")
    .select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data: data || [] });
}

async function handleUpdateRecurringBill(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const id = body.id as string;
  if (!id) return jsonResponse({ error: "id required" }, 400);
  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.amount !== undefined) updates.amount = Number(body.amount);
  if (body.nickname !== undefined) updates.nickname = body.nickname;
  if (Object.keys(updates).length === 0) return jsonResponse({ error: "no fields to update" }, 400);
  const { error } = await db.from("vfd_sandbox_recurring_bills").update(updates).eq("id", id).eq("user_id", userId);
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data: { updated: true } });
}

async function handleDeleteRecurringBill(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const id = body.id as string;
  const { error } = await db.from("vfd_sandbox_recurring_bills").delete().eq("id", id).eq("user_id", userId);
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data: { deleted: true } });
}

// CRON: run due recurring bills (every hour). Wallet-funded only. No retries on failure.
async function handleRunDueRecurringBills() {
  const db = getSupabaseAdmin();
  const { data: due } = await db.from("vfd_sandbox_recurring_bills")
    .select("*").eq("status", "active").lte("next_run_at", new Date().toISOString()).limit(100);

  const results: unknown[] = [];
  for (const r of (due || [])) {
    const amount = Number(r.amount);
    let outcome: { status: string; reason?: string; reference?: string; pending?: boolean };
    try {
      // A scheduled bill is a real purchase: it goes through the exact same
      // production lifecycle as a customer-initiated payment — backend
      // validation gate → POST /pay → TSQ → hold/settle → receipt carrying the
      // VFD reference and provider trace. Never fabricate a receipt here.
      const payResp = await handleBillsPay(r.user_id, {
        customerId: r.customer_id,
        amount: String(amount),
        division: r.division,
        paymentItem: r.payment_item_code,
        productId: r.product_id,
        billerId: r.biller_id,
        phoneNumber: r.phone_number || undefined,
        category: r.category,
        billerName: r.biller_name,
        paymentItemName: r.payment_item_name,
        recurring_bill_id: r.id,
      });
      const payJson = await payResp.clone().json().catch(() => ({} as Record<string, unknown>));
      const payData = (payJson as Record<string, unknown>).data as Record<string, unknown> | undefined;

      if (payResp.ok && payData) {
        const reference = String(payData.reference || "");
        const pending = !!payData.pending;
        // handleBillsPay already notified the customer with the delivered
        // artefact (token/PIN) or the pending notice — no duplicate here.
        outcome = { status: pending ? "pending" : "paid", reference, pending };
        console.log(`[bills][recurring] id=${r.id} ref=${reference} outcome=${outcome.status}`);
      } else {
        const code = String((payJson as Record<string, unknown>).code || "");
        const reason = String((payJson as Record<string, unknown>).error || "Bill payment failed");
        const status = code === "INSUFFICIENT_BALANCE"
          ? "insufficient_funds"
          : code === "CUSTOMER_VALIDATION_FAILED" || code === "BILLER_CONFIG_REVIEW" || code === "VALIDATION_UNAVAILABLE"
            ? "validation_failed"
            : "failed";
        outcome = { status, reason };
        const why = status === "insufficient_funds"
          ? "wallet balance too low. Fund your wallet"
          : status === "validation_failed"
            ? `we couldn't verify ${r.customer_id} with the biller. Update the details`
            : `the biller declined it. Your wallet was not debited. Check the details`;
        await sendNotification(
          r.user_id,
          "Recurring bill skipped",
          `${r.biller_name} (₦${amount.toLocaleString()}) was skipped — ${why} to keep ${r.nickname || r.biller_name} active.`,
          "bill_recurring_failed",
        );
        console.error(`[bills][recurring] id=${r.id} outcome=${status} code=${code} reason=${reason.slice(0, 160)}`);
      }
    } catch (e) {
      outcome = { status: "error", reason: e instanceof Error ? e.message : String(e) };
      console.error(`[bills][recurring] id=${r.id} error=${outcome.reason}`);
    }

    const next = computeNextRunAt(r.frequency, r.hour_wat, r.day_of_week, r.day_of_month);
    const succeeded = outcome.status === "paid" || outcome.status === "pending";
    await db.from("vfd_sandbox_recurring_bills").update({
      last_run_at: new Date().toISOString(),
      last_run_status: outcome.status,
      last_run_reason: outcome.reason || null,
      next_run_at: next,
      consecutive_failures: succeeded ? 0 : (Number(r.consecutive_failures) + 1),
    }).eq("id", r.id);

    results.push({ id: r.id, ...outcome });
  }
  return jsonResponse({ data: { processed: results.length, results } });
}


// CRON: send expiry reminders 3 days before subscription bill expires.
async function handleSendBillReminders() {
  const db = getSupabaseAdmin();
  const now = new Date();
  const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: receipts } = await db.from("vfd_sandbox_bill_receipts")
    .select("*").is("reminder_sent_at", null)
    .not("expires_at", "is", null)
    .lte("expires_at", horizon)
    .gte("expires_at", now.toISOString())
    .limit(500);

  let sent = 0;
  for (const r of (receipts || [])) {
    const daysLeft = Math.max(1, Math.ceil((new Date(r.expires_at).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    const title = `${r.biller_name} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
    const msg = `Your ${r.biller_name} subscription for ${r.customer_id} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Fund now to avoid disconnection.`;

    // In-app sandbox bell
    await sendNotification(r.user_id, title, msg, "bill_expiry_reminder");
    // Also push to global user_notifications so existing triggers send push + email
    await db.from("user_notifications").insert({
      user_id: r.user_id, title, message: msg, notification_type: "bill_expiry_reminder",
    });
    await db.from("vfd_sandbox_bill_receipts").update({ reminder_sent_at: now.toISOString() }).eq("id", r.id);
    sent++;
  }
  return jsonResponse({ data: { reminders_sent: sent } });
}

async function handleBillsStatus(body: Record<string, unknown>) {
  const { transactionId } = body as { transactionId: string };
  if (!transactionId) return jsonResponse({ error: "transactionId required" }, 400);
  const lookup = await lookupVfdBillStatus(transactionId);
  if (!lookup.lookup_ok) {
    return jsonResponse(
      { error: "The bill status could not be retrieved right now.", lookup_ok: false, request_id: lookup.request_id },
      502,
    );
  }
  const eff = effectiveBillStatus(lookup.body);
  return jsonResponse({
    data: lookup.body,
    status_code: eff,
    outcome: classifyBillStatus(eff),
    request_id: lookup.request_id,
  });
}


// =============================================
// VIRTUAL CARDS (VFD BaaS)
// =============================================

const CARD_ISSUANCE_FEE = 1000; // ₦1,000

function getCardsBase(): string {
  const vfdBase = Deno.env.get("VFD_API_BASE") ||
      ((Deno.env.get("VFD_MODE") || "sandbox").toLowerCase() === "production"
        ? "https://api-apps.vfdbank.systems"
        : "https://api-devapps.vfdbank.systems");
  return `${vfdBase}/vtech-cards/api/v2/baascards`;
}

async function handleCreateVirtualCard(userId: string, _body: Record<string, unknown>) {
  const db = getSupabaseAdmin();

  // Check if user already has an active/pending card
  const { data: existing } = await db.from("vfd_sandbox_virtual_cards")
    .select("id, status").eq("user_id", userId)
    .in("status", ["pending", "active"]).maybeSingle();
  if (existing) return jsonResponse({ error: "You already have an active virtual card" }, 400);

  // Get user account details
  const { data: client } = await db.from("vfd_sandbox_clients")
    .select("vfd_account_number, phone, email").eq("user_id", userId).maybeSingle();
  if (!client?.vfd_account_number) return jsonResponse({ error: "Complete KYC first" }, 400);

  // Check balance for issuance fee
  const bal = await ensureBalanceRow(userId, true);
  const available = bal.total_balance - bal.locked_balance - bal.savings_balance;
  if (available < CARD_ISSUANCE_FEE) return jsonResponse({ error: `Insufficient balance. Card issuance costs ₦${CARD_ISSUANCE_FEE.toLocaleString()}` }, 400);

  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);

  const resp = await vfdFetch(`${getCardsBase()}/cardrequest?action=virtual`, {
    method: "POST",
    headers: { AccessToken: token, "Content-Type": "application/json" },
    body: JSON.stringify({
      accountNo: client.vfd_account_number,
      primaryPhoneNo: client.phone || "09000000000",
      emailAddress: client.email || "user@vestara.app",
    }),
  });
  const data = await safeJson(resp);

  if (data?.status === "00" && data?.data) {
    const cardData = data.data;
    const cardRef = `card-issue-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    // Atomic double-entry debit of the issuance fee (wallet → settlement).
    const { data: wdData, error: wdErr } = await db.rpc("vestara_withdraw", {
      _user_id: userId,
      _amount: CARD_ISSUANCE_FEE,
      _reference: cardRef,
      _metadata: {
        source: "virtual_card_issuance",
        card_id: cardData.cardId?.toString() || "",
        masked_pan: cardData.maskedPan || "",
      },
    });
    const wdResult = wdData as { success?: boolean; error?: string } | null;
    if (wdErr || !wdResult?.success) {
      console.error("[card-issue] vestara_withdraw failed:", wdErr || wdResult);
      return jsonResponse(
        { error: "Card created but fee could not be charged. Please contact support.", details: wdErr?.message || wdResult?.error },
        500,
      );
    }
    // No cache mirroring here: vestara_withdraw updates the displayed balance
    // inside the same database transaction as the ledger entry.


    await db.from("vfd_sandbox_transactions").insert({
      user_id: userId, transaction_type: "debit", amount: CARD_ISSUANCE_FEE,
      description: "Virtual Card Issuance Fee",
      reference: cardRef, status: "completed",
    });

    // Store card
    const cardRecord = {
      user_id: userId,
      card_id: cardData.cardId?.toString() || "",
      masked_pan: cardData.maskedPan || "",
      full_pan_encrypted: cardData.pan || "",
      cvv_encrypted: cardData.cvv || "",
      expiry_date: cardData.expiryDate || "",
      pin_offset: cardData.pinOffset || "",
      status: "pending",
      issuance_fee: CARD_ISSUANCE_FEE,
    };
    await db.from("vfd_sandbox_virtual_cards").insert(cardRecord);

    await sendNotification(
      userId,
      "Virtual card issued",
      `Your virtual card ${cardData.maskedPan || ""} was created. Issuance fee: ₦${CARD_ISSUANCE_FEE.toLocaleString()}.`,
      "card_issued",
    );

    return jsonResponse({
      data: {
        card_id: cardData.cardId,
        masked_pan: cardData.maskedPan,
        expiry_date: cardData.expiryDate,
        status: "pending",
        issuance_fee: CARD_ISSUANCE_FEE,
        message: "Card created! Activate it to start using.",
      },
    });
  }

  return jsonResponse({ error: data?.message || "Card creation failed", details: data }, 400);
}

async function handleActivateCard(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { card_id } = body as { card_id: string };
  if (!card_id) return jsonResponse({ error: "card_id required" }, 400);

  const { data: card } = await db.from("vfd_sandbox_virtual_cards")
    .select("*").eq("user_id", userId).eq("card_id", card_id).maybeSingle();
  if (!card) return jsonResponse({ error: "Card not found" }, 404);
  if (card.status === "active") return jsonResponse({ error: "Card already active" }, 400);

  const { data: client } = await db.from("vfd_sandbox_clients")
    .select("vfd_account_number").eq("user_id", userId).maybeSingle();
  if (!client?.vfd_account_number) return jsonResponse({ error: "Account not found" }, 400);

  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);

  const resp = await vfdFetch(`${getCardsBase()}/cardaction/request`, {
    method: "POST",
    headers: { AccessToken: token, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ACTIVATE", accountNo: client.vfd_account_number, cardId: card_id }),
  });
  const data = await safeJson(resp);

  if (data?.status === "00") {
    await db.from("vfd_sandbox_virtual_cards").update({
      status: "active", activated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("card_id", card_id);

    return jsonResponse({ data: { status: "active", default_pin: data.data?.pin || "1234", message: "Card activated! Change your PIN." } });
  }

  return jsonResponse({ error: data?.message || "Activation failed" }, 400);
}

async function handleCardPinChange(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { card_id, old_pin, new_pin } = body as { card_id: string; old_pin: string; new_pin: string };
  if (!card_id || !old_pin || !new_pin) return jsonResponse({ error: "card_id, old_pin, new_pin required" }, 400);
  if (new_pin.length !== 4 || !/^\d{4}$/.test(new_pin)) return jsonResponse({ error: "PIN must be 4 digits" }, 400);

  const { data: client } = await db.from("vfd_sandbox_clients")
    .select("vfd_account_number").eq("user_id", userId).maybeSingle();
  if (!client?.vfd_account_number) return jsonResponse({ error: "Account not found" }, 400);

  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);

  const resp = await vfdFetch(`${getCardsBase()}/cardaction/request`, {
    method: "POST",
    headers: { AccessToken: token, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "PIN-CHANGE", cardId: card_id, accountNo: client.vfd_account_number, newCardPin: new_pin, cardPin: old_pin }),
  });
  const data = await safeJson(resp);

  if (data?.status === "00") {
    return jsonResponse({ data: { message: "PIN changed successfully" } });
  }
  return jsonResponse({ error: data?.message || "PIN change failed" }, 400);
}

async function handleBlockCard(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { card_id } = body as { card_id: string };
  if (!card_id) return jsonResponse({ error: "card_id required" }, 400);

  const { data: client } = await db.from("vfd_sandbox_clients")
    .select("vfd_account_number").eq("user_id", userId).maybeSingle();
  if (!client?.vfd_account_number) return jsonResponse({ error: "Account not found" }, 400);

  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);

  const resp = await vfdFetch(`${getCardsBase()}/cardaction/request`, {
    method: "POST",
    headers: { AccessToken: token, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "BLOCK", cardId: card_id, accountNo: client.vfd_account_number }),
  });
  const data = await safeJson(resp);

  if (data?.status === "00") {
    await db.from("vfd_sandbox_virtual_cards").update({
      status: "blocked", blocked_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("card_id", card_id);
    return jsonResponse({ data: { message: "Card blocked successfully" } });
  }
  return jsonResponse({ error: data?.message || "Block failed" }, 400);
}

async function handleUnblockCard(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { card_id } = body as { card_id: string };
  if (!card_id) return jsonResponse({ error: "card_id required" }, 400);

  const { data: client } = await db.from("vfd_sandbox_clients")
    .select("vfd_account_number").eq("user_id", userId).maybeSingle();
  if (!client?.vfd_account_number) return jsonResponse({ error: "Account not found" }, 400);

  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);

  const resp = await vfdFetch(`${getCardsBase()}/cardaction/request`, {
    method: "POST",
    headers: { AccessToken: token, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "UNBLOCK", cardId: card_id, accountNo: client.vfd_account_number }),
  });
  const data = await safeJson(resp);

  if (data?.status === "00") {
    await db.from("vfd_sandbox_virtual_cards").update({
      status: "active", blocked_at: null,
    }).eq("user_id", userId).eq("card_id", card_id);
    return jsonResponse({ data: { message: "Card unblocked successfully" } });
  }
  return jsonResponse({ error: data?.message || "Unblock failed" }, 400);
}

async function handleGetCards(userId: string) {
  const db = getSupabaseAdmin();
  const { data: cards } = await db.from("vfd_sandbox_virtual_cards")
    .select("card_id, masked_pan, expiry_date, status, issuance_fee, created_at, activated_at, blocked_at")
    .eq("user_id", userId).order("created_at", { ascending: false });
  return jsonResponse({ data: cards || [] });
}

async function handleGetCardDetails(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const { card_id } = body as { card_id: string };
  if (!card_id) return jsonResponse({ error: "card_id required" }, 400);

  const { data: card } = await db.from("vfd_sandbox_virtual_cards")
    .select("*").eq("user_id", userId).eq("card_id", card_id).maybeSingle();
  if (!card) return jsonResponse({ error: "Card not found" }, 404);

  return jsonResponse({
    data: {
      card_id: card.card_id,
      masked_pan: card.masked_pan,
      full_pan: card.full_pan_encrypted,
      cvv: card.cvv_encrypted,
      expiry_date: card.expiry_date,
      status: card.status,
      created_at: card.created_at,
      activated_at: card.activated_at,
    },
  });
}

// =============================================
// THRIFT GROUP INVITES (Production Parity)
// =============================================

async function handleSearchUsers(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const query = (body.query as string || "").trim();
  if (!query || query.length < 2) return jsonResponse({ data: [] });

  const escaped = query.replace(/[%_\\]/g, "\\$&");
  const { data } = await db.from("profiles")
    .select("id, full_name, username, avatar_url, membership_tier, credit_score, email")
    .or(`username.ilike.%${escaped}%,full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
    .neq("id", userId)
    .limit(10);

  // Strip email from response (used only for matching, not for display)
  const sanitized = (data || []).map((u: Record<string, unknown>) => {
    const { email: _email, ...rest } = u;
    return rest;
  });
  return jsonResponse({ data: sanitized });
}

// Validate a sandbox group invite link without joining (preview step)
async function handleValidateGroupInviteLink(body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const token = body.token as string;
  if (!token) return jsonResponse({ error: "token required" }, 400);

  const { data: link } = await db.from("vfd_sandbox_group_invite_links")
    .select("*").eq("invite_token", token).maybeSingle();

  if (!link) return jsonResponse({ data: { valid: false, error_message: "Invalid invite link" } });
  if (new Date(link.expires_at) < new Date())
    return jsonResponse({ data: { valid: false, error_message: "Invite link has expired" } });
  if (link.max_uses && link.use_count >= link.max_uses)
    return jsonResponse({ data: { valid: false, error_message: "Invite link has reached max uses" } });

  const { data: group } = await db.from("vfd_sandbox_groups")
    .select("id, name, contribution_amount, period, max_members, member_count, status, admin_id")
    .eq("id", link.group_id).maybeSingle();
  if (!group) return jsonResponse({ data: { valid: false, error_message: "Group not found" } });
  if (group.status === "completed")
    return jsonResponse({ data: { valid: false, error_message: "Group has already completed" } });
  if (group.member_count >= group.max_members)
    return jsonResponse({ data: { valid: false, error_message: "Group is full" } });

  const { data: admin } = await db.from("profiles")
    .select("full_name, username").eq("id", group.admin_id).maybeSingle();

  return jsonResponse({
    data: {
      valid: true,
      group,
      admin_name: admin?.username ? `@${admin.username}` : admin?.full_name || "Admin",
    },
  });
}

async function handleInviteGroupMember(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  const inviteeId = body.invitee_id as string;
  if (!groupId || !inviteeId) return jsonResponse({ error: "group_id and invitee_id required" }, 400);

  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  // Only the group admin can invite members (mirrors Vestara thrift group rules)
  if (group.admin_id !== userId) return jsonResponse({ error: "Only the group admin can invite members" }, 403);
  // Allow inviting while group is pending OR active-but-not-full
  if (group.status === "completed") return jsonResponse({ error: "Group has already completed" }, 400);
  if (group.member_count >= group.max_members) return jsonResponse({ error: "Group is full" }, 400);

  // Check if already a member
  const { data: existing } = await db.from("vfd_sandbox_group_members")
    .select("id").eq("group_id", groupId).eq("user_id", inviteeId).maybeSingle();
  if (existing) return jsonResponse({ data: { already_member: true }, error: "User is already a member" });

  // Check for existing pending invite
  const { data: existingInvite } = await db.from("vfd_sandbox_group_invites")
    .select("id").eq("group_id", groupId).eq("invitee_id", inviteeId).eq("status", "pending").maybeSingle();
  if (existingInvite) return jsonResponse({ data: { already_invited: true }, error: "User already has a pending invite" });

  const { data: invite, error } = await db.from("vfd_sandbox_group_invites").insert({
    group_id: groupId, inviter_id: userId, invitee_id: inviteeId,
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);

  // Get inviter profile for notification
  const { data: inviterProfile } = await db.from("profiles").select("full_name, username").eq("id", userId).maybeSingle();
  const inviterName = inviterProfile?.username ? `@${inviterProfile.username}` : inviterProfile?.full_name || "Someone";

  await sendNotification(inviteeId, "Group Invite",
    `${inviterName} invited you to join "${group.name}" (₦${group.contribution_amount}/${group.period})`,
    "group_invite", groupId);

  return jsonResponse({ data: invite });
}

async function handleRespondGroupInvite(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const inviteId = body.invite_id as string | undefined;
  const groupId = body.group_id as string | undefined;
  const accept = body.accept as boolean;

  if (!inviteId && !groupId) return jsonResponse({ error: "invite_id or group_id required" }, 400);

  let inviteQuery = db.from("vfd_sandbox_group_invites")
    .select("*")
    .eq("invitee_id", userId)
    .eq("status", "pending");

  inviteQuery = inviteId ? inviteQuery.eq("id", inviteId) : inviteQuery.eq("group_id", groupId);
  inviteQuery = inviteQuery.order("created_at", { ascending: false }).limit(1);
  const { data: invites } = await inviteQuery;
  const invite = invites?.[0];
  if (!invite) return jsonResponse({ error: "Invite not found" }, 404);
  if (invite.invitee_id !== userId) return jsonResponse({ error: "Not authorized" }, 403);
  if (invite.status !== "pending") return jsonResponse({ error: "Invite is no longer pending" }, 400);

  if (accept) {
    // Join first, then mark the invite accepted. This prevents a failed join
    // (full/started group, duplicate membership, etc.) from burning the invite.
    const joinResult = await handleJoinGroup(userId, { group_id: invite.group_id });
    const joinPayload = await joinResult.json().catch(() => ({ error: "Failed to join group" }));
    if (joinResult.status >= 400 || joinPayload?.error) {
      return jsonResponse(joinPayload, joinResult.status);
    }

    await db.from("vfd_sandbox_group_invites").update({
      status: "accepted",
      responded_at: new Date().toISOString(),
    }).eq("id", invite.id);
    await db.from("vfd_sandbox_notifications").update({ is_read: true })
      .eq("user_id", userId).eq("group_id", invite.group_id).eq("notification_type", "group_invite");

    return jsonResponse(joinPayload, joinResult.status);
  }

  await db.from("vfd_sandbox_group_invites").update({
    status: "declined",
    responded_at: new Date().toISOString(),
  }).eq("id", invite.id);
  await db.from("vfd_sandbox_notifications").update({ is_read: true })
    .eq("user_id", userId).eq("group_id", invite.group_id).eq("notification_type", "group_invite");

  return jsonResponse({ data: { success: true, status: "declined" } });
}

async function handleCreateGroupInviteLink(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  if (!groupId) return jsonResponse({ error: "group_id required" }, 400);

  const { data: group } = await db.from("vfd_sandbox_groups").select("admin_id, status").eq("id", groupId).single();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  if (group.admin_id !== userId) return jsonResponse({ error: "Only the group admin can create invite links" }, 403);
  if (group.status !== "pending") return jsonResponse({ error: "Group is no longer accepting members" }, 400);

  const { data: link, error } = await db.from("vfd_sandbox_group_invite_links").insert({
    group_id: groupId, created_by: userId,
  }).select("invite_token").single();

  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ data: { invite_token: link.invite_token } });
}

async function handleJoinGroupViaLink(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const token = body.token as string;
  if (!token) return jsonResponse({ error: "token required" }, 400);

  const { data: link } = await db.from("vfd_sandbox_group_invite_links")
    .select("*").eq("invite_token", token).maybeSingle();

  if (!link) return jsonResponse({ error: "Invalid invite link" }, 404);
  if (new Date(link.expires_at) < new Date()) return jsonResponse({ error: "Invite link has expired" }, 400);
  if (link.max_uses && link.use_count >= link.max_uses) return jsonResponse({ error: "Invite link has reached max uses" }, 400);

  // Increment use count
  await db.from("vfd_sandbox_group_invite_links").update({
    use_count: link.use_count + 1,
  }).eq("id", link.id);

  return await handleJoinGroup(userId, { group_id: link.group_id });
}

async function handleListGroupInvites(userId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_sandbox_group_invites")
    .select("*, vfd_sandbox_groups(id, name, contribution_amount, period, max_members, member_count)")
    .eq("invitee_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Enrich with inviter names
  if (data && data.length > 0) {
    const inviterIds = [...new Set(data.map(d => d.inviter_id))];
    const { data: profiles } = await db.from("profiles")
      .select("id, full_name, username").in("id", inviterIds);
    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    const enriched = data.map(invite => {
      const inviter = profileMap.get(invite.inviter_id);
      return {
        ...invite,
        inviter_name: inviter?.username ? `@${inviter.username}` : inviter?.full_name || "Someone",
      };
    });
    return jsonResponse({ data: enriched });
  }

  return jsonResponse({ data: data || [] });
}

// =============================================
// PENDING-INVITEE LOOKUP (for "Already invited" badge in search)
// =============================================
async function handleListPendingGroupInvitees(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  if (!groupId) return jsonResponse({ error: "group_id required" }, 400);
  if (!(await isGroupMember(groupId, userId))) return forbidden();


  const { data: invites } = await db.from("vfd_sandbox_group_invites")
    .select("invitee_id, status").eq("group_id", groupId).eq("status", "pending");
  const { data: members } = await db.from("vfd_sandbox_group_members")
    .select("user_id").eq("group_id", groupId);

  const inviteeIds = (invites || []).map((i: { invitee_id: string }) => i.invitee_id);
  const memberIds = (members || []).map((m: { user_id: string }) => m.user_id);
  return jsonResponse({
    data: {
      // New canonical names used by the dialog
      invitee_ids: inviteeIds,
      member_ids: memberIds,
      // Legacy aliases retained for backwards compatibility
      invited_user_ids: inviteeIds,
      member_user_ids: memberIds,
    },
  });
}

// =============================================
// IN-APP NOTIFICATIONS
// =============================================
async function handleListNotifications(userId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_sandbox_notifications")
    .select("*").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(50);

  const rows = data || [];
  const inviteGroupIds = rows
    .filter((n: { notification_type?: string | null; group_id?: string | null }) => n.notification_type === "group_invite" && n.group_id)
    .map((n: { group_id: string }) => n.group_id);

  let pendingInviteByGroup = new Map<string, Record<string, unknown>>();
  if (inviteGroupIds.length > 0) {
    const { data: pendingInvites } = await db.from("vfd_sandbox_group_invites")
      .select("*, vfd_sandbox_groups(id, name, contribution_amount, period, max_members, member_count)")
      .eq("invitee_id", userId)
      .eq("status", "pending")
      .in("group_id", [...new Set(inviteGroupIds)]);

    if (pendingInvites && pendingInvites.length > 0) {
      const inviterIds = [...new Set(pendingInvites.map((i: { inviter_id: string }) => i.inviter_id))];
      const { data: profiles } = await db.from("profiles").select("id, full_name, username").in("id", inviterIds);
      const profileMap = new Map((profiles || []).map((p: { id: string }) => [p.id, p]));

      pendingInviteByGroup = new Map(pendingInvites.map((invite: Record<string, unknown>) => {
        const inviter = profileMap.get(invite.inviter_id as string) as { full_name?: string | null; username?: string | null } | undefined;
        return [invite.group_id as string, {
          ...invite,
          inviter_name: inviter?.username ? `@${inviter.username}` : inviter?.full_name || "Someone",
        }];
      }));
    }
  }

  const enriched = rows.map((n: Record<string, unknown>) => {
    if (n.notification_type !== "group_invite" || !n.group_id) return n;
    const invite = pendingInviteByGroup.get(n.group_id as string);
    if (!invite) return { ...n, invite_status: "stale" };
    return {
      ...n,
      invite_status: "pending",
      invite_id: invite.id,
      inviter_name: invite.inviter_name,
      vfd_sandbox_groups: invite.vfd_sandbox_groups,
    };
  });

  const unreadCount = enriched.filter((n: { is_read: boolean | null }) => !n.is_read).length;
  return jsonResponse({ data: enriched, unread_count: unreadCount });
}

async function handleMarkNotificationRead(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const id = body.notification_id as string;
  if (!id) return jsonResponse({ error: "notification_id required" }, 400);
  await db.from("vfd_sandbox_notifications").update({ is_read: true })
    .eq("id", id).eq("user_id", userId);
  return jsonResponse({ data: { success: true } });
}

async function handleMarkAllNotificationsRead(userId: string) {
  const db = getSupabaseAdmin();
  await db.from("vfd_sandbox_notifications").update({ is_read: true })
    .eq("user_id", userId).eq("is_read", false);
  return jsonResponse({ data: { success: true } });
}

// =============================================
// AUTO-START GROUPS WHOSE SWAP WINDOW HAS ELAPSED
// Called from the UI on detail-view poll, and idempotent.
// =============================================
async function handleAutoStartPendingGroups(_userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string | undefined;

  let query = db.from("vfd_sandbox_groups")
    .select("*")
    .eq("status", "swap_window")
    .lte("swap_window_ends_at", new Date().toISOString());
  if (groupId) query = db.from("vfd_sandbox_groups")
    .select("*")
    .eq("id", groupId)
    .eq("status", "swap_window")
    .lte("swap_window_ends_at", new Date().toISOString());

  const { data: due } = await query;
  const started: string[] = [];

  for (const group of (due || [])) {
    const payoutOrder = (group.payout_order || []) as string[];
    if (!payoutOrder.length) continue;

    // Create cycle 1 for the (now-final) payout order
    const { data: cycle } = await db.from("vfd_sandbox_contribution_cycles").insert({
      group_id: group.id, cycle_number: 1, status: "active",
      payout_recipient_id: payoutOrder[0],
    }).select().single();

    await db.from("vfd_sandbox_groups").update({
      status: "active",
      current_cycle: 1,
      current_payout_position: 1,
      total_cycles: payoutOrder.length,
      commenced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", group.id);

    await postChatMessage(group.id, group.admin_id,
      `🚀 Swap window closed. Thrift has commenced! Cycle 1 is now active — recipient has been notified.`,
      "system");

    for (let i = 0; i < payoutOrder.length; i++) {
      await sendNotification(payoutOrder[i], "Thrift Started",
        `${group.name} has started. Your final payout position is #${i + 1}. ${i === 0 ? "You are first in line — payout will be sent once all members contribute." : "Please contribute on your scheduled date."}`,
        "group_started", group.id);
    }
    started.push(group.id);
    void cycle;
  }

  return jsonResponse({ data: { started_count: started.length, started } });
}

// =============================================
// GROUP CHAT (post + list)
// =============================================
async function handlePostGroupChat(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  const message = (body.message as string || "").trim();
  if (!groupId || !message) return jsonResponse({ error: "group_id and message required" }, 400);
  if (message.length > 1000) return jsonResponse({ error: "Message too long (max 1000 chars)" }, 400);

  const { data: member } = await db.from("vfd_sandbox_group_members")
    .select("id").eq("group_id", groupId).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!member) return jsonResponse({ error: "Not a member of this group", data: null });

  const { data, error } = await db.from("vfd_sandbox_chat_messages")
    .insert({ group_id: groupId, user_id: userId, message, message_type: "member" })
    .select().single();
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}

async function handleListGroupChat(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  if (!groupId) return jsonResponse({ error: "group_id required" }, 400);

  const { data: member } = await db.from("vfd_sandbox_group_members")
    .select("id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  // Non-members (e.g. browsing a pending/discoverable group) get an empty chat
  // instead of a 403, so the detail screen doesn't blank out.
  if (!member) return jsonResponse({ data: [] });

  const { data: chat } = await db.from("vfd_sandbox_chat_messages")
    .select("*").eq("group_id", groupId).order("created_at", { ascending: true }).limit(200);
  const names = await fetchProfileNames((chat || []).map((c: { user_id: string }) => c.user_id));
  return jsonResponse({ data: attachNames(chat, names) });
}

// =============================================
// AUTO-CONTRIBUTION SWEEP (cron-driven, wallet-only)
// Mirrors production: daily/weekly/monthly at scheduled WAT hour:minute,
// no card retries, cycle_id idempotency via contribution_audit.
// =============================================
async function handleSandboxAutoContribute(_userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const forceGroupId = body.force_group_id as string | undefined;

  // WAT = UTC+1
  const now = new Date();
  const watMs = now.getTime() + 60 * 60 * 1000;
  const wat = new Date(watMs);
  const watHour = wat.getUTCHours();
  const watMinute = wat.getUTCMinutes();
  const minuteSlot = watMinute < 30 ? 0 : 30;
  const dayOfWeek = wat.getUTCDay();
  const dayOfMonth = wat.getUTCDate();

  let q = db.from("vfd_sandbox_groups").select("*").eq("status", "active").eq("auto_debit", true);
  if (forceGroupId) q = q.eq("id", forceGroupId);
  else q = q.eq("contribution_hour", watHour);

  const { data: groups } = await q;
  const processed: Array<Record<string, unknown>> = [];

  for (const group of (groups || [])) {
    if (!forceGroupId) {
      // Filter by minute slot + period day match
      if ((group.contribution_minute ?? 0) !== minuteSlot) continue;
      if (group.period === "weekly" && (group.contribution_day_of_week ?? 1) !== dayOfWeek) continue;
      if (group.period === "monthly" && (group.contribution_day_of_month ?? 1) !== dayOfMonth) continue;
    }

    const { data: cycles } = await db.from("vfd_sandbox_contribution_cycles")
      .select("*").eq("group_id", group.id).eq("status", "active")
      .order("created_at", { ascending: true }).limit(1);
    const activeCycle = cycles?.[0];
    if (!activeCycle) continue;

    const { data: pending } = await db.from("vfd_sandbox_group_members")
      .select("id, user_id, contribution_method, mandate_status, mandate_code, mandate_reference")
      .eq("group_id", group.id).eq("status", "active")
      .eq("has_contributed_current", false);

    const MAX_RETRIES = 3;
    const RETRY_INTERVAL_MS = 30 * 60 * 1000;
    let succeeded = 0, failed = 0, deferred = 0, penalized = 0;

    for (const m of (pending || [])) {
      const { data: successAudit } = await db.from("vfd_sandbox_contribution_audit")
        .select("id").eq("user_id", m.user_id).eq("cycle_id", activeCycle.id)
        .eq("status", "success").maybeSingle();
      if (successAudit) continue;

      const { data: existingFailed } = await db.from("vfd_sandbox_contribution_audit")
        .select("id, retry_count, next_retry_at, penalty_served")
        .eq("user_id", m.user_id).eq("cycle_id", activeCycle.id)
        .eq("status", "failed").maybeSingle();

      if (existingFailed?.penalty_served) continue;
      if (!forceGroupId && existingFailed?.next_retry_at && new Date(existingFailed.next_retry_at) > now) {
        deferred++;
        continue;
      }

      const amount = Number(group.contribution_amount);
      const isDdmMember = m.contribution_method === "direct_debit";
      const debit = isDdmMember
        ? await (async () => {
            const r = await performMandateDebitForMember(group, m, Number(group.current_cycle));
            return { success: r.success, error: r.error };
          })()
        : await debitVestaraForThrift(m.user_id, group.id, amount, `ajo-auto-${group.id}-${activeCycle.id}-${m.user_id}`, {
            cycle_id: activeCycle.id,
            cycle_number: group.current_cycle,
            source: "vfd_sandbox_auto_sweep",
          });


      if (debit.success) {
        await db.from("vfd_sandbox_group_contributions").insert({
          group_id: group.id, user_id: m.user_id, cycle_number: group.current_cycle, amount,
        });
        if (existingFailed) {
          await db.from("vfd_sandbox_contribution_audit").update({
            error_message: null, next_retry_at: null,
          }).eq("id", existingFailed.id);
        }
        await db.from("vfd_sandbox_contribution_audit").insert({
          user_id: m.user_id, group_id: group.id, cycle_id: activeCycle.id,
          amount, contribution_type: isDdmMember ? "ddm_auto" : "auto", status: "success",
        });
        await db.from("vfd_sandbox_group_members").update({ has_contributed_current: true })
          .eq("group_id", group.id).eq("user_id", m.user_id);
        const successMsg = isDdmMember
          ? `Direct debit of ₦${amount.toLocaleString()} collected (DDM) for cycle ${group.current_cycle}`
          : `Auto-contribution of ₦${amount.toLocaleString()} processed`;
        await postChatMessage(group.id, m.user_id, successMsg, isDdmMember ? "contribution_status" : "auto_contribution");
        await sendNotification(m.user_id, "Contribution Successful",
          isDdmMember
            ? `Your bank was debited ₦${amount.toLocaleString()} via DDM for ${group.name}.`
            : `Your auto-contribution of ₦${amount.toLocaleString()} for ${group.name} was processed.`,
          "contribution_success", group.id);
        succeeded++;
      } else {
        const prevCount = existingFailed?.retry_count ?? 0;
        const newCount = prevCount + 1;
        const reachedLimit = newCount >= MAX_RETRIES;
        const nextRetry = reachedLimit ? null : new Date(Date.now() + RETRY_INTERVAL_MS).toISOString();
        const rawErr = (debit.error || "").toString();
        let errMsg: string;
        if (isDdmMember) {
          errMsg = rawErr || "Direct debit mandate debit failed";
        } else {
          const walletBal = await getVestaraWalletBalance(m.user_id);
          const truelyInsufficient = walletBal < amount || /insufficient/i.test(rawErr);
          errMsg = truelyInsufficient ? "Insufficient wallet balance" : (rawErr || "Auto-contribution failed");
        }

        if (existingFailed) {
          await db.from("vfd_sandbox_contribution_audit").update({
            retry_count: newCount, next_retry_at: nextRetry,
            error_message: errMsg, penalty_served: reachedLimit,
          }).eq("id", existingFailed.id);
        } else {
          await db.from("vfd_sandbox_contribution_audit").insert({
            user_id: m.user_id, group_id: group.id, cycle_id: activeCycle.id,
            amount, contribution_type: isDdmMember ? "ddm_auto" : "auto", status: "failed",
            retry_count: newCount, next_retry_at: nextRetry,
            error_message: errMsg, penalty_served: reachedLimit,
          });
        }

        if (reachedLimit) {
          await db.from("vfd_sandbox_penalties").insert({
            user_id: m.user_id, group_id: group.id, cycle_id: activeCycle.id,
            amount, reason: `Failed ${MAX_RETRIES} ${isDdmMember ? "direct-debit" : "auto-debit"} attempts (${errMsg})`,
          });
          await postChatMessage(group.id, m.user_id,
            `🚫 ${isDdmMember ? "Direct debit" : "Auto-contribution"} failed after ${MAX_RETRIES} attempts — penalty served.`, "contribution_failed");
          await sendNotification(m.user_id, "Penalty Served",
            `Your ${isDdmMember ? "direct debit" : "auto-contribution"} for ${group.name} failed after ${MAX_RETRIES} attempts (${errMsg}). A penalty has been recorded.`,
            "contribution_failed", group.id);
          penalized++;
        } else {
          await postChatMessage(group.id, m.user_id,
            `⚠️ ${isDdmMember ? "Direct debit" : "Auto-contribution"} failed (attempt ${newCount}/${MAX_RETRIES}) — retrying in 30 minutes.`, "contribution_failed");
          await sendNotification(m.user_id,
            `${isDdmMember ? "Direct Debit" : "Auto-contribution"} Failed — Retrying`,
            isDdmMember
              ? `Attempt ${newCount} of ${MAX_RETRIES} failed (${errMsg}). We'll retry in 30 minutes.`
              : `Attempt ${newCount} of ${MAX_RETRIES} failed (insufficient wallet). We'll retry in 30 minutes — please fund your wallet.`,
            "contribution_failed", group.id);
          failed++;
        }
      }

    }

    // After sweep, see if cycle should auto-payout
    const { count } = await db.from("vfd_sandbox_group_contributions")
      .select("*", { count: "exact", head: true })
      .eq("group_id", group.id).eq("cycle_number", group.current_cycle);
    if (count && count >= group.member_count) {
      await processAutoPayout(db, group, activeCycle);
    }

    processed.push({ group_id: group.id, name: group.name, succeeded, failed, deferred, penalized });
  }

  return jsonResponse({ data: { processed_count: processed.length, processed } });
}

// =============================================
// UPDATE GROUP SETTINGS (admin only)
// =============================================
async function handleUpdateGroupSettings(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  const { data: group } = await db.from("vfd_sandbox_groups").select("admin_id, status, funding_mode, mandate_reference").eq("id", groupId).maybeSingle();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  if (group.admin_id !== userId) return jsonResponse({ error: "Only the admin can update settings" }, 403);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowed = ["auto_debit", "contribution_hour", "contribution_minute", "contribution_day_of_week", "contribution_day_of_month", "description"] as const;
  for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];

  // Funding mode toggle (wallet ↔ ddm). Switching TO ddm requires each
  // member to individually accept the DDM mandate (₦100 fee), so the
  // group-level status starts as "pending" — it flips to "authorized"
  // automatically once every active member has signed.
  if (body.funding_mode !== undefined) {
    const fm = (body.funding_mode as string) === "ddm" ? "ddm" : "wallet";
    updates.funding_mode = fm;
    if (fm === "ddm") {
      updates.mandate_status = "pending";
      updates.mandate_reference = group.mandate_reference || `VES-DDM-AJO-${groupId}`;
      // Reset all active members to pending so they re-authorize.
      await db.from("vfd_sandbox_group_members")
        .update({ mandate_status: "pending" })
        .eq("group_id", groupId).eq("status", "active");
    } else {
      updates.mandate_status = "not_required";
      await db.from("vfd_sandbox_group_members")
        .update({ mandate_status: "not_required" })
        .eq("group_id", groupId);
    }
  }

  const { error } = await db.from("vfd_sandbox_groups").update(updates).eq("id", groupId);
  if (error) return jsonResponse({ error: error.message }, 500);
  const note = body.funding_mode !== undefined
    ? `Admin switched funding mode to ${(body.funding_mode as string).toUpperCase()}`
    : "Admin updated group settings";
  await postChatMessage(groupId, userId, note, "system");
  return jsonResponse({ data: { success: true } });
}

// =============================================
// ACCEPT GROUP DDM MANDATE (per-member, VFD-backed)
// =============================================
// Each member of a DDM-funded thrift group must individually authorize their
// Direct Debit Mandate at VFD. Flow:
//   1. Charge ₦100 setup fee from member's Vestara wallet (one-time).
//   2. Fetch a VFD BaaS access token via consumerKey/consumerSecret.
//   3. POST mandate payload to
//      https://api-devapps.vfdbank.systems/vtech-mandate/api/v2/directdebit
//   4. On VFD success (status "00" or HTTP 2xx), mark the member's mandate
//      as authorized and store the returned mandateId as mandate_reference.
//   5. Once every active member is authorized, flip the group-level
//      mandate_status to "authorized" and post a chat note.
// On VFD failure the fee is NOT refunded (matches goalsave behavior); the
// member stays "pending" with the failure payload stored in mandate_payload
// so the client can retry.
// ---------------------------------------------------------------------------
// VFD Direct-Debit / E-mandate constants, aligned to the official docs:
//   POST  {base}/mandate/setup?e-mandate=true       -> create e-mandate
//   GET   {base}/mandate/status?reference=...       -> mandate approval status
//   POST  {base}/account/debit                      -> debit the mandate
//   GET   {base}/account/balance?reference=...      -> payer's balance
// Auth header: AccessToken: <token>
// Frequency: "1" daily, "2" weekly, "3" monthly. Dates: "DD Month YYYY".
// Minimum mandate amount: NGN 1,000. Reference MUST be prefixed with the
// wallet name (we use "vestara-" so VFD can map debits back to our pool).
// ---------------------------------------------------------------------------
const AJO_DDM_MANDATE_FEE = 100;
const VFD_MANDATE_BASE =
  Deno.env.get("VFD_BASE_URL") ||
  Deno.env.get("VFD_MANDATE_BASE") ||
  ((Deno.env.get("VFD_MODE") || "sandbox").toLowerCase() === "production"
    ? "https://api-apps.vfdbank.systems"
    : "https://api-devapps.vfdbank.systems") + "/vtech-mandate/api/v2/directdebit";
// Single Vestara corporate pool NUBAN — receiver of EVERY mandate debit.
// Per-group wallets are internal ledger constructs only; they do not map to
// separate VFD accounts. DDM funds always land in this pool first, then the
// thrift ledger logic routes them to the group/member payout balance.
const VFD_POOL_NUBAN =
  Deno.env.get("VFD_CORPORATE_ACCOUNT_NUMBER") || Deno.env.get("VFD_POOL_NUBAN") || "1001695610";
const VFD_POOL_BANK_CODE =
  Deno.env.get("VFD_CORPORATE_BANK_CODE") || Deno.env.get("VFD_POOL_BANK_CODE") || "999999"; // VFD MFB
const VFD_PAYER_BANK_CODE = Deno.env.get("VFD_PAYER_BANK_CODE") || "999999"; // user's VFD account
// Dev-only toggle: skip live VFD status calls and auto-approve mandates so the
// commencement flow can be exercised end-to-end against the sandbox. MUST be
// unset (or explicitly "false") before go-live.
const MANDATE_TEST_MODE = (Deno.env.get("MANDATE_TEST_MODE") || "").toLowerCase() === "true";

// Convert a Date to "DD Month YYYY" — VFD requires exactly this format.
function formatVfdMandateDate(d: Date): string {
  const months = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${dd} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// VFD mandate frequency: daily=1, weekly=2, monthly=3.
function mapAjoFrequencyToVfd(period: string): string {
  const p = (period || "").toLowerCase();
  if (p === "daily") return "1";
  if (p === "weekly") return "2";
  return "3"; // monthly (default + safest)
}

function computeMandateEndDate(period: string, totalCycles: number): Date {
  const end = new Date();
  const cycles = Math.max(1, Number(totalCycles) || 1);
  const p = (period || "").toLowerCase();
  // Add a 2-cycle safety buffer so the mandate doesn't expire before the last debit.
  const buffered = cycles + 2;
  if (p === "daily") end.setUTCDate(end.getUTCDate() + buffered);
  else if (p === "weekly") end.setUTCDate(end.getUTCDate() + buffered * 7);
  else end.setUTCMonth(end.getUTCMonth() + buffered);
  return end;
}

// Query VFD MANDATE-APPROVAL-STATUS. The docs say to use the same `reference`
// used at creation (NOT the returned mandateCode). Bank-approved when
// data.mandateWorkflowStatusDescription === "Bank Approved".
async function checkVfdMandateApproval(reference: string, accessToken: string) {
  try {
    const url = `${VFD_MANDATE_BASE}/mandate/status?reference=${encodeURIComponent(reference)}`;
    const res = await vfdFetch(url, { method: "GET", headers: { AccessToken: accessToken } });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    const data = (json as any)?.data || {};
    const desc = String(data.mandateWorkflowStatusDescription || data.mandateWorkflowStatus || data.mandateState || "");
    const approved = /bank.?approved|approved/i.test(desc) || String(data.mandateState || "").toUpperCase() === "ACTIVE";
    return { approved, status: desc || String((json as any)?.message || "Unknown"), raw: json, http_status: res.status };
  } catch (e) {
    return { approved: false, status: "ERROR", raw: { error: e instanceof Error ? e.message : String(e) }, http_status: 0 };
  }
}

// Debit a customer's account against an approved mandate.
// POST /account/debit with { amount, narration, mandateReference, transactionReference }.
async function vfdDebitMandate(params: {
  mandateReference: string;
  amount: number;
  narration: string;
  transactionReference: string;
}) {
  const accessToken = await getVfdAccessToken();
  if (!accessToken) return { ok: false, raw: { error: "VFD credentials not configured" }, http_status: 0 };
  const payload = {
    amount: String(params.amount),
    narration: params.narration,
    mandateReference: params.mandateReference,
    transactionReference: params.transactionReference,
  };
  try {
    const res = await vfdFetch(`${VFD_MANDATE_BASE}/account/debit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", AccessToken: accessToken },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    const ok = (json as any)?.status === "00" || res.ok;
    return { ok, raw: { request: payload, response: json, http_status: res.status }, http_status: res.status };
  } catch (e) {
    return { ok: false, raw: { request: payload, error: e instanceof Error ? e.message : String(e) }, http_status: 0 };
  }
}

// ---------------------------------------------------------------------------
// VFD embeds the ₦50 NIBSS authorization account inside the human-readable
// `message` string (e.g. "...send N50 to 1234567890 at GTBANK..."). Pull the
// first 10-digit run we see and treat that as the NIBSS account.
// ---------------------------------------------------------------------------
function extractNibssAccountFromMessage(message: string): string {
  if (!message) return "";
  const m = message.match(/\b(\d{10})\b/);
  return m ? m[1] : "";
}

async function recordMandateEvent(
  groupId: string,
  userId: string,
  reference: string | null,
  mandateCode: string | null,
  eventType: string,
  payload: Record<string, unknown>,
) {
  try {
    const db = getSupabaseAdmin();
    await db.from("vfd_sandbox_group_mandates").insert({
      thrift_group_id: groupId,
      member_user_id: userId,
      mandate_reference: reference,
      mandate_code: mandateCode,
      event_type: eventType,
      event_payload: payload,
    });
  } catch (e) {
    console.error("[recordMandateEvent] insert failed", e);
  }
}

async function handleAcceptGroupMandate(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  if (!groupId) return jsonResponse({ error: "group_id required" }, 400);

  // Per-spec: payer details come from the user-submitted form, not auto-pulled
  // from their VFD account. This lets users authorize any bank (e.g. GTBank).
  const payerBankCode = String((body.payer_bank_code as string) || "").trim();
  const payerAccountNumber = String((body.payer_account_number as string) || "").trim();
  const payerPhone = String((body.payer_phone as string) || "").trim();
  const payerEmail = String((body.payer_email as string) || "").trim();
  const payerAddress = String((body.payer_address as string) || "").trim();

  const { data: group } = await db.from("vfd_sandbox_groups")
    .select("id, name, funding_mode, mandate_status, mandate_reference, admin_id, contribution_amount, period, total_cycles, max_members, commenced_at")
    .eq("id", groupId).maybeSingle();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  if (group.funding_mode !== "ddm") {
    return jsonResponse({ error: "This group is not on Direct Debit funding" }, 400);
  }

  const { data: member } = await db.from("vfd_sandbox_group_members")
    .select("id, status, mandate_status, mandate_reference, mandate_code")
    .eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (!member) return jsonResponse({ error: "You are not a member of this group" }, 403);
  if (member.status !== "active") return jsonResponse({ error: "Membership is not active" }, 400);
  if (member.mandate_status === "authorized") {
    return jsonResponse({ data: { success: true, already_authorized: true, mandate_reference: member.mandate_reference, mandate_code: member.mandate_code } });
  }

  // Validate payer form input. VFD requires all five fields.
  if (!payerBankCode || !payerAccountNumber || !payerPhone || !payerEmail || !payerAddress) {
    return jsonResponse({
      error: "Bank, account number, phone, email and address are all required to authorize a Direct Debit Mandate.",
      code: "PAYER_DETAILS_REQUIRED",
    }, 400);
  }
  if (!/^\d{10}$/.test(payerAccountNumber)) {
    return jsonResponse({ error: "Account number must be 10 digits.", code: "INVALID_ACCOUNT_NUMBER" }, 400);
  }

  // VFD minimum mandate amount is NGN 1,000.
  const mandateAmount = Math.max(1000, Number(group.contribution_amount) || 0);

  const fee = AJO_DDM_MANDATE_FEE;
  const feeRef = `VES-AJO-MND-${groupId}-${userId.slice(0, 8)}-${Date.now()}`;

  // 1) Debit ₦100 mandate-setup fee from wallet.
  //    In sandbox/test mode we skip the fee so testers don't need to fund a wallet
  //    just to exercise the mandate flow.
  if (!MANDATE_TEST_MODE) {
    const { error: wErr } = await db.rpc("vestara_withdraw", {
      _user_id: userId,
      _amount: fee,
      _reference: feeRef,
      _metadata: { source: "ajo_mandate_setup_fee", product_code: "ajo_ddm", group_id: groupId },
    });
    if (wErr) {
      const available = await getVestaraWalletBalance(userId);
      return jsonResponse({
        error: `Insufficient wallet balance for the ₦${fee} mandate setup fee. You have ₦${available.toLocaleString()}. Please fund your wallet and try again.`,
        code: "INSUFFICIENT_BALANCE",
        required: fee,
        available,
      }, 400);
    }
    // Split the ₦100 setup fee: ₦50 internal management + ₦50 NIBSS settlement.
    const internalShare = Math.floor(fee / 2);
    const nibssShare = fee - internalShare;
    await db.from("vestara_fee_ledger").insert([
      {
        user_id: userId, fee_type: "ajo_mandate_setup_internal", amount: internalShare,
        reference: `${feeRef}-INT`, tx_reference: feeRef,
        metadata: { group_id: groupId, product_code: "ajo_ddm", split: "internal", parent_fee: fee },
      },
      {
        user_id: userId, fee_type: "ajo_mandate_setup_nibss", amount: nibssShare,
        reference: `${feeRef}-NIBSS`, tx_reference: feeRef,
        metadata: { group_id: groupId, product_code: "ajo_ddm", split: "nibss", parent_fee: fee },
      },
    ]);
  }


  // 2) Build the VFD E-Mandate payload. Reference is prefixed "vestara-" so
  //    VFD can map debits back to our wallet. End date = start + (cycles *
  //    period) with a small safety buffer.
  const reference = `vestara-ddm-${groupId.slice(0, 8)}-${userId.slice(0, 8)}-${Date.now()}`;
  const startDateObj = group.commenced_at ? new Date(group.commenced_at as string) : new Date();
  const totalCycles = Number(group.total_cycles) || Number(group.max_members) || 1;
  const endDateObj = computeMandateEndDate(group.period as string, totalCycles);
  const startDate = formatVfdMandateDate(startDateObj);
  const endDate = formatVfdMandateDate(endDateObj);
  const frequencyCode = mapAjoFrequencyToVfd(group.period as string);

  const mandatePayload = {
    reference,
    payerBank: payerBankCode,
    payerAccountNumber,
    payerPhone,
    payerEmailAddress: payerEmail,
    payerAddress,
    receiverBank: VFD_POOL_BANK_CODE,
    receiverAccountNumber: VFD_POOL_NUBAN,
    amount: String(mandateAmount),
    startDate,
    endDate,
    frequency: frequencyCode,
  };

  const accessToken = await getVfdAccessToken();
  if (!accessToken) {
    await db.from("vfd_sandbox_group_members").update({
      mandate_status: "failed",
      mandate_payload: { error: "VFD credentials not configured" },
      mandate_fee_charged_at: new Date().toISOString(),
      mandate_fee_amount: fee,
    }).eq("id", member.id);
    await recordMandateEvent(groupId, userId, reference, null, "failed", { reason: "VFD credentials not configured" });
    return jsonResponse({ error: "Mandate provider unavailable. The ₦100 setup fee has been charged; please contact support.", code: "VFD_AUTH_FAILED" }, 502);
  }

  let vfdResponsePayload: Record<string, unknown> = {};
  let mandateCode = "";
  let nibssAccount = "";
  let nibssMessage = "";
  let mandateCreated = false;

  try {
    const res = await vfdFetch(`${VFD_MANDATE_BASE}/emandate/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", AccessToken: accessToken },
      body: JSON.stringify(mandatePayload),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    vfdResponsePayload = { step: "create", request: mandatePayload, response: json, http_status: res.status };

    // VFD E-Mandate returns either status "00" (immediate) or HTTP 202 Accepted
    // (NIBSS authorization pending). Both are success cases — we then poll
    // mandate-status to surface the NIBSS account/message to the user.
    const vfdStatus = String((json as any)?.status || "");
    if (vfdStatus === "00" || res.status === 202 || (res.ok && vfdStatus !== "199")) {
      mandateCreated = true;
      mandateCode = String((json as any)?.data?.mandateCode || (json as any)?.data?.mandateId || "");
      nibssMessage = String((json as any)?.message || "");
      nibssAccount = extractNibssAccountFromMessage(nibssMessage);
    }
  } catch (e) {
    vfdResponsePayload = { step: "create", request: mandatePayload, error: e instanceof Error ? e.message : String(e) };
  }

  const nowIso = new Date().toISOString();

  if (!mandateCreated) {
    await db.from("vfd_sandbox_group_members").update({
      mandate_status: "failed",
      mandate_payload: vfdResponsePayload,
      mandate_fee_charged_at: nowIso,
      mandate_fee_amount: fee,
    }).eq("id", member.id);
    await recordMandateEvent(groupId, userId, reference, null, "failed", vfdResponsePayload);
    return jsonResponse({
      error: "VFD did not create the mandate. The ₦100 setup fee has been charged; please try again.",
      code: "MANDATE_VFD_FAILED",
      details: vfdResponsePayload,
    }, 502);
  }

  // 3) Persist mandate against the membership row. Status starts at
  //    "awaiting_approval" — flips to "authorized" once the customer funds
  //    the ₦50 NIBSS account and the bank approves.
  await db.from("vfd_sandbox_group_members").update({
    contribution_method: "direct_debit",
    mandate_status: "awaiting_approval",
    mandate_reference: reference,
    mandate_code: mandateCode,
    mandate_nibss_account: nibssAccount,
    mandate_nibss_message: nibssMessage,
    mandate_payer_bank_code: payerBankCode,
    mandate_payer_account_number: payerAccountNumber,
    mandate_payer_phone: payerPhone,
    mandate_payer_email: payerEmail,
    mandate_payer_address: payerAddress,
    mandate_start_date: startDateObj.toISOString().slice(0, 10),
    mandate_end_date: endDateObj.toISOString().slice(0, 10),
    mandate_frequency: frequencyCode,
    mandate_created_at: nowIso,
    mandate_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    mandate_fee_charged_at: nowIso,
    mandate_fee_amount: fee,
    mandate_payload: vfdResponsePayload,
  }).eq("id", member.id);

  await recordMandateEvent(groupId, userId, reference, mandateCode, "created", vfdResponsePayload);

  await postChatMessage(groupId, userId,
    `submitted a Direct Debit Mandate (₦${fee} setup fee charged) — awaiting ₦50 NIBSS authorization on ${payerAccountNumber}.`,
    "system");
  await sendNotification(userId, "Mandate Created — Authorize Now",
    `Send ₦50 from your bank account ${payerAccountNumber} to NIBSS account ${nibssAccount || "(see in-app instructions)"} within 7 days to activate your Direct Debit Mandate for ${group.name}.`,
    "ddm_mandate_submitted", groupId);

  return jsonResponse({
    data: {
      success: true,
      mandate_status: "awaiting_approval",
      mandate_reference: reference,
      mandate_code: mandateCode,
      nibss_account: nibssAccount,
      nibss_message: nibssMessage,
      payer_account_number: payerAccountNumber,
      payer_bank_code: payerBankCode,
      fee_charged: fee,
      fee_reference: feeRef,
    },
  });
}

// Re-polls VFD MANDATE-APPROVAL-STATUS for a member whose mandate is
// "awaiting_approval" and promotes it to "authorized" once the bank approves.
async function handleCheckGroupMandateStatus(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  if (!groupId) return jsonResponse({ error: "group_id required" }, 400);

  const { data: group } = await db.from("vfd_sandbox_groups")
    .select("id, name, admin_id, mandate_status").eq("id", groupId).maybeSingle();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);

  const { data: member } = await db.from("vfd_sandbox_group_members")
    .select("id, mandate_status, mandate_reference, mandate_code, mandate_payload")
    .eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (!member) return jsonResponse({ error: "You are not a member of this group" }, 403);
  if (!member.mandate_reference) return jsonResponse({ data: { success: true, mandate_status: "not_authorized", bank_approved: false, pending_authorization: true } });
  if (member.mandate_status === "authorized") {
    return jsonResponse({ data: { success: true, mandate_status: "authorized", bank_approved: true } });
  }

  // Dev override: when MANDATE_TEST_MODE is on, skip the live VFD call and
  // immediately mark the mandate authorized so the rest of the commencement
  // flow can be tested end-to-end without a real ₦50 NIBSS funding leg.
  if (MANDATE_TEST_MODE) {
    const nowIso = new Date().toISOString();
    await db.from("vfd_sandbox_group_members").update({
      mandate_status: "authorized",
      mandate_authorized_at: nowIso,
      mandate_payload: { ...(member.mandate_payload as Record<string, unknown> || {}), testModeOverride: true, authorized_at: nowIso },
    }).eq("id", member.id);
    await recordMandateEvent(groupId, userId, member.mandate_reference, member.mandate_code, "authorized", { testModeOverride: true });
    await checkGroupCommencementReadiness(groupId);
    await sendNotification(userId, "Mandate Approved (Test Mode)",
      `Your Direct Debit Mandate for ${group.name} is authorized.`, "ddm_mandate_authorized", groupId);
    return jsonResponse({ data: { success: true, mandate_status: "authorized", bank_approved: true, test_mode: true } });
  }

  const accessToken = await getVfdAccessToken();
  if (!accessToken) return jsonResponse({ error: "VFD credentials not configured" }, 500);

  const approval = await checkVfdMandateApproval(member.mandate_reference, accessToken);
  const nowIso = new Date().toISOString();
  const newStatus = approval.approved ? "authorized" : "awaiting_approval";
  const merged = { ...(member.mandate_payload as Record<string, unknown> || {}), approval: approval.raw, approval_status: approval.status, last_checked_at: nowIso };
  const updates: Record<string, unknown> = { mandate_status: newStatus, mandate_payload: merged };
  if (approval.approved) updates.mandate_authorized_at = nowIso;
  await db.from("vfd_sandbox_group_members").update(updates).eq("id", member.id);

  await recordMandateEvent(groupId, userId, member.mandate_reference, member.mandate_code,
    approval.approved ? "authorized" : "status_checked",
    { approval_status: approval.status, raw: approval.raw });

  if (approval.approved) {
    const { data: pending } = await db.from("vfd_sandbox_group_members")
      .select("id").eq("group_id", groupId).eq("status", "active").neq("mandate_status", "authorized");
    if (!pending || pending.length === 0) {
      await db.from("vfd_sandbox_groups").update({ mandate_status: "authorized", updated_at: nowIso }).eq("id", groupId);
      await postChatMessage(groupId, group.admin_id,
        "All members have authorized the Direct Debit Mandate. The group is ready for automated cycle debits.",
        "system");
    }
    await sendNotification(userId, "Mandate Approved",
      `Your Direct Debit Mandate for ${group.name} has been approved by the bank.`,
      "ddm_mandate_authorized", groupId);
  }

  return jsonResponse({
    data: {
      success: true,
      mandate_status: newStatus,
      bank_approved: approval.approved,
      bank_approval_status: approval.status,
      vfd: approval.raw,
    },
  });
}




async function handleUpdateTargetSettings(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const targetId = body.target_id as string;
  const { data: target } = await db.from("vfd_sandbox_targets").select("admin_id, funding_mode, mandate_reference").eq("id", targetId).maybeSingle();
  if (!target) return jsonResponse({ error: "Target not found" }, 404);
  if (target.admin_id !== userId) return jsonResponse({ error: "Only the admin can update settings" }, 403);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.description !== undefined) updates.description = body.description;
  if (body.funding_mode !== undefined) {
    const fm = (body.funding_mode as string) === "ddm" ? "ddm" : "wallet";
    updates.funding_mode = fm;
    if (fm === "ddm") {
      // Switching to DDM puts the target in pending_authorization — each member
      // must authorize their own mandate before contributing.
      updates.mandate_status = "pending_authorization";
      updates.mandate_reference = target.mandate_reference || `VES-DDM-TARGET-${targetId}`;
    } else {
      updates.mandate_status = "not_required";
    }
  }

  const { error } = await db.from("vfd_sandbox_targets").update(updates).eq("id", targetId);
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data: { success: true } });
}

// =============================================
// COMMENCEMENT READINESS + MANDATE DEBIT (DDM)
// =============================================

// Compute group's readiness to commence. Every member must either be a wallet
// contributor, or have an authorized DDM mandate; the group must be full. Sets
// commencement_status on vfd_sandbox_groups and returns the breakdown.
async function checkGroupCommencementReadiness(groupId: string) {
  const db = getSupabaseAdmin();
  const { data: group } = await db.from("vfd_sandbox_groups")
    .select("id, admin_id, max_members, member_count, commencement_status").eq("id", groupId).maybeSingle();
  if (!group) return { ready: false, error: "Group not found" };
  const { data: members } = await db.from("vfd_sandbox_group_members")
    .select("id, contribution_method, mandate_status").eq("group_id", groupId).eq("status", "active");
  const rows = members || [];
  const total = rows.length;
  const walletReady = rows.filter((m) => m.contribution_method === "wallet").length;
  const ddmActive = rows.filter((m) => m.contribution_method === "direct_debit" && m.mandate_status === "authorized").length;
  const ddmPending = rows.filter((m) => m.contribution_method === "direct_debit" && ["awaiting_approval", "pending_authorization", "pending"].includes(String(m.mandate_status))).length;
  const ddmFailed = rows.filter((m) => m.contribution_method === "direct_debit" && ["failed", "expired"].includes(String(m.mandate_status))).length;
  const slotsEmpty = Math.max(0, Number(group.max_members) - total);
  const ready = total === Number(group.max_members) && (walletReady + ddmActive) === total;
  const status = ready ? "ready" : (slotsEmpty > 0 ? "pending_members" : "pending_mandate_auth");
  await db.from("vfd_sandbox_groups")
    .update({ commencement_status: status, updated_at: new Date().toISOString() })
    .eq("id", groupId);
  if (ready) {
    await sendNotification(group.admin_id, "Group Ready to Commence",
      "All members are ready. You can now commence this thrift group.",
      "group_ready_to_commence", groupId);
  }
  return { ready, status, breakdown: { total, walletReady, ddmActive, ddmPending, ddmFailed, slotsEmpty } };
}

async function handleCheckCommencementReadiness(userId: string, body: Record<string, unknown>) {
  const groupId = body.group_id as string;
  if (!groupId) return jsonResponse({ error: "group_id required" }, 400);
  const result = await checkGroupCommencementReadiness(groupId);
  return jsonResponse({ data: result });
}

// Cycle-time mandate debit. Inserts a pending ledger entry, calls VFD,
// then confirms or fails the entry and updates the pool ledger balance.
// Returns a normalized result so it can be invoked both as an action and
// from the auto-contribution sweep.
async function performMandateDebitForMember(
  group: Record<string, unknown>,
  member: Record<string, unknown>,
  cycleIndex: number,
): Promise<{ success: boolean; reference?: string; amount_kobo?: number; error?: string; details?: unknown }> {
  const db = getSupabaseAdmin();
  const groupId = group.id as string;
  const targetUserId = member.user_id as string;

  if (member.mandate_status !== "authorized") {
    await recordMandateEvent(groupId, targetUserId, member.mandate_reference as string, member.mandate_code as string, "debit_failed",
      { reason: "Mandate not authorized", mandate_status: member.mandate_status });
    return { success: false, error: "Mandate not authorized", details: { code: "MANDATE_NOT_ACTIVE" } };
  }

  const amountNaira = Number(group.contribution_amount) || 0;
  const amountKobo = Math.round(amountNaira * 100);
  const cycleRef = `vestara-cycle-${groupId.slice(0, 8)}-${targetUserId.slice(0, 8)}-c${cycleIndex}-${Date.now()}`;

  const { data: ledgerEntry } = await db.from("vfd_sandbox_thrift_ledger_entries").insert({
    thrift_group_id: groupId,
    member_user_id: targetUserId,
    entry_type: "ddm_contribution",
    amount_kobo: amountKobo,
    direction: "credit",
    cycle_index: cycleIndex,
    payment_reference: cycleRef,
    mandate_code: member.mandate_code,
    status: "pending",
    metadata: { mandate_reference: member.mandate_reference },
  }).select("id").single();

  await recordMandateEvent(groupId, targetUserId, member.mandate_reference as string, member.mandate_code as string, "debit_triggered",
    { cycle_index: cycleIndex, amount_naira: amountNaira, reference: cycleRef });

  const result = await vfdDebitMandate({
    mandateReference: (member.mandate_reference as string) || "",
    amount: amountNaira,
    narration: `Vestara thrift cycle ${cycleIndex} - ${group.name}`,
    transactionReference: cycleRef,
  });

  const nowIso = new Date().toISOString();
  if (result.ok) {
    const sessionId = String(((result.raw as any)?.response?.data?.sessionId) || "");
    const paymentRef = String(((result.raw as any)?.response?.data?.reference) || cycleRef);
    if (ledgerEntry?.id) {
      await db.from("vfd_sandbox_thrift_ledger_entries").update({
        status: "confirmed", confirmed_at: nowIso, vfd_session_id: sessionId, vfd_payment_reference: paymentRef,
        metadata: { mandate_reference: member.mandate_reference, vfd: result.raw },
      }).eq("id", ledgerEntry.id);
    }
    const { data: g } = await db.from("vfd_sandbox_groups")
      .select("pool_ledger_balance, total_contributed_kobo").eq("id", groupId).maybeSingle();
    await db.from("vfd_sandbox_groups").update({
      pool_ledger_balance: Number(g?.pool_ledger_balance || 0) + amountKobo,
      total_contributed_kobo: Number(g?.total_contributed_kobo || 0) + amountKobo,
      updated_at: nowIso,
    }).eq("id", groupId);
    await recordMandateEvent(groupId, targetUserId, member.mandate_reference as string, member.mandate_code as string, "debit_success",
      { cycle_index: cycleIndex, amount_naira: amountNaira, vfd: result.raw });
    return { success: true, reference: cycleRef, amount_kobo: amountKobo };
  }

  if (ledgerEntry?.id) {
    await db.from("vfd_sandbox_thrift_ledger_entries").update({
      status: "failed", metadata: { mandate_reference: member.mandate_reference, vfd: result.raw },
    }).eq("id", ledgerEntry.id);
  }
  await recordMandateEvent(groupId, targetUserId, member.mandate_reference as string, member.mandate_code as string, "debit_failed",
    { cycle_index: cycleIndex, vfd: result.raw });
  return { success: false, error: "VFD mandate debit failed", details: result.raw };
}

async function handleTriggerMandateDebit(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  const targetUserId = body.user_id as string;
  const cycleIndex = Number(body.cycle_index ?? 0);
  if (!groupId || !targetUserId) return jsonResponse({ error: "group_id and user_id required" }, 400);
  // Only the group admin (or a platform admin) may pull another member's mandate.
  if (targetUserId !== userId && !(await isGroupAdmin(groupId, userId)) && !(await isPlatformAdmin(userId))) {
    return forbidden("Only the group admin can trigger a mandate debit for another member");
  }

  const { data: member } = await db.from("vfd_sandbox_group_members")
    .select("id, user_id, mandate_status, mandate_code, mandate_reference, mandate_payer_account_number, mandate_payer_bank_code")
    .eq("group_id", groupId).eq("user_id", targetUserId).maybeSingle();
  if (!member) return jsonResponse({ error: "Member not found" }, 404);

  const { data: group } = await db.from("vfd_sandbox_groups")
    .select("id, contribution_amount, name").eq("id", groupId).maybeSingle();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);

  const result = await performMandateDebitForMember(group, member, cycleIndex);
  if (!result.success) {
    if ((result.details as any)?.code === "MANDATE_NOT_ACTIVE") {
      return jsonResponse({ error: "Mandate not authorized — flagged for admin review", code: "MANDATE_NOT_ACTIVE" }, 400);
    }
    await sendNotification(targetUserId, "Direct Debit Failed",
      `Your contribution for ${group.name} (cycle ${cycleIndex}) could not be debited. Please contact support.`,
      "ddm_debit_failed", groupId);
    return jsonResponse({ error: result.error || "VFD debit failed", code: "MANDATE_DEBIT_FAILED", details: result.details }, 502);
  }
  return jsonResponse({ data: { success: true, reference: result.reference, amount_kobo: result.amount_kobo } });
}


// Scheduler-callable safety net for missed mandate webhooks. Polls every
// pending mandate, activates approved ones, and expires those past their
// 7-day NIBSS authorization window.
async function handlePollPendingMandates() {
  const db = getSupabaseAdmin();
  const { data: pending } = await db.from("vfd_sandbox_group_members")
    .select("id, group_id, user_id, mandate_reference, mandate_code, mandate_expires_at, mandate_created_at, mandate_payload")
    .eq("mandate_status", "awaiting_approval")
    .gte("mandate_created_at", new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString());
  const rows = pending || [];
  let activated = 0, expired = 0, failed = 0, stillPending = 0;
  const accessToken = MANDATE_TEST_MODE ? "" : (await getVfdAccessToken()) || "";

  for (const m of rows) {
    const now = Date.now();
    const expiresAt = m.mandate_expires_at ? new Date(m.mandate_expires_at as string).getTime() : 0;
    if (expiresAt && expiresAt < now) {
      await db.from("vfd_sandbox_group_members").update({ mandate_status: "expired" }).eq("id", m.id);
      await recordMandateEvent(m.group_id as string, m.user_id as string, m.mandate_reference, m.mandate_code, "failed",
        { reason: "expired_7_day_window" });
      await sendNotification(m.user_id as string, "Mandate Expired",
        "Your direct debit mandate expired. Please set up direct debit again.",
        "ddm_mandate_expired", m.group_id as string);
      expired++;
      continue;
    }
    if (MANDATE_TEST_MODE || !accessToken) { stillPending++; continue; }
    const approval = await checkVfdMandateApproval(m.mandate_reference as string, accessToken);
    if (approval.approved) {
      await db.from("vfd_sandbox_group_members").update({
        mandate_status: "authorized", mandate_authorized_at: new Date().toISOString(),
      }).eq("id", m.id);
      await recordMandateEvent(m.group_id as string, m.user_id as string, m.mandate_reference, m.mandate_code, "authorized",
        { source: "poll", raw: approval.raw });
      await checkGroupCommencementReadiness(m.group_id as string);
      await sendNotification(m.user_id as string, "Mandate Approved",
        "Your direct debit mandate has been approved.", "ddm_mandate_authorized", m.group_id as string);
      activated++;
    } else if (/fail|reject|cancel/i.test(approval.status)) {
      await db.from("vfd_sandbox_group_members").update({ mandate_status: "failed" }).eq("id", m.id);
      await recordMandateEvent(m.group_id as string, m.user_id as string, m.mandate_reference, m.mandate_code, "failed",
        { source: "poll", status: approval.status, raw: approval.raw });
      failed++;
    } else {
      stillPending++;
    }
  }
  return jsonResponse({ data: { processed: rows.length, activated, expired, failed, still_pending: stillPending } });
}

// =============================================================================
// E-MANDATE — TARGET AJO + GOAL SAVINGS
// =============================================================================
// Same VFD Direct Debit Mandate flow as thrift groups, extended to per-member
// authorization on Target Ajo and per-savings authorization on Goal Savings 2.0.
// Real VFD calls only (no MANDATE_TEST_MODE shortcuts in these handlers).

interface VfdMandatePayer {
  bankCode: string; accountNumber: string; phone: string; email: string; address: string;
}

function validatePayerInput(body: Record<string, unknown>): { ok: true; payer: VfdMandatePayer } | { ok: false; error: string; code: string } {
  const bankCode = String((body.payer_bank_code as string) || "").trim();
  const accountNumber = String((body.payer_account_number as string) || "").trim();
  const phone = String((body.payer_phone as string) || "").trim();
  const email = String((body.payer_email as string) || "").trim();
  const address = String((body.payer_address as string) || "").trim();
  if (!bankCode || !accountNumber || !phone || !email || !address) {
    return { ok: false, error: "Bank, account number, phone, email and address are all required to authorize a Direct Debit Mandate.", code: "PAYER_DETAILS_REQUIRED" };
  }
  if (!/^\d{10}$/.test(accountNumber)) return { ok: false, error: "Account number must be 10 digits.", code: "INVALID_ACCOUNT_NUMBER" };
  return { ok: true, payer: { bankCode, accountNumber, phone, email, address } };
}

// Charge the standard ₦100 mandate setup fee from the user's Vestara wallet.
async function chargeMandateSetupFee(userId: string, feeRef: string, ctx: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const fee = AJO_DDM_MANDATE_FEE;
  const { error: wErr } = await db.rpc("vestara_withdraw", {
    _user_id: userId, _amount: fee, _reference: feeRef,
    _metadata: { source: "mandate_setup_fee", ...ctx },
  });
  if (wErr) {
    const available = await getVestaraWalletBalance(userId);
    return { ok: false as const, available, fee };
  }
  // Split the ₦100 setup fee: ₦50 internal management + ₦50 NIBSS settlement.
  const internalShare = Math.floor(fee / 2);
  const nibssShare = fee - internalShare;
  await db.from("vestara_fee_ledger").insert([
    {
      user_id: userId, fee_type: "mandate_setup_internal", amount: internalShare,
      reference: `${feeRef}-INT`, tx_reference: feeRef,
      metadata: { ...ctx, split: "internal", parent_fee: fee },
    },
    {
      user_id: userId, fee_type: "mandate_setup_nibss", amount: nibssShare,
      reference: `${feeRef}-NIBSS`, tx_reference: feeRef,
      metadata: { ...ctx, split: "nibss", parent_fee: fee },
    },
  ]);
  return { ok: true as const, fee };
}

// Build + POST the VFD /emandate/create payload. Returns normalised result.
async function createVfdMandate(opts: {
  reference: string; payer: VfdMandatePayer; amount: number; period: string;
  totalCycles: number; startDate?: Date;
}): Promise<{ created: boolean; mandateCode: string; nibssAccount: string; nibssMessage: string; raw: Record<string, unknown> }> {
  const accessToken = await getVfdAccessToken();
  if (!accessToken) return { created: false, mandateCode: "", nibssAccount: "", nibssMessage: "", raw: { error: "VFD credentials not configured" } };

  const startObj = opts.startDate || new Date();
  const endObj = computeMandateEndDate(opts.period, opts.totalCycles);
  const payload = {
    reference: opts.reference,
    payerBank: opts.payer.bankCode,
    payerAccountNumber: opts.payer.accountNumber,
    payerPhone: opts.payer.phone,
    payerEmailAddress: opts.payer.email,
    payerAddress: opts.payer.address,
    receiverBank: VFD_POOL_BANK_CODE,
    receiverAccountNumber: VFD_POOL_NUBAN,
    amount: String(Math.max(1000, opts.amount)),
    startDate: formatVfdMandateDate(startObj),
    endDate: formatVfdMandateDate(endObj),
    frequency: mapAjoFrequencyToVfd(opts.period),
  };

  try {
    const res = await vfdFetch(`${VFD_MANDATE_BASE}/emandate/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", AccessToken: accessToken },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    const vfdStatus = String((json as any)?.status || "");
    const created = vfdStatus === "00" || res.status === 202 || (res.ok && vfdStatus !== "199");
    const mandateCode = String((json as any)?.data?.mandateCode || (json as any)?.data?.mandateId || "");
    const nibssMessage = String((json as any)?.message || "");
    const nibssAccount = extractNibssAccountFromMessage(nibssMessage);
    return { created, mandateCode, nibssAccount, nibssMessage, raw: { step: "create", request: payload, response: json, http_status: res.status } };
  } catch (e) {
    return { created: false, mandateCode: "", nibssAccount: "", nibssMessage: "", raw: { step: "create", request: payload, error: e instanceof Error ? e.message : String(e) } };
  }
}

async function recordTargetMandateEvent(targetId: string, userId: string, reference: string | null, mandateCode: string | null, eventType: string, payload: Record<string, unknown>) {
  try {
    const db = getSupabaseAdmin();
    await db.from("vfd_sandbox_target_mandates").insert({
      target_id: targetId, member_user_id: userId,
      mandate_reference: reference, mandate_code: mandateCode,
      event_type: eventType, event_payload: payload,
    });
  } catch (e) { console.error("[recordTargetMandateEvent] insert failed", e); }
}

// ---- Target Ajo: accept mandate -------------------------------------------
async function handleAcceptTargetMandate(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const targetId = body.target_id as string;
  if (!targetId) return jsonResponse({ error: "target_id required" }, 400);

  const payerCheck = validatePayerInput(body);
  if (!payerCheck.ok) return jsonResponse({ error: payerCheck.error, code: payerCheck.code }, 400);

  const { data: target } = await db.from("vfd_sandbox_targets")
    .select("id, name, funding_mode, contribution_amount, frequency, max_members, admin_id")
    .eq("id", targetId).maybeSingle();
  if (!target) return jsonResponse({ error: "Target not found" }, 404);
  if ((target.funding_mode as string) !== "ddm") return jsonResponse({ error: "This target is not on Direct Debit funding" }, 400);

  const { data: member } = await db.from("vfd_sandbox_target_members")
    .select("id, mandate_status, mandate_reference, mandate_code")
    .eq("target_id", targetId).eq("user_id", userId).maybeSingle();
  if (!member) return jsonResponse({ error: "You are not a member of this target" }, 403);
  if (member.mandate_status === "authorized") {
    return jsonResponse({ data: { success: true, already_authorized: true, mandate_reference: member.mandate_reference, mandate_code: member.mandate_code } });
  }

  const feeRef = `VES-TARGET-MND-${targetId.slice(0, 8)}-${userId.slice(0, 8)}-${Date.now()}`;
  const feeResult = await chargeMandateSetupFee(userId, feeRef, { product_code: "target_ddm", target_id: targetId });
  if (!feeResult.ok) {
    return jsonResponse({
      error: `Insufficient wallet balance for the ₦${feeResult.fee} mandate setup fee. You have ₦${feeResult.available.toLocaleString()}. Please fund your wallet and try again.`,
      code: "INSUFFICIENT_BALANCE", required: feeResult.fee, available: feeResult.available,
    }, 400);
  }

  const reference = `vestara-ddm-target-${targetId.slice(0, 8)}-${userId.slice(0, 8)}-${Date.now()}`;
  const totalCycles = Number(target.max_members) || 1;
  const vfd = await createVfdMandate({
    reference, payer: payerCheck.payer, amount: Number(target.contribution_amount) || 0,
    period: target.frequency as string, totalCycles,
  });

  const nowIso = new Date().toISOString();
  if (!vfd.created) {
    await db.from("vfd_sandbox_target_members").update({
      mandate_status: "failed", mandate_payload: vfd.raw,
      mandate_fee_charged_at: nowIso, mandate_fee_amount: feeResult.fee,
    }).eq("id", member.id);
    await recordTargetMandateEvent(targetId, userId, reference, null, "failed", vfd.raw);
    return jsonResponse({ error: "VFD did not create the mandate. The ₦100 setup fee has been charged; please try again.", code: "MANDATE_VFD_FAILED", details: vfd.raw }, 502);
  }

  const startObj = new Date();
  const endObj = computeMandateEndDate(target.frequency as string, totalCycles);
  await db.from("vfd_sandbox_target_members").update({
    contribution_method: "direct_debit",
    mandate_status: "awaiting_approval",
    mandate_reference: reference, mandate_code: vfd.mandateCode,
    mandate_nibss_account: vfd.nibssAccount, mandate_nibss_message: vfd.nibssMessage,
    mandate_payer_bank_code: payerCheck.payer.bankCode, mandate_payer_account_number: payerCheck.payer.accountNumber,
    mandate_payer_phone: payerCheck.payer.phone, mandate_payer_email: payerCheck.payer.email,
    mandate_payer_address: payerCheck.payer.address,
    mandate_start_date: startObj.toISOString().slice(0, 10),
    mandate_end_date: endObj.toISOString().slice(0, 10),
    mandate_frequency: mapAjoFrequencyToVfd(target.frequency as string),
    mandate_created_at: nowIso,
    mandate_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    mandate_fee_charged_at: nowIso, mandate_fee_amount: feeResult.fee,
    mandate_payload: vfd.raw,
  }).eq("id", member.id);

  await recordTargetMandateEvent(targetId, userId, reference, vfd.mandateCode, "created", vfd.raw);
  await sendNotification(userId, "Mandate Created — Authorize Now",
    `Send ₦50 from your bank account ${payerCheck.payer.accountNumber} to NIBSS account ${vfd.nibssAccount || "(see in-app instructions)"} within 7 days to activate your Direct Debit Mandate for ${target.name}.`,
    "ddm_mandate_submitted", targetId);

  return jsonResponse({
    data: {
      success: true, mandate_status: "awaiting_approval",
      mandate_reference: reference, mandate_code: vfd.mandateCode,
      nibss_account: vfd.nibssAccount, nibss_message: vfd.nibssMessage,
      payer_account_number: payerCheck.payer.accountNumber, payer_bank_code: payerCheck.payer.bankCode,
      fee_charged: feeResult.fee, fee_reference: feeRef,
    },
  });
}

async function handleCheckTargetMandateStatus(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const targetId = body.target_id as string;
  if (!targetId) return jsonResponse({ error: "target_id required" }, 400);

  const { data: member } = await db.from("vfd_sandbox_target_members")
    .select("id, mandate_status, mandate_reference, mandate_code, mandate_payload")
    .eq("target_id", targetId).eq("user_id", userId).maybeSingle();
  if (!member) return jsonResponse({ error: "You are not a member of this target" }, 403);
  if (!member.mandate_reference) return jsonResponse({ data: { success: true, mandate_status: "not_authorized", bank_approved: false, pending_authorization: true } });
  if (member.mandate_status === "authorized") {
    return jsonResponse({ data: { success: true, mandate_status: "authorized", bank_approved: true } });
  }

  const accessToken = await getVfdAccessToken();
  if (!accessToken) return jsonResponse({ error: "VFD credentials not configured" }, 500);

  const approval = await checkVfdMandateApproval(member.mandate_reference as string, accessToken);
  const nowIso = new Date().toISOString();
  const newStatus = approval.approved ? "authorized" : "awaiting_approval";
  const updates: Record<string, unknown> = {
    mandate_status: newStatus,
    mandate_payload: { ...(member.mandate_payload as Record<string, unknown> || {}), approval: approval.raw, approval_status: approval.status, last_checked_at: nowIso },
  };
  if (approval.approved) updates.mandate_authorized_at = nowIso;
  await db.from("vfd_sandbox_target_members").update(updates).eq("id", member.id);
  await recordTargetMandateEvent(targetId, userId, member.mandate_reference as string, member.mandate_code as string,
    approval.approved ? "authorized" : "status_checked", { approval_status: approval.status, raw: approval.raw });

  if (approval.approved) {
    // Flip target-level status to authorized once every active member has authorized.
    const { data: pending } = await db.from("vfd_sandbox_target_members")
      .select("id").eq("target_id", targetId).neq("mandate_status", "authorized");
    if (!pending || pending.length === 0) {
      await db.from("vfd_sandbox_targets").update({ mandate_status: "authorized", updated_at: nowIso }).eq("id", targetId);
    }
    const { data: target } = await db.from("vfd_sandbox_targets").select("name").eq("id", targetId).maybeSingle();
    await sendNotification(userId, "Mandate Approved",
      `Your Direct Debit Mandate for ${target?.name || "Target Ajo"} has been approved by the bank.`,
      "ddm_mandate_authorized", targetId);
  }

  return jsonResponse({ data: { success: true, mandate_status: newStatus, bank_approved: approval.approved, bank_approval_status: approval.status, vfd: approval.raw } });
}

// ---- Goal Savings 2.0: quote + create + authorize --------------------------

function frequencyToDays(freq: string): number {
  if (freq === "daily") return 1;
  if (freq === "weekly") return 7;
  return 30;
}

async function pickGoalsaveRate(tenorDays: number): Promise<{ user_rate: number; vfd_rate: number }> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vestara_rate_configs")
    .select("user_rate, vfd_rate, min_tenor_days, max_tenor_days, is_active")
    .eq("product_code", "goalsave")
    .eq("is_active", true)
    .lte("min_tenor_days", tenorDays)
    .gte("max_tenor_days", tenorDays)
    .order("priority", { ascending: false })
    .limit(1).maybeSingle();
  return {
    user_rate: Number(data?.user_rate ?? 12),
    vfd_rate: Number(data?.vfd_rate ?? 14),
  };
}

function buildGoalsaveSchedule(startIso: string, frequency: string, tenorCount: number, amount: number) {
  const start = new Date(startIso);
  const out: { seq: number; scheduled_at: string; amount: number }[] = [];
  for (let i = 0; i < tenorCount; i++) {
    const d = new Date(start);
    if (frequency === "daily") d.setDate(d.getDate() + (i + 1));
    else if (frequency === "weekly") d.setDate(d.getDate() + (i + 1) * 7);
    else d.setMonth(d.getMonth() + (i + 1));
    out.push({ seq: i + 1, scheduled_at: d.toISOString(), amount });
  }
  return out;
}

async function handleGoalsaveV2Quote(_userId: string, body: Record<string, unknown>) {
  const amount = Number(body.amount);
  const frequency = String(body.frequency || "monthly");
  const tenorCount = Number(body.tenor_count);
  if (!Number.isFinite(amount) || amount < 1000) return jsonResponse({ error: "Contribution must be at least ₦1,000", success: false }, 400);
  if (!Number.isFinite(tenorCount) || tenorCount < 1) return jsonResponse({ error: "Invalid tenor", success: false }, 400);
  if (!["daily", "weekly", "monthly"].includes(frequency)) return jsonResponse({ error: "Frequency must be daily, weekly or monthly", success: false }, 400);
  if (frequency === "daily" && tenorCount < 7) return jsonResponse({ error: "Daily goals require at least 7 days", success: false }, 400);
  if (frequency === "weekly" && tenorCount < 4) return jsonResponse({ error: "Weekly goals require at least 4 weeks", success: false }, 400);

  const daysPerCycle = frequencyToDays(frequency);
  const tenorDays = daysPerCycle * tenorCount;
  const rates = await pickGoalsaveRate(tenorDays);
  const totalContributions = amount * tenorCount;
  const start = new Date();
  const maturity = new Date(start); maturity.setDate(maturity.getDate() + tenorDays);
  const schedule = buildGoalsaveSchedule(start.toISOString(), frequency, tenorCount, amount);
  // Time-weighted: each installment only earns for the days it is actually on
  // deposit (from its own debit date to maturity). Mirrors the projection used
  // by vestara-ledger's goalsave_v2_quote so signup quote == maturity payout.
  let projectedInterest = 0;
  for (const s of schedule) {
    const remainingDays = Math.max(
      0,
      (maturity.getTime() - new Date(s.scheduled_at).getTime()) / 86400000,
    );
    projectedInterest += s.amount * (rates.user_rate / 100) * (remainingDays / 365);
  }
  projectedInterest = Math.round(projectedInterest * 100) / 100;
  const projectedMaturity = Math.round((totalContributions + projectedInterest) * 100) / 100;
  return jsonResponse({
    success: true,
    rate: rates.user_rate,
    frequency, tenor_count: tenorCount, tenor_days: tenorDays,
    contribution_amount: amount,
    total_contributions: totalContributions,
    projected_interest: projectedInterest,
    projected_maturity_value: projectedMaturity,
    start_date: start.toISOString(),
    maturity_date: maturity.toISOString(),
    mandate_fee: AJO_DDM_MANDATE_FEE,
    schedule,
  });
}

async function handleGoalsaveV2Create(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const amount = Number(body.amount);
  const frequency = String(body.frequency || "monthly");
  const tenorCount = Number(body.tenor_count);
  const goalName = String(body.goal_name || "").trim();
  const goalPurpose = body.goal_purpose ? String(body.goal_purpose) : null;
  if (!goalName || !Number.isFinite(amount) || amount < 1000 || !Number.isFinite(tenorCount) || tenorCount < 1) {
    return jsonResponse({ error: "Invalid setup", success: false }, 400);
  }
  const daysPerCycle = frequencyToDays(frequency);
  const tenorDays = daysPerCycle * tenorCount;
  const rates = await pickGoalsaveRate(tenorDays);
  const start = new Date();
  const maturity = new Date(start); maturity.setDate(maturity.getDate() + tenorDays);

  // 1) Lock account for this goal (held by user, balance grows on each debit)
  const { data: lockAccount, error: lockErr } = await db.from("vestara_accounts").insert({
    user_id: userId, account_type: "lock", balance: 0, currency: "NGN",
    label: `Goal: ${goalName}`,
    metadata: { product_code: "goalsave", goal_name: goalName, goal_purpose: goalPurpose },
  }).select("id").single();
  if (lockErr || !lockAccount) {
    return jsonResponse({ error: "Could not create lock account", success: false, details: lockErr?.message }, 500);
  }

  // 2) vestara_savings shell (activation_status = pending_mandate)
  const { data: savings, error: sErr } = await db.from("vestara_savings").insert({
    user_id: userId, product_code: "goalsave",
    lock_account_id: lockAccount.id, principal: 0, original_principal: 0,
    user_rate: rates.user_rate, vfd_rate: rates.vfd_rate,
    tenor_days: tenorDays, start_date: start.toISOString(), maturity_date: maturity.toISOString(),
    status: "active",
    commitment_frequency: frequency, commitment_amount: amount, tenor_count: tenorCount,
    next_debit_at: tenorCount > 0 ? buildGoalsaveSchedule(start.toISOString(), frequency, tenorCount, amount)[0].scheduled_at : null,
    activation_status: "pending_mandate", mandate_status: "pending",
    mandate_fee: AJO_DDM_MANDATE_FEE,
    metadata: { goal_name: goalName, goal_purpose: goalPurpose },
  }).select("id, maturity_date").single();
  if (sErr || !savings) {
    return jsonResponse({ error: "Could not create savings", success: false, details: sErr?.message }, 500);
  }

  // 3) Schedule
  const schedule = buildGoalsaveSchedule(start.toISOString(), frequency, tenorCount, amount);
  await db.from("vfd_savings_debit_schedule").insert(schedule.map((s) => ({
    savings_id: savings.id, user_id: userId, seq: s.seq, scheduled_at: s.scheduled_at,
    amount: s.amount, status: "scheduled",
  })));

  return jsonResponse({ success: true, savings_id: savings.id, maturity_date: savings.maturity_date });
}

async function handleGoalsaveAuthorizeMandate(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const savingsId = body.savings_id as string;
  if (!savingsId) return jsonResponse({ error: "savings_id required", success: false }, 400);

  const payerCheck = validatePayerInput(body);
  if (!payerCheck.ok) return jsonResponse({ error: payerCheck.error, code: payerCheck.code, success: false }, 400);

  const { data: savings } = await db.from("vestara_savings")
    .select("id, user_id, product_code, commitment_amount, commitment_frequency, tenor_count, mandate_status, mandate_reference, mandate_code, activation_status")
    .eq("id", savingsId).maybeSingle();
  if (!savings) return jsonResponse({ error: "Savings not found", success: false }, 404);
  if (savings.user_id !== userId) return jsonResponse({ error: "Not authorized", success: false }, 403);
  if (savings.mandate_status === "authorized") {
    return jsonResponse({ success: true, already_authorized: true, mandate_reference: savings.mandate_reference, mandate_code: savings.mandate_code });
  }

  const feeRef = `VES-GOAL-MND-${savingsId.slice(0, 8)}-${Date.now()}`;
  const feeResult = await chargeMandateSetupFee(userId, feeRef, { product_code: "goalsave", savings_id: savingsId });
  if (!feeResult.ok) {
    return jsonResponse({
      error: `Insufficient wallet balance for the ₦${feeResult.fee} mandate setup fee. You have ₦${feeResult.available.toLocaleString()}. Please fund your wallet and try again.`,
      code: "INSUFFICIENT_BALANCE", required: feeResult.fee, available: feeResult.available, success: false,
    }, 400);
  }

  const reference = `vestara-ddm-goal-${savingsId.slice(0, 8)}-${Date.now()}`;
  const vfd = await createVfdMandate({
    reference, payer: payerCheck.payer,
    amount: Number(savings.commitment_amount) || 0,
    period: savings.commitment_frequency as string,
    totalCycles: Number(savings.tenor_count) || 1,
  });

  const nowIso = new Date().toISOString();
  if (!vfd.created) {
    await db.from("vestara_savings").update({
      mandate_status: "failed", mandate_payload: vfd.raw,
    }).eq("id", savingsId);
    await db.from("vfd_savings_mandate_events").insert({
      savings_id: savingsId, user_id: userId, mandate_id: reference, event_type: "failed", payload: vfd.raw,
    }).then(() => {}, () => {});
    return jsonResponse({ error: "VFD did not create the mandate. The ₦100 setup fee has been charged; please try again.", code: "MANDATE_VFD_FAILED", details: vfd.raw, success: false }, 502);
  }

  const endObj = computeMandateEndDate(savings.commitment_frequency as string, Number(savings.tenor_count) || 1);
  await db.from("vestara_savings").update({
    mandate_id: vfd.mandateCode || reference,
    mandate_reference: reference,
    mandate_code: vfd.mandateCode,
    mandate_status: "awaiting_approval",
    mandate_nibss_account: vfd.nibssAccount,
    mandate_nibss_message: vfd.nibssMessage,
    mandate_payer_bank_code: payerCheck.payer.bankCode,
    mandate_payer_account_number: payerCheck.payer.accountNumber,
    mandate_payer_phone: payerCheck.payer.phone,
    mandate_payer_email: payerCheck.payer.email,
    mandate_payer_address: payerCheck.payer.address,
    mandate_start_date: new Date().toISOString().slice(0, 10),
    mandate_end_date: endObj.toISOString().slice(0, 10),
    mandate_frequency: mapAjoFrequencyToVfd(savings.commitment_frequency as string),
    mandate_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    mandate_payload: vfd.raw,
  }).eq("id", savingsId);

  await db.from("vfd_savings_mandate_events").insert({
    savings_id: savingsId, user_id: userId, mandate_id: reference, event_type: "created", payload: vfd.raw,
  }).then(() => {}, () => {});

  await sendNotification(userId, "Mandate Created — Authorize Now",
    `Send ₦50 from your bank account ${payerCheck.payer.accountNumber} to NIBSS account ${vfd.nibssAccount || "(see in-app instructions)"} within 7 days to activate your Direct Debit Mandate for this Goal Savings.`,
    "ddm_mandate_submitted");

  return jsonResponse({
    success: true, mandate_status: "awaiting_approval",
    mandate_reference: reference, mandate_code: vfd.mandateCode,
    nibss_account: vfd.nibssAccount, nibss_message: vfd.nibssMessage,
    payer_account_number: payerCheck.payer.accountNumber, payer_bank_code: payerCheck.payer.bankCode,
    fee_charged: feeResult.fee, fee_reference: feeRef,
  });
}

async function handleGoalsaveCheckMandateStatus(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const savingsId = body.savings_id as string;
  if (!savingsId) return jsonResponse({ error: "savings_id required" }, 400);

  const { data: savings } = await db.from("vestara_savings")
    .select("id, user_id, mandate_status, mandate_reference, mandate_code, mandate_payload, activation_status")
    .eq("id", savingsId).maybeSingle();
  if (!savings) return jsonResponse({ error: "Savings not found" }, 404);
  if (savings.user_id !== userId) return jsonResponse({ error: "Not authorized" }, 403);
  if (!savings.mandate_reference) return jsonResponse({ data: { success: true, mandate_status: "not_authorized", bank_approved: false, pending_authorization: true } });
  if (savings.mandate_status === "authorized") {
    return jsonResponse({ data: { success: true, mandate_status: "authorized", bank_approved: true } });
  }

  const accessToken = await getVfdAccessToken();
  if (!accessToken) return jsonResponse({ error: "VFD credentials not configured" }, 500);

  const approval = await checkVfdMandateApproval(savings.mandate_reference as string, accessToken);
  const nowIso = new Date().toISOString();
  const newStatus = approval.approved ? "authorized" : "awaiting_approval";
  const updates: Record<string, unknown> = {
    mandate_status: newStatus,
    mandate_payload: { ...(savings.mandate_payload as Record<string, unknown> || {}), approval: approval.raw, approval_status: approval.status, last_checked_at: nowIso },
  };
  if (approval.approved) {
    updates.mandate_authorized_at = nowIso;
    updates.activation_status = "active";
  }
  await db.from("vestara_savings").update(updates).eq("id", savingsId);
  await db.from("vfd_savings_mandate_events").insert({
    savings_id: savingsId, user_id: userId, mandate_id: savings.mandate_reference, event_type: approval.approved ? "authorized" : "status_checked",
    payload: { approval_status: approval.status, raw: approval.raw },
  }).then(() => {}, () => {});

  if (approval.approved) {
    await sendNotification(userId, "Mandate Approved",
      "Your Goal Savings Direct Debit Mandate has been approved by your bank. Auto-debits will now run on schedule.",
      "ddm_mandate_authorized");
  }

  return jsonResponse({ data: { success: true, mandate_status: newStatus, bank_approved: approval.approved, bank_approval_status: approval.status, vfd: approval.raw } });
}



// =============================================
// MAIN HANDLER
// =============================================





Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: Record<string, unknown> = req.method === "POST" ? await req.json() : {};
    const action = body.action as string;

    // Cron-callable actions: no user JWT, but they MUST present the shared
    // cron secret. Previously these were reachable unauthenticated.
    const CRON_ACTIONS = new Set([
      "sandbox_auto_contribute",
      "run_due_recurring_bills",
      "send_bill_reminders",
      "poll_pending_mandates",
      "reconcile_pending_bills_cron",
    ]);
    if (action === "reconcile_pending_bills_cron" && await assertCronToken(req, "bills_reconciler")) {
      return await handleReconcilePendingBills("system", body);
    }
    if (action === "recover_stuck_split_settlements" && await assertCronToken(req, "bills_reconciler")) {
      return await handleRecoverStuckSplitSettlements();
    }
    if (action === "sweep_split_fee_cron" && assertCronCaller(req)) {
      return await handleAdminSweepSplitFee("system", body);
    }



    if (CRON_ACTIONS.has(action) && assertCronCaller(req)) {
      if (action === "sandbox_auto_contribute") return await handleSandboxAutoContribute("system", body);
      if (action === "run_due_recurring_bills") return await handleRunDueRecurringBills();
      if (action === "send_bill_reminders") return await handleSendBillReminders();
      if (action === "poll_pending_mandates") return await handlePollPendingMandates();
      if (action === "reconcile_pending_bills_cron") return await handleReconcilePendingBills("system", body);
    }


    const user = await getUserFromRequest(req);
    const userId = user.id;

    switch (action) {
      // Thrift Groups (full parity)
      case "create_group": return await handleCreateGroup(userId, body);
      case "list_groups": return await handleListGroups(userId);
      case "join_group": return await handleJoinGroup(userId, body);
      case "commence_group": return await handleCommenceGroup(userId, body);
      case "contribute_group": return await handleContributeGroup(userId, body);
      case "get_group_detail": return await handleGetGroupDetail(userId, body);
      case "request_swap": return await handleRequestSwap(userId, body);
      case "respond_swap": return await handleRespondSwap(userId, body);
      case "exit_group": return await handleExitGroup(userId, body);
      case "confirm_continue": return await handleConfirmContinue(userId, body);
      case "restart_group": return await handleRestartGroup(userId, body);
      case "search_users": return await handleSearchUsers(userId, body);
      case "invite_group_member": return await handleInviteGroupMember(userId, body);
      case "respond_group_invite": return await handleRespondGroupInvite(userId, body);
      case "create_group_invite_link": return await handleCreateGroupInviteLink(userId, body);
      case "validate_group_invite_link": return await handleValidateGroupInviteLink(body);
      case "join_group_via_link": return await handleJoinGroupViaLink(userId, body);
      case "list_group_invites": return await handleListGroupInvites(userId);
      case "list_pending_group_invitees": return await handleListPendingGroupInvitees(userId, body);
      case "auto_start_pending_groups": return await handleAutoStartPendingGroups(userId, body);
      case "post_group_chat": return await handlePostGroupChat(userId, body);
      case "list_group_chat": return await handleListGroupChat(userId, body);
      case "update_group_settings": return await handleUpdateGroupSettings(userId, body);
      case "accept_group_mandate": return await handleAcceptGroupMandate(userId, body);
      case "check_group_mandate_status": return await handleCheckGroupMandateStatus(userId, body);
      case "check_commencement_readiness": return await handleCheckCommencementReadiness(userId, body);
      case "trigger_mandate_debit": return await handleTriggerMandateDebit(userId, body);
      case "poll_pending_mandates": return (await isPlatformAdmin(userId)) ? await handlePollPendingMandates() : forbidden("Admin only");
      // E-Mandate flow extended to Target Ajo + Goal Savings 2.0
      case "accept_target_mandate": return await handleAcceptTargetMandate(userId, body);
      case "check_target_mandate_status": return await handleCheckTargetMandateStatus(userId, body);
      case "goalsave_v2_quote": return await handleGoalsaveV2Quote(userId, body);
      case "goalsave_v2_create": return await handleGoalsaveV2Create(userId, body);
      case "goalsave_v2_authorize_mandate": return await handleGoalsaveAuthorizeMandate(userId, body);
      case "goalsave_v2_check_mandate_status": return await handleGoalsaveCheckMandateStatus(userId, body);
      case "sandbox_auto_contribute": return (await isPlatformAdmin(userId)) ? await handleSandboxAutoContribute(userId, body) : forbidden("Admin only");

      // In-app notifications
      case "list_notifications": return await handleListNotifications(userId);
      case "mark_notification_read": return await handleMarkNotificationRead(userId, body);
      case "mark_all_notifications_read": return await handleMarkAllNotificationsRead(userId);

      // Target Ajo (full parity)
      case "create_target": return await handleCreateTarget(userId, body);
      case "list_targets": return await handleListTargets(userId);
      case "contribute_target": return await handleContributeTarget(userId, body);
      case "get_target_detail": return await handleGetTargetDetail(userId, body);
      case "invite_target_member": return await handleInviteTargetMember(userId, body);
      case "respond_target_invite": return await handleRespondTargetInvite(userId, body);
      case "list_pending_target_invites": return await handleListPendingTargetInvites(userId);
      case "request_target_withdrawal": return await handleRequestTargetWithdrawal(userId, body);
      case "vote_target_withdrawal": return await handleVoteTargetWithdrawal(userId, body);
      case "independent_withdrawal": return await handleIndependentWithdrawal(userId, body);
      case "update_target_settings": return await handleUpdateTargetSettings(userId, body);

      // Goal Funding (full parity)
      case "create_campaign": return await handleCreateCampaign(userId, body);
      case "list_campaigns": return await handleListCampaigns(userId);
      case "contribute_campaign": return await handleContributeCampaign(userId, body);
      case "get_campaign_detail": return await handleGetCampaignDetail(userId, body);
      case "post_campaign_update": return await handlePostCampaignUpdate(userId, body);
      case "withdraw_campaign_escrow": return await handleWithdrawCampaignEscrow(userId, body);

      // SplitPay (full parity)
      case "create_split": return await handleCreateSplit(userId, body);
      case "list_splits": return await handleListSplits(userId);
      case "join_split": return await handleJoinSplit(userId, body);
      case "pay_split": return await handlePaySplit(userId, body);
      case "cover_split_shares": return await handleCoverSplitShares(userId, body);
      case "decline_split": return await handleDeclineSplit(userId, body);
      case "cancel_split": return await handleCancelSplit(userId, body);
      case "remove_split_participant": return await handleRemoveSplitParticipant(userId, body);
      case "get_split_detail": return await handleGetSplitDetail(userId, body);
      case "invite_split_member": return await handleInviteSplitMember(userId, body);

      // Associations (full parity)
      case "create_association": return await handleCreateAssociation(userId, body);
      case "list_associations": return await handleListAssociations(userId);
      case "join_association": return await handleJoinAssociation(userId, body);
      case "get_association_detail": return await handleGetAssociationDetail(userId, body);
      case "contribute_association": return await handleContributeAssociation(userId, body);
      case "invite_assoc_member": return await handleInviteAssocMember(userId, body);
      case "respond_assoc_invite": return await handleRespondAssocInvite(userId, body);
      case "list_assoc_chat": return await handleListAssocChat(userId, body);
      case "post_assoc_chat": return await handlePostAssocChat(userId, body);
      case "admin_list_pending_assoc": return await handleAdminListPendingAssoc(userId);
      case "admin_review_assoc": return await handleAdminReviewAssoc(userId, body);
      case "admin_assoc_doc_url": return await handleAdminAssocDocUrl(userId, body);
      case "admin_sweep_split_fee": return await handleAdminSweepSplitFee(userId, body);

      // Bills Payment (VFD BaaS)
      case "bills_categories": return await handleBillsCategories();
      case "bills_billers": return await handleBillsBillers(body);
      case "bills_items": return await handleBillsItems(body);
      case "bills_validate": return await handleBillsValidate(body);
      case "bills_validation_policy": return handleBillsValidationPolicy(body);
      case "bills_pay": return await handleBillsPay(userId, body);
      case "bills_status": return await handleBillsStatus(body);

      // Bills: Beneficiaries / Receipts / Recurring
      case "list_bill_beneficiaries": return await handleListBeneficiaries(userId, body);
      case "save_bill_beneficiary": return await handleSaveBeneficiary(userId, body);
      case "delete_bill_beneficiary": return await handleDeleteBeneficiary(userId, body);
      case "list_bill_receipts": return await handleListReceipts(userId, body);
      case "reconcile_pending_bills": return await handleReconcilePendingBills(userId, body);
      case "create_recurring_bill": return await handleCreateRecurringBill(userId, body);
      case "list_recurring_bills": return await handleListRecurringBills(userId);
      case "update_recurring_bill": return await handleUpdateRecurringBill(userId, body);
      case "delete_recurring_bill": return await handleDeleteRecurringBill(userId, body);

      // Virtual Cards (VFD BaaS)
      case "create_virtual_card": return await handleCreateVirtualCard(userId, body);
      case "activate_card": return await handleActivateCard(userId, body);
      case "card_pin_change": return await handleCardPinChange(userId, body);
      case "block_card": return await handleBlockCard(userId, body);
      case "unblock_card": return await handleUnblockCard(userId, body);
      case "get_cards": return await handleGetCards(userId);
      case "get_card_details": return await handleGetCardDetails(userId, body);

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[VFD Sandbox Products Error]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
