// Scheduled live-balance sweep for Vestara-owned accounts.
//
// WHY THIS EXISTS
// The admin Sub-Accounts tab polls live balances on page load, but nobody is
// watching between visits. This worker runs every 15 minutes and records the
// live bank balance of the main collection account, the corporate pool and
// every savings-product sub-account, next to what our records say should be
// there. Snapshots land in `subaccount_balance_snapshots`; when an enquiry
// fails or a product sub-account drifts from its internal expectation, every
// admin gets an in-app notification and an email.
//
// Auth: `x-cron-token` (cron) or an admin JWT (manual run from the console).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { verifyCronToken, requireAdminJwt, unauthorized } from "../_shared/cron-auth.ts";
import { vfdFetch, getGatewayAccessToken } from "../_shared/vfd-gateway.ts";
import { sendBrandedEmail } from "../_shared/send-branded-email.ts";

const VFD_MODE = (Deno.env.get("VFD_MODE") || "sandbox").toLowerCase();
const VFD_BASE_URL =
  VFD_MODE === "sandbox"
    ? "https://api-devapps.vfdbank.systems/vtech-wallet/api/v2/wallet2"
    : "https://api-apps.vfdbank.systems/vtech-wallet/api/v2/wallet2";

// Drift below this is treated as rounding/timing noise, not an alert.
const DRIFT_THRESHOLD = 1;

function db() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function extractVfdBalance(payload: unknown): number {
  const root = payload as Record<string, unknown> | null;
  const inner = (root?.data as Record<string, unknown> | undefined) ?? {};
  const candidates = [
    inner.availableBalance,
    inner.available_balance,
    inner.ledgerBalance,
    inner.ledger_balance,
    inner.accountBalance,
    inner.account_balance,
    root?.availableBalance,
    root?.ledgerBalance,
    root?.accountBalance,
  ];
  for (const candidate of candidates) {
    const amount = toNumber(candidate);
    if (amount > 0) return amount;
  }
  return 0;
}

function money(n: number) {
  return `NGN ${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function vfdGet(path: string, query?: Record<string, string>): Promise<{ data: unknown; status: number }> {
  const accessToken = await getGatewayAccessToken();
  if (!accessToken) throw new Error("No gateway token");
  const url = new URL(`${VFD_BASE_URL}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const init = { method: "GET", headers: { "Content-Type": "application/json", AccessToken: accessToken } };
  let response = await vfdFetch(url.toString(), init);
  for (let attempt = 0; attempt < 2 && [502, 503, 504].includes(response.status); attempt += 1) {
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    response = await vfdFetch(url.toString(), init);
  }
  const data = await response.json().catch(() => null);
  return { data, status: response.status };
}

// The wallet credential can only see customer NUBANs and its OWN corporate
// account. Enquiring another corporate NUBAN returns 401 "Account Not Found".
const NOT_VISIBLE = "not visible to wallet credential — needs VFD entitlement";

