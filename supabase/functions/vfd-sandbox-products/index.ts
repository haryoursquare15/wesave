import { createClient } from "npm:@supabase/supabase-js@2";

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

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// =============================================
// VFD ADAPTER LAYER
// =============================================

async function fetchVfdLiveBalance(userId: string): Promise<number> {
  const db = getSupabaseAdmin();
  const { data: client } = await db.from("vfd_sandbox_clients").select("vfd_account_number").eq("user_id", userId).maybeSingle();
  if (!client?.vfd_account_number) return 0;

  try {
    const vfdBase = Deno.env.get("VFD_API_BASE") || "https://api-devapps.vfdbank.systems";
    const consumerKey = Deno.env.get("VFD_CONSUMER_KEY");
    const consumerSecret = Deno.env.get("VFD_CONSUMER_SECRET");
    if (!consumerKey || !consumerSecret) return 0;

    const authResp = await fetch(`${vfdBase}/vfd-tech/baas-portal/v1.1/baasauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consumerKey, consumerSecret, validityTime: "-1" }),
    });
    const authRaw = await authResp.text();
    const authData = authRaw ? JSON.parse(authRaw) : {};
    const accessToken = authData?.data?.access_token;
    if (!accessToken) return 0;

    const balResp = await fetch(`${vfdBase}/vtech-wallet/api/v2/wallet2/account/enquiry?accountNumber=${client.vfd_account_number}`, {
      headers: { AccessToken: accessToken },
    });
    const balData = await balResp.json();
    return Number(balData?.data?.availableBalance) || 0;
  } catch (e) {
    console.error("[VFD balance sync error]", e);
    return 0;
  }
}

// =============================================
// INTERNAL LEDGER (Source of Truth)
// =============================================

async function ensureBalanceRow(userId: string, forceSync = false): Promise<{ total_balance: number; locked_balance: number; savings_balance: number }> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_user_balances").select("*").eq("user_id", userId).maybeSingle();

  if (data && !forceSync) {
    return { total_balance: Number(data.total_balance), locked_balance: Number(data.locked_balance), savings_balance: Number(data.savings_balance) };
  }

  const liveBalance = await fetchVfdLiveBalance(userId);
  const locked = data ? Number(data.locked_balance) : 0;
  const savings = data ? Number(data.savings_balance) : 0;
  const totalBalance = Math.max(liveBalance, locked + savings);

  await db.from("vfd_user_balances").upsert({
    user_id: userId, total_balance: totalBalance, locked_balance: locked, savings_balance: savings,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  return { total_balance: totalBalance, locked_balance: locked, savings_balance: savings };
}

async function getAvailableBalance(userId: string): Promise<number> {
  const bal = await ensureBalanceRow(userId);
  return bal.total_balance - bal.locked_balance - bal.savings_balance;
}

async function debitForSavings(userId: string, amount: number): Promise<boolean> {
  const db = getSupabaseAdmin();
  let bal = await ensureBalanceRow(userId);
  let avail = bal.total_balance - bal.locked_balance - bal.savings_balance;

  if (amount > avail) {
    bal = await ensureBalanceRow(userId, true);
    avail = bal.total_balance - bal.locked_balance - bal.savings_balance;
    if (amount > avail) return false;
  }

  await db.from("vfd_user_balances").update({
    savings_balance: bal.savings_balance + amount,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  return true;
}

async function creditFromSavings(userId: string, amount: number): Promise<void> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_user_balances").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return;
  await db.from("vfd_user_balances").update({
    savings_balance: Math.max(0, Number(data.savings_balance) - amount),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
}

async function debitWallet(userId: string, amount: number): Promise<boolean> {
  const db = getSupabaseAdmin();
  let bal = await ensureBalanceRow(userId);
  let avail = bal.total_balance - bal.locked_balance - bal.savings_balance;

  if (amount > avail) {
    bal = await ensureBalanceRow(userId, true);
    avail = bal.total_balance - bal.locked_balance - bal.savings_balance;
    if (amount > avail) return false;
  }

  await db.from("vfd_user_balances").update({
    total_balance: bal.total_balance - amount,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  return true;
}

async function creditWallet(userId: string, amount: number): Promise<void> {
  const db = getSupabaseAdmin();
  const bal = await ensureBalanceRow(userId);
  await db.from("vfd_user_balances").update({
    total_balance: bal.total_balance + amount,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
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

  // Production parity: max 2 active groups per user
  const { count: activeCount } = await db.from("vfd_sandbox_group_members")
    .select("*, vfd_sandbox_groups!inner(status)", { count: "exact", head: true })
    .eq("user_id", userId).eq("status", "active")
    .in("vfd_sandbox_groups.status", ["pending", "active"]);
  if (activeCount && activeCount >= 2) {
    return jsonResponse({ error: "You can only be a member of up to 2 active groups at a time" }, 400);
  }

  const name = body.name as string;
  const amount = Number(body.contribution_amount);
  const maxMembers = Number(body.max_members) || 5;
  const period = (body.period as string) || "monthly";
  const description = (body.description as string) || null;
  const autoDebit = body.auto_debit !== false;
  const contributionHour = Number(body.contribution_hour) || 16;
  const contributionMinute = Number(body.contribution_minute) || 0;
  const contributionDayOfWeek = Number(body.contribution_day_of_week) || 1;
  const contributionDayOfMonth = Number(body.contribution_day_of_month) || 1;

  if (!name || !amount || amount <= 0) return jsonResponse({ error: "Name and contribution amount required" }, 400);
  if (maxMembers < 3 || maxMembers > 20) return jsonResponse({ error: "Members must be between 3 and 20" }, 400);
  if (amount < 5000 || amount > 500000) return jsonResponse({ error: "Contribution must be between ₦5,000 and ₦500,000" }, 400);

  const { data: group, error } = await db.from("vfd_sandbox_groups").insert({
    name, admin_id: userId, contribution_amount: amount,
    period, max_members: maxMembers, total_cycles: maxMembers,
    status: "pending",
    description, auto_debit: autoDebit,
    contribution_hour: contributionHour, contribution_minute: contributionMinute,
    contribution_day_of_week: contributionDayOfWeek,
    contribution_day_of_month: contributionDayOfMonth,
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);

  await db.from("vfd_sandbox_group_members").insert({
    group_id: group.id, user_id: userId, status: "active",
  });

  await postChatMessage(group.id, userId, "Group created. Waiting for members to join.", "system");

  return jsonResponse({ data: group });
}

async function handleListGroups(userId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_sandbox_groups")
    .select("*, vfd_sandbox_group_members(user_id, status, payout_position)")
    .order("created_at", { ascending: false });
  return jsonResponse({ data });
}

async function handleJoinGroup(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;

  const { data: existing } = await db.from("vfd_sandbox_group_members")
    .select("id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (existing) return jsonResponse({ data: { joined: true, message: "Already a member" } });

  // Production parity: max 2 active groups per user
  const { count: activeCount } = await db.from("vfd_sandbox_group_members")
    .select("*, vfd_sandbox_groups!inner(status)", { count: "exact", head: true })
    .eq("user_id", userId).eq("status", "active")
    .in("vfd_sandbox_groups.status", ["pending", "active"]);
  if (activeCount && activeCount >= 2) {
    return jsonResponse({ error: "You can only be a member of up to 2 active groups at a time" }, 400);
  }

  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  if (group.status !== "pending") return jsonResponse({ error: "Group is no longer accepting members" }, 400);
  if (group.member_count >= group.max_members) return jsonResponse({ error: "Group is full" }, 400);

  const newCount = group.member_count + 1;
  const { error } = await db.from("vfd_sandbox_group_members").insert({
    group_id: groupId, user_id: userId, status: "active",
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  await db.from("vfd_sandbox_groups").update({
    member_count: newCount, updated_at: new Date().toISOString(),
  }).eq("id", groupId);

  await postChatMessage(groupId, userId, "has joined the group", "member_join");
  await sendNotification(group.admin_id, "New Member", `A new member has joined ${group.name} (${newCount}/${group.max_members})`, "member_joined", groupId);

  return jsonResponse({ data: { joined: true, member_count: newCount, max_members: group.max_members } });
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
  if (!group || group.status !== "active") return jsonResponse({ error: "Group is not active" }, 400);

  const { data: requester } = await db.from("vfd_sandbox_group_members")
    .select("*").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
  if (!requester) return jsonResponse({ error: "Not a member" }, 400);
  if (requester.has_used_swap) return jsonResponse({ error: "You have already used your swap for this group" }, 400);
  if (requester.has_received_payout) return jsonResponse({ error: "Cannot swap after receiving payout" }, 400);

  const { count: contribCount } = await db.from("vfd_sandbox_group_contributions")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId).eq("cycle_number", group.current_cycle);
  if (contribCount && contribCount > 0) return jsonResponse({ error: "Cannot swap after contributions have started for this cycle" }, 400);

  const { data: target } = await db.from("vfd_sandbox_group_members")
    .select("*").eq("group_id", groupId).eq("user_id", targetId).maybeSingle();
  if (!target) return jsonResponse({ error: "Target is not a member" }, 400);
  if (target.has_received_payout) return jsonResponse({ error: "Target has already received payout" }, 400);

  const { data: existing } = await db.from("vfd_sandbox_position_swaps")
    .select("id").eq("group_id", groupId).eq("requester_id", userId).eq("status", "pending").maybeSingle();
  if (existing) return jsonResponse({ error: "You already have a pending swap request" }, 400);

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

  const { data: activeCycle } = await db.from("vfd_sandbox_contribution_cycles")
    .select("*").eq("group_id", groupId).eq("status", "active").single();
  if (!activeCycle) return jsonResponse({ error: "No active contribution cycle" }, 400);

  // Idempotency
  const { data: existingContrib } = await db.from("vfd_sandbox_group_contributions")
    .select("id").eq("group_id", groupId).eq("user_id", userId).eq("cycle_number", group.current_cycle).maybeSingle();
  if (existingContrib) return jsonResponse({ error: "Already contributed this cycle" }, 400);

  const amount = Number(group.contribution_amount);
  const debited = await debitForSavings(userId, amount);
  if (!debited) return jsonResponse({ error: "Insufficient wallet balance. Please fund your wallet first." }, 400);

  await db.from("vfd_sandbox_group_contributions").insert({
    group_id: groupId, user_id: userId, cycle_number: group.current_cycle, amount,
  });

  await db.from("vfd_sandbox_contribution_audit").insert({
    user_id: userId, group_id: groupId, cycle_id: activeCycle.id,
    amount, contribution_type: "manual", status: "success",
  });

  await db.from("vfd_sandbox_group_members").update({ has_contributed_current: true })
    .eq("group_id", groupId).eq("user_id", userId);

  await postChatMessage(groupId, userId, `has contributed ₦${amount.toLocaleString()} to the pool`, "contribution_status");
  await sendNotification(userId, "Contribution Successful",
    `Your contribution of ₦${amount.toLocaleString()} has been recorded.`,
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
      cycle: group.current_cycle, payment_source: "wallet",
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

  // Release recipient's own savings contribution, then credit net gain
  await creditFromSavings(recipientId, amount);
  await creditWallet(recipientId, netAmount - amount);

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

async function handleGetGroupDetail(body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  const { data: members } = await db.from("vfd_sandbox_group_members").select("*").eq("group_id", groupId).order("payout_position");
  const { data: contributions } = await db.from("vfd_sandbox_group_contributions").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(50);
  const { data: payouts } = await db.from("vfd_sandbox_group_payouts").select("*").eq("group_id", groupId).order("created_at", { ascending: false });
  const { data: cycles } = await db.from("vfd_sandbox_contribution_cycles").select("*").eq("group_id", groupId).order("cycle_number");
  const { data: swaps } = await db.from("vfd_sandbox_position_swaps").select("*").eq("group_id", groupId).order("created_at", { ascending: false });
  const { data: chat } = await db.from("vfd_sandbox_chat_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(50);

  return jsonResponse({ data: { group, members, contributions, payouts, cycles, swaps, chat } });
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
  if (!membership) return jsonResponse({ error: "Not a member" }, 400);

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

  if (!activeMembers || activeMembers.length < group.max_members) {
    return jsonResponse({ error: `Need ${group.max_members} active members to restart (currently ${activeMembers?.length || 0})` }, 400);
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
  const maxMembers = Number(body.max_members) || 5;
  const frequency = (body.frequency as string) || "daily";
  const savingsType = (body.savings_type as string) || "group";
  const description = (body.description as string) || null;
  const reason = (body.reason as string) || null;

  if (!name || !goalAmount) return jsonResponse({ error: "Name and goal amount required" }, 400);
  if (goalAmount < 1000) return jsonResponse({ error: "Target must be at least ₦1,000" }, 400);

  const contributionAmount = Math.ceil(goalAmount / maxMembers);
  if (contributionAmount < 100) return jsonResponse({ error: "Contribution per member is too low. Increase target or reduce members." }, 400);

  const targetDate = new Date();
  if (frequency === "daily") targetDate.setDate(targetDate.getDate() + maxMembers);
  else if (frequency === "weekly") targetDate.setDate(targetDate.getDate() + maxMembers * 7);
  else targetDate.setMonth(targetDate.getMonth() + maxMembers);

  const inviteLimit = maxMembers - 1;

  const { data: target, error } = await db.from("vfd_sandbox_targets").insert({
    name, admin_id: userId, goal_amount: goalAmount,
    contribution_amount: contributionAmount, frequency, max_members: maxMembers,
    savings_type: savingsType, target_date: targetDate.toISOString(), status: "active",
    description, reason, invite_limit: inviteLimit,
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);
  await db.from("vfd_sandbox_target_members").insert({ target_id: target.id, user_id: userId });

  // Send invites if provided
  const inviteeIds = body.invitee_ids as string[] | undefined;
  if (inviteeIds && inviteeIds.length > 0) {
    const invites = inviteeIds.slice(0, inviteLimit).map(inviteeId => ({
      target_id: target.id, inviter_id: userId, invitee_id: inviteeId,
    }));
    await db.from("vfd_sandbox_target_invites").insert(invites);
    for (const inv of invites) {
      await sendNotification(inv.invitee_id, "Target Ajo Invite",
        `You've been invited to join "${name}" savings group.`, "target_invite");
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

  const { data: membership } = await db.from("vfd_sandbox_target_members")
    .select("*").eq("target_id", targetId).eq("user_id", userId).maybeSingle();
  if (!membership) return jsonResponse({ error: "You must be a member to contribute" }, 400);

  const amount = Number(target.contribution_amount);
  const debited = await debitForSavings(userId, amount);
  if (!debited) return jsonResponse({ error: "Insufficient available balance. Please fund your wallet first." }, 400);

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
          await creditFromSavings(m.user_id, memberContributed);
          await sendNotification(m.user_id, "🎯 Target Achieved!",
            `"${target.name}" has reached its savings target! ₦${memberContributed.toLocaleString()} has been released to your wallet.`,
            "target_achieved");
        }
      }
    }
  }

  return jsonResponse({ data: { contributed: true, amount, total: newTotal, target_reached: targetReached, tx_ref: txRef } });
}

async function handleGetTargetDetail(body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const targetId = body.target_id as string;
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

  return jsonResponse({ data: { target, members: members || [], contributions: contributions || [], invites: invites || [], withdrawal_requests: withdrawalRequests || [], votes } });
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
      await db.from("vfd_sandbox_target_members").insert({
        target_id: invite.target_id, user_id: userId,
      });
      const { data: target } = await db.from("vfd_sandbox_targets").select("member_count").eq("id", invite.target_id).single();
      if (target) {
        await db.from("vfd_sandbox_targets").update({
          member_count: (target.member_count || 1) + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", invite.target_id);
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

  const { data: target } = await db.from("vfd_sandbox_targets").select("*").eq("id", targetId).single();
  if (!target) return jsonResponse({ error: "Target not found" }, 404);
  if (target.savings_type !== "group") return jsonResponse({ error: "Withdrawal requests are only for group mode" }, 400);

  const { data: membership } = await db.from("vfd_sandbox_target_members")
    .select("*").eq("target_id", targetId).eq("user_id", userId).maybeSingle();
  if (!membership) return jsonResponse({ error: "Not a member" }, 400);

  // Production parity: Required votes = 2/3 of members (matching live which says "2/3 member approval")
  const { count: memberCount } = await db.from("vfd_sandbox_target_members")
    .select("*", { count: "exact", head: true }).eq("target_id", targetId);
  const requiredVotes = Math.ceil(((memberCount || 1) * 2) / 3);

  const { data: wr, error } = await db.from("vfd_sandbox_target_withdrawal_requests").insert({
    target_id: targetId, requested_by: userId, amount,
    reason, required_votes: requiredVotes,
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data: wr });
}

// Target Ajo: Vote on withdrawal
async function handleVoteTargetWithdrawal(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const requestId = body.request_id as string;
  const vote = body.vote as string;

  const { data: wr } = await db.from("vfd_sandbox_target_withdrawal_requests").select("*").eq("id", requestId).single();
  if (!wr) return jsonResponse({ error: "Request not found" }, 404);
  if (wr.status !== "pending") return jsonResponse({ error: "Request already resolved" }, 400);

  const { data: membership } = await db.from("vfd_sandbox_target_members")
    .select("id").eq("target_id", wr.target_id).eq("user_id", userId).maybeSingle();
  if (!membership) return jsonResponse({ error: "Not a member" }, 400);

  const { data: existingVote } = await db.from("vfd_sandbox_target_withdrawal_votes")
    .select("id").eq("withdrawal_request_id", requestId).eq("user_id", userId).maybeSingle();
  if (existingVote) return jsonResponse({ error: "Already voted" }, 400);

  await db.from("vfd_sandbox_target_withdrawal_votes").insert({
    withdrawal_request_id: requestId, user_id: userId, vote,
  });

  const newApproval = wr.approval_count + (vote === "approve" ? 1 : 0);
  const newRejection = wr.rejection_count + (vote === "reject" ? 1 : 0);

  await db.from("vfd_sandbox_target_withdrawal_requests").update({
    approval_count: newApproval, rejection_count: newRejection,
  }).eq("id", requestId);

  if (newApproval >= wr.required_votes) {
    await creditFromSavings(wr.requested_by, Number(wr.amount));
    await db.from("vfd_sandbox_target_withdrawal_requests").update({
      status: "approved", resolved_at: new Date().toISOString(),
    }).eq("id", requestId);

    await sendNotification(wr.requested_by, "Withdrawal Approved",
      `Your withdrawal of ₦${Number(wr.amount).toLocaleString()} has been approved and credited.`,
      "withdrawal_approved");
  }

  const { count: totalMembers } = await db.from("vfd_sandbox_target_members")
    .select("*", { count: "exact", head: true }).eq("target_id", wr.target_id);
  const remainingVotes = (totalMembers || 0) - newApproval - newRejection;
  if (newApproval + remainingVotes < wr.required_votes) {
    await db.from("vfd_sandbox_target_withdrawal_requests").update({
      status: "rejected", resolved_at: new Date().toISOString(),
    }).eq("id", requestId);

    await sendNotification(wr.requested_by, "Withdrawal Rejected",
      `Your withdrawal request was rejected by the group.`,
      "withdrawal_rejected");
  }

  return jsonResponse({ data: { voted: true, vote } });
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
  if (!membership) return jsonResponse({ error: "Not a member" }, 400);

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
  const title = body.title as string;
  const goalAmount = Number(body.goal_amount);
  const description = body.description as string || null;
  const deadline = body.deadline as string || null;
  const contributionVisibility = (body.contribution_visibility as string) || "public";
  const beneficiaryAccountName = body.beneficiary_account_name as string || null;
  const beneficiaryBankName = body.beneficiary_bank_name as string || null;
  const beneficiaryAccountNumber = body.beneficiary_account_number as string || null;
  const campaignImage = body.campaign_image as string || null;

  if (!title || !goalAmount) return jsonResponse({ error: "Title and goal amount required" }, 400);

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

  const { data, error } = await db.from("vfd_sandbox_campaigns").insert({
    title, creator_id: userId, goal_amount: goalAmount, description,
    deadline: deadline ? new Date(deadline).toISOString() : null,
    contribution_visibility: contributionVisibility,
    beneficiary_account_name: beneficiaryAccountName,
    beneficiary_bank_name: beneficiaryBankName,
    beneficiary_account_number: beneficiaryAccountNumber,
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

  const debited = await debitWallet(userId, amount);
  if (!debited) return jsonResponse({ error: "Insufficient available balance" }, 400);

  const contributionRef = `goal-${campaignId}-${userId}-${Date.now()}`;

  await db.from("vfd_sandbox_campaign_contributions").insert({
    campaign_id: campaignId, contributor_id: userId, amount, anonymous, message,
    contributor_name: contributorName,
    contribution_reference: contributionRef,
  });

  const newRaised = Number(campaign.raised_amount) + amount;
  const updates: Record<string, unknown> = {
    raised_amount: newRaised,
    contributor_count: campaign.contributor_count + 1,
    updated_at: new Date().toISOString(),
  };
  if (newRaised >= Number(campaign.goal_amount)) updates.status = "completed";
  await db.from("vfd_sandbox_campaigns").update(updates).eq("id", campaignId);

  return jsonResponse({ data: { contributed: true, amount, total_raised: newRaised } });
}

async function handleGetCampaignDetail(body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const campaignId = body.campaign_id as string;

  const { data: campaign } = await db.from("vfd_sandbox_campaigns").select("*").eq("id", campaignId).single();
  if (!campaign) return jsonResponse({ error: "Campaign not found" }, 404);

  const { data: contributions } = await db.from("vfd_sandbox_campaign_contributions")
    .select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false });

  const { data: updates } = await db.from("vfd_sandbox_campaign_updates")
    .select("*").eq("campaign_id", campaignId).order("created_at", { ascending: false });

  return jsonResponse({ data: { campaign, contributions: contributions || [], updates: updates || [] } });
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

  // PRODUCTION PARITY: minimum ₦1,000 (not ₦100)
  if (!title || !totalAmount || totalAmount < 1000) return jsonResponse({ error: "Title and total amount (min ₦1,000) required" }, 400);
  if (splitCount < 2) return jsonResponse({ error: "Need at least 2 participants" }, 400);

  const perPerson = Math.ceil((totalAmount / splitCount) * 100) / 100;
  // PRODUCTION PARITY: ₦100 flat fee (not 1.5%)
  const platformFee = 100;
  const feePerPerson = Math.ceil((platformFee / splitCount) * 100) / 100;
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);

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
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);

  // Creator is first participant
  await db.from("vfd_sandbox_split_participants").insert({
    split_id: split.id, user_id: userId, amount: perPerson,
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
  if (count && count >= split.split_count) return jsonResponse({ error: "Split is full" }, 400);

  const { error } = await db.from("vfd_sandbox_split_participants").insert({
    split_id: splitId, user_id: userId, amount: Number(split.per_person_amount),
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ data: { joined: true } });
}

async function handlePaySplit(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const splitId = body.split_id as string;

  const { data: split } = await db.from("vfd_sandbox_splits").select("*").eq("id", splitId).single();
  if (!split) return jsonResponse({ error: "Split not found" }, 404);
  if (split.status !== "active") return jsonResponse({ error: "Split is not active" }, 400);

  const { data: participant } = await db.from("vfd_sandbox_split_participants")
    .select("*").eq("split_id", splitId).eq("user_id", userId).maybeSingle();
  if (!participant) return jsonResponse({ error: "Not a participant" }, 400);
  if (participant.status === "paid") return jsonResponse({ error: "Already paid" }, 400);
  if (participant.status === "declined") return jsonResponse({ error: "You have declined this split" }, 400);

  const amount = Number(split.per_person_amount);
  const feeShare = Number(split.fee_per_person || Math.ceil(100 / split.split_count));
  const totalDebit = amount + feeShare;

  // Production parity: debit bill share + fee share
  const debited = await debitWallet(userId, totalDebit);
  if (!debited) return jsonResponse({ error: `Insufficient available balance. Need ₦${totalDebit.toLocaleString()} (₦${amount.toLocaleString()} share + ₦${feeShare.toLocaleString()} fee)` }, 400);

  await db.from("vfd_sandbox_split_participants").update({
    status: "paid", paid_at: new Date().toISOString(),
  }).eq("id", participant.id);

  await db.from("vfd_sandbox_split_transactions").insert({
    split_id: splitId, user_id: userId, amount: totalDebit,
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
  }

  return jsonResponse({ data: { paid: true, amount: totalDebit, bill_share: amount, fee_share: feeShare, all_paid: allPaid } });
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
  const feeShare = Math.ceil(100 / split.split_count);
  for (const p of paidParticipants || []) {
    const refundAmount = Number(p.amount) + feeShare;
    await creditWallet(p.user_id, refundAmount);
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
  if (split.status !== "active") return jsonResponse({ error: "Can only manage active splits" }, 400);

  const { data: participant } = await db.from("vfd_sandbox_split_participants")
    .select("*").eq("split_id", splitId).eq("user_id", participantUserId).maybeSingle();
  if (!participant) return jsonResponse({ error: "Participant not found" }, 400);

  // Refund if already paid
  if (participant.status === "paid") {
    const feeShare = Math.ceil(100 / split.split_count);
    const refundAmount = Number(participant.amount) + feeShare;
    await creditWallet(participantUserId, refundAmount);
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

// SplitPay: Get detail
async function handleGetSplitDetail(body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const splitId = body.split_id as string;

  const { data: split } = await db.from("vfd_sandbox_splits").select("*").eq("id", splitId).single();
  if (!split) return jsonResponse({ error: "Split not found" }, 404);

  const { data: participants } = await db.from("vfd_sandbox_split_participants")
    .select("*").eq("split_id", splitId);

  const { data: transactions } = await db.from("vfd_sandbox_split_transactions")
    .select("*").eq("split_id", splitId).order("created_at", { ascending: false });

  return jsonResponse({ data: { split, participants: participants || [], transactions: transactions || [] } });
}

// =============================================
// ASSOCIATION HANDLERS
// =============================================

async function handleCreateAssociation(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const name = body.name as string;
  const description = (body.description as string) || null;
  const maxMembers = Math.min(Math.max(Number(body.max_members) || 50, 5), 50);

  if (!name?.trim()) return jsonResponse({ error: "Association name is required" }, 400);

  const { data: assoc, error } = await db.from("vfd_sandbox_associations").insert({
    name: name.trim(), description, admin_id: userId,
    max_members: maxMembers, member_count: 1,
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

  const { data: all } = await db.from("vfd_sandbox_associations")
    .select("*").eq("status", "active").order("created_at", { ascending: false });

  const { data: memberships } = await db.from("vfd_sandbox_association_memberships")
    .select("association_id").eq("user_id", userId);
  const myIds = new Set((memberships || []).map((m: { association_id: string }) => m.association_id));

  const mine = (all || []).filter((a: { id: string }) => myIds.has(a.id));

  return jsonResponse({ all: all || [], mine });
}

async function handleJoinAssociation(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const associationId = body.association_id as string;
  if (!associationId) return jsonResponse({ error: "association_id required" }, 400);

  const { data: assoc } = await db.from("vfd_sandbox_associations").select("*").eq("id", associationId).single();
  if (!assoc) return jsonResponse({ error: "Association not found" }, 404);
  if (assoc.member_count >= assoc.max_members) return jsonResponse({ error: "Association is full" }, 400);

  const { data: existing } = await db.from("vfd_sandbox_association_memberships")
    .select("id").eq("association_id", associationId).eq("user_id", userId).maybeSingle();
  if (existing) return jsonResponse({ data: { joined: true, already_member: true } });

  const { error } = await db.from("vfd_sandbox_association_memberships").insert({
    association_id: associationId, user_id: userId, role: "member",
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  await db.from("vfd_sandbox_associations").update({
    member_count: assoc.member_count + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", associationId);

  return jsonResponse({ data: { joined: true } });
}

async function handleGetAssociationDetail(body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const associationId = body.association_id as string;
  if (!associationId) return jsonResponse({ error: "association_id required" }, 400);

  const { data: assoc } = await db.from("vfd_sandbox_associations").select("*").eq("id", associationId).single();
  if (!assoc) return jsonResponse({ error: "Association not found" }, 404);

  const { data: wallet } = await db.from("vfd_sandbox_association_wallets")
    .select("available_balance").eq("association_id", associationId).maybeSingle();

  const { data: members } = await db.from("vfd_sandbox_association_memberships")
    .select("user_id, role, joined_at").eq("association_id", associationId).order("joined_at");

  const { data: contributions } = await db.from("vfd_sandbox_association_contributions")
    .select("*").eq("association_id", associationId).order("created_at", { ascending: false }).limit(50);

  return jsonResponse({
    data: {
      ...assoc,
      wallet_balance: wallet?.available_balance || 0,
      members: members || [],
      contributions: contributions || [],
    },
  });
}

async function handleContributeAssociation(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const associationId = body.association_id as string;
  const amount = Number(body.amount);
  const narration = (body.narration as string) || null;

  if (!associationId) return jsonResponse({ error: "association_id required" }, 400);
  if (!amount || amount <= 0) return jsonResponse({ error: "Valid amount required" }, 400);

  const { data: membership } = await db.from("vfd_sandbox_association_memberships")
    .select("id").eq("association_id", associationId).eq("user_id", userId).maybeSingle();
  if (!membership) return jsonResponse({ error: "You must be a member to contribute" }, 403);

  const debited = await debitWallet(userId, amount);
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

  return jsonResponse({ data: { contributed: true, amount } });
}

// =============================================
// BILLS PAYMENT (VFD BaaS)
// =============================================

const VFD_BILLS_BASE_TEST = "https://api-devapps.vfdbank.systems/vtech-bills/api/v2/billspaymentstore";
const VFD_BILLS_BASE_LIVE = "https://api-apps.vfdbank.systems/vtech-bills/api/v2/billspaymentstore";

async function getVfdAccessToken(): Promise<string | null> {
  const vfdBase = Deno.env.get("VFD_API_BASE") || "https://api-devapps.vfdbank.systems";
  const consumerKey = Deno.env.get("VFD_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("VFD_CONSUMER_SECRET");
  if (!consumerKey || !consumerSecret) {
    console.error("[Bills] VFD_CONSUMER_KEY or VFD_CONSUMER_SECRET not set");
    return null;
  }
  try {
    const authUrl = `${vfdBase}/vfd-tech/baas-portal/v1.1/baasauth/token`;
    const authResp = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consumerKey, consumerSecret, validityTime: "-1" }),
    });
    const raw = await authResp.text();
    if (!raw) { console.error("[Bills auth] Empty response, status:", authResp.status); return null; }
    const d = JSON.parse(raw);
    if (d?.status === "00" && d?.data?.access_token) {
      return d.data.access_token;
    }
    console.error("[Bills auth] Unexpected response:", raw.substring(0, 200));
    return null;
  } catch (e) {
    console.error("[Bills auth error]", e);
    return null;
  }
}

function getBillsBase(): string {
  return (Deno.env.get("VFD_ENVIRONMENT") || "test") === "live" ? VFD_BILLS_BASE_LIVE : VFD_BILLS_BASE_TEST;
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
  const resp = await fetch(`${getBillsBase()}/billercategory`, { headers: { AccessToken: token } });
  return jsonResponse({ data: await safeJson(resp) });
}

async function handleBillsBillers(body: Record<string, unknown>) {
  const cat = body.categoryName as string || "";
  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);
  const url = cat ? `${getBillsBase()}/billerlist?categoryName=${encodeURIComponent(cat)}` : `${getBillsBase()}/billerlist`;
  const resp = await fetch(url, { headers: { AccessToken: token } });
  return jsonResponse({ data: await safeJson(resp) });
}

async function handleBillsItems(body: Record<string, unknown>) {
  const { billerId, divisionId, productId } = body as { billerId: string; divisionId: string; productId: string };
  if (!billerId || !divisionId || !productId) return jsonResponse({ error: "billerId, divisionId, productId required" }, 400);
  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);
  const resp = await fetch(
    `${getBillsBase()}/billerItems?billerId=${encodeURIComponent(billerId)}&divisionId=${encodeURIComponent(divisionId)}&productId=${encodeURIComponent(productId)}`,
    { headers: { AccessToken: token } }
  );
  return jsonResponse({ data: await safeJson(resp) });
}

async function handleBillsValidate(body: Record<string, unknown>) {
  const { customerId, divisionId, paymentItem, billerId } = body as {
    customerId: string; divisionId: string; paymentItem: string; billerId: string;
  };
  if (!customerId || !divisionId || !paymentItem || !billerId) return jsonResponse({ error: "Missing validate fields" }, 400);
  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);
  const resp = await fetch(
    `${getBillsBase()}/customervalidate?customerId=${encodeURIComponent(customerId)}&divisionId=${encodeURIComponent(divisionId)}&paymentItem=${encodeURIComponent(paymentItem)}&billerId=${encodeURIComponent(billerId)}`,
    { headers: { AccessToken: token } }
  );
  return jsonResponse({ data: await safeJson(resp) });
}

async function handleBillsPay(userId: string, body: Record<string, unknown>) {
  const { customerId, amount, division, paymentItem, productId, billerId, phoneNumber } = body as {
    customerId: string; amount: string; division: string; paymentItem: string;
    productId: string; billerId: string; phoneNumber?: string;
  };
  if (!customerId || !amount || !division || !paymentItem || !productId || !billerId) {
    return jsonResponse({ error: "Missing required payment fields" }, 400);
  }
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) return jsonResponse({ error: "Invalid amount" }, 400);

  const bal = await ensureBalanceRow(userId);
  const available = bal.total_balance - bal.locked_balance - bal.savings_balance;
  if (numAmount > available) return jsonResponse({ error: "Insufficient balance" }, 400);

  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);

  const reference = `wesave-bill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payBody: Record<string, string> = { customerId, amount: amount.toString(), division, paymentItem, productId, billerId, reference };
  if (phoneNumber) payBody.phoneNumber = phoneNumber;

  const resp = await fetch(`${getBillsBase()}/pay`, {
    method: "POST",
    headers: { AccessToken: token, "Content-Type": "application/json" },
    body: JSON.stringify(payBody),
  });
  const data = await safeJson(resp);

  if (data?.status === "00") {
    const db = getSupabaseAdmin();
    await db.from("vfd_sandbox_balances").update({ total_balance: bal.total_balance - numAmount }).eq("user_id", userId);
    await db.from("vfd_sandbox_transactions").insert({
      user_id: userId, transaction_type: "debit", amount: numAmount,
      description: `Bill Payment: ${billerId.toUpperCase()} - ${customerId}`,
      reference, status: "completed",
    });
  }

  return jsonResponse({ data: { ...data, reference } });
}

async function handleBillsStatus(body: Record<string, unknown>) {
  const { transactionId } = body as { transactionId: string };
  if (!transactionId) return jsonResponse({ error: "transactionId required" }, 400);
  const token = await getVfdAccessToken();
  if (!token) return jsonResponse({ error: "VFD auth failed" }, 500);
  const resp = await fetch(`${getBillsBase()}/transactionStatus?transactionId=${encodeURIComponent(transactionId)}`, { headers: { AccessToken: token } });
  return jsonResponse({ data: await safeJson(resp) });
}

// =============================================
// MAIN HANDLER
// =============================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await getUserFromRequest(req);
    const userId = user.id;
    const body: Record<string, unknown> = req.method === "POST" ? await req.json() : {};
    const action = body.action as string;

    switch (action) {
      // Thrift Groups (full parity)
      case "create_group": return await handleCreateGroup(userId, body);
      case "list_groups": return await handleListGroups(userId);
      case "join_group": return await handleJoinGroup(userId, body);
      case "commence_group": return await handleCommenceGroup(userId, body);
      case "contribute_group": return await handleContributeGroup(userId, body);
      case "get_group_detail": return await handleGetGroupDetail(body);
      case "request_swap": return await handleRequestSwap(userId, body);
      case "respond_swap": return await handleRespondSwap(userId, body);
      case "exit_group": return await handleExitGroup(userId, body);
      case "confirm_continue": return await handleConfirmContinue(userId, body);
      case "restart_group": return await handleRestartGroup(userId, body);

      // Target Ajo (full parity)
      case "create_target": return await handleCreateTarget(userId, body);
      case "list_targets": return await handleListTargets(userId);
      case "contribute_target": return await handleContributeTarget(userId, body);
      case "get_target_detail": return await handleGetTargetDetail(body);
      case "invite_target_member": return await handleInviteTargetMember(userId, body);
      case "respond_target_invite": return await handleRespondTargetInvite(userId, body);
      case "request_target_withdrawal": return await handleRequestTargetWithdrawal(userId, body);
      case "vote_target_withdrawal": return await handleVoteTargetWithdrawal(userId, body);
      case "independent_withdrawal": return await handleIndependentWithdrawal(userId, body);

      // Goal Funding (full parity)
      case "create_campaign": return await handleCreateCampaign(userId, body);
      case "list_campaigns": return await handleListCampaigns(userId);
      case "contribute_campaign": return await handleContributeCampaign(userId, body);
      case "get_campaign_detail": return await handleGetCampaignDetail(body);
      case "post_campaign_update": return await handlePostCampaignUpdate(userId, body);

      // SplitPay (full parity)
      case "create_split": return await handleCreateSplit(userId, body);
      case "list_splits": return await handleListSplits(userId);
      case "join_split": return await handleJoinSplit(userId, body);
      case "pay_split": return await handlePaySplit(userId, body);
      case "decline_split": return await handleDeclineSplit(userId, body);
      case "cancel_split": return await handleCancelSplit(userId, body);
      case "remove_split_participant": return await handleRemoveSplitParticipant(userId, body);
      case "get_split_detail": return await handleGetSplitDetail(body);

      // Associations (full parity)
      case "create_association": return await handleCreateAssociation(userId, body);
      case "list_associations": return await handleListAssociations(userId);
      case "join_association": return await handleJoinAssociation(userId, body);
      case "get_association_detail": return await handleGetAssociationDetail(body);
      case "contribute_association": return await handleContributeAssociation(userId, body);

      // Bills Payment (VFD BaaS)
      case "bills_categories": return await handleBillsCategories();
      case "bills_billers": return await handleBillsBillers(body);
      case "bills_items": return await handleBillsItems(body);
      case "bills_validate": return await handleBillsValidate(body);
      case "bills_pay": return await handleBillsPay(userId, body);
      case "bills_status": return await handleBillsStatus(body);

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[VFD Sandbox Products Error]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