async function enquire(accountNo: string): Promise<{ balance: number | null; error: string | null }> {
  try {
    const { data, status } = await vfdGet("/account/enquiry", { accountNumber: accountNo });
    if (status >= 400) {
      const msg = String((data as Record<string, unknown> | null)?.message ?? "");
      const notVisible = status === 401 || /account not found/i.test(msg);
      console.error(`[subaccount-sweep] enquiry failed mode=${VFD_MODE} account=${accountNo} status=${status} body=${JSON.stringify(data).slice(0, 300)}`);
      return { balance: null, error: notVisible ? NOT_VISIBLE : `VFD ${status}` };
    }
    return { balance: extractVfdBalance(data), error: null };
  } catch (e) {
    return { balance: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// Self-enquiry (no accountNumber) returns the wallet credential's own
// corporate account — the Vestara pool. This is the only corporate balance
// VFD exposes to us today.
async function enquireSelf(): Promise<{ balance: number | null; accountNo: string | null; error: string | null }> {
  try {
    const { data, status } = await vfdGet("/account/enquiry");
    if (status >= 400) return { balance: null, accountNo: null, error: `VFD ${status}` };
    const inner = ((data as Record<string, unknown> | null)?.data ?? {}) as Record<string, unknown>;
    return {
      balance: extractVfdBalance(data),
      accountNo: (inner.accountNo as string) ?? null,
      error: null,
    };
  } catch (e) {
    return { balance: null, accountNo: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function alertAdmins(title: string, body: string) {
  const supabase = db();
  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["super_admin", "admin", "finance_admin"]);
  const adminIds = Array.from(new Set((admins || []).map((a) => a.user_id as string)));
  if (adminIds.length === 0) {
    console.error("[subaccount-sweep] ALERT but no admins to notify:", title);
    return;
  }
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", adminIds);

  for (const adminId of adminIds) {
    try {
      await supabase.rpc("insert_user_notification", {
        _user_id: adminId,
        _title: title,
        _message: body,
        _notification_type: "subaccount_balance",
      });
    } catch (e) {
      console.error("[subaccount-sweep] in-app alert failed:", e);
    }
  }
  for (const p of profiles || []) {
    if (!p.email) continue;
    try {
      await sendBrandedEmail({
        recipientEmail: p.email as string,
        recipientName: (p.full_name as string) || undefined,
        title,
        message: body,
        actionUrl: "https://vestara.ng/vst-ops-9f3c",
        actionLabel: "Open Admin Portal",
        signOff: "Please review the Sub-Accounts tab before the next reconciliation window.",
      });
    } catch (e) {
      console.error("[subaccount-sweep] email alert failed:", e);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronOk = await verifyCronToken(req, "subaccount_balance_sweep");
  if (!cronOk) {
    const admin = await requireAdminJwt(req);
    if (!admin) return unauthorized(corsHeaders);
  }

  try {
    const supabase = db();
    const poolNuban = Deno.env.get("VFD_CORPORATE_POOL_NUBAN") || "1047279595";
    const collectionNuban = Deno.env.get("VFD_CORPORATE_ACCOUNT_NUMBER") || "";

    // Internal expectation per product: principal + accrued interest on live,
    // approved contracts (same rule as the admin Sub-Accounts tab).
    const { data: savings } = await supabase
      .from("vestara_savings")
      .select("product_code, principal, accrued_interest, status, approval_status")
      .eq("status", "active");
    const internal = new Map<string, number>();
    for (const s of savings ?? []) {
      if (String(s.approval_status || "") === "pending") continue;
      const key = String(s.product_code);
      internal.set(key, (internal.get(key) ?? 0) + toNumber(s.principal) + toNumber(s.accrued_interest));
    }

    const { data: products } = await supabase
      .from("vestara_products")
      .select("code, name, sub_account_nuban, is_active")
      .eq("is_active", true)
      .order("code");

    type Target = { label: string; accountNumber: string; expected: number | null };
    const targets: Target[] = [];
    if (collectionNuban && collectionNuban !== poolNuban) {
      targets.push({ label: "Main Collection Account", accountNumber: collectionNuban, expected: null });
    }
    targets.push({ label: "Vestara Corporate Pool", accountNumber: poolNuban, expected: null });
    for (const p of products ?? []) {
      const nuban = (p.sub_account_nuban as string | null) || "";
      if (!nuban) continue;
      targets.push({
        label: `${p.name} Sub-Account`,
        accountNumber: nuban,
        expected: Number((internal.get(String(p.code)) ?? 0).toFixed(2)),
      });
    }

    const snapshots = [];
    const problems: string[] = [];
    for (const t of targets) {
      const live = await enquire(t.accountNumber);
      const drift =
        live.balance !== null && t.expected !== null
          ? Number((live.balance - t.expected).toFixed(2))
          : null;
      snapshots.push({
        account_label: t.label,
        account_number: t.accountNumber,
        live_balance: live.balance,
        internal_expected: t.expected,
        drift,
        error: live.error,
      });
      if (live.error) {
        problems.push(`• ${t.label} (${t.accountNumber}) — balance enquiry failed: ${live.error}`);
      } else if (drift !== null && Math.abs(drift) > DRIFT_THRESHOLD) {
        problems.push(
          `• ${t.label} (${t.accountNumber}) — live ${money(live.balance!)} vs expected ${money(t.expected!)} (drift ${money(drift)})`,
        );
      }
    }

    const { error: insertError } = await supabase.from("subaccount_balance_snapshots").insert(snapshots);
    if (insertError) {
      console.error("[subaccount-sweep] snapshot insert failed:", insertError);
    }

    if (problems.length > 0) {
      const title = `Sub-account balance alert (${problems.length})`;
      const body =
        `${problems.length} issue${problems.length === 1 ? "" : "s"} found in the scheduled balance sweep:\n\n` +
        problems.slice(0, 10).join("\n") +
        (problems.length > 10 ? `\n…and ${problems.length - 10} more.` : "") +
        `\n\nInvestigate before the next reconciliation window.`;
      await alertAdmins(title, body);
    }

    return new Response(
      JSON.stringify({ ok: true, checked: snapshots.length, problems: problems.length, snapshots }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[subaccount-sweep] fatal:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
