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
    global: { headers: { Authorization: authHeader } },
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

// Helper: check available balance
async function getAvailableBalance(userId: string): Promise<number> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_user_balances").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return 0;
  return Number(data.total_balance) - Number(data.locked_balance) - Number(data.savings_balance);
}

// Helper: debit available balance (increase savings)
async function debitForSavings(userId: string, amount: number): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_user_balances").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return false;
  const avail = Number(data.total_balance) - Number(data.locked_balance) - Number(data.savings_balance);
  if (amount > avail) return false;
  await db.from("vfd_user_balances").update({
    savings_balance: Number(data.savings_balance) + amount,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  return true;
}

// Helper: credit savings back to available
async function creditFromSavings(userId: string, amount: number): Promise<void> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_user_balances").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return;
  await db.from("vfd_user_balances").update({
    savings_balance: Math.max(0, Number(data.savings_balance) - amount),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
}

// =============================================
// THRIFT GROUPS (AJO)
// =============================================

async function handleCreateGroup(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const name = body.name as string;
  const amount = Number(body.contribution_amount);
  const maxMembers = Number(body.max_members) || 5;
  const period = (body.period as string) || "monthly";

  if (!name || !amount || amount <= 0) return jsonResponse({ error: "Name and contribution amount required" }, 400);

  const { data: group, error } = await db.from("vfd_sandbox_groups").insert({
    name, admin_id: userId, contribution_amount: amount,
    period, max_members: maxMembers, total_cycles: maxMembers, status: "active",
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);

  // Add admin as first member with position 1
  await db.from("vfd_sandbox_group_members").insert({
    group_id: group.id, user_id: userId, payout_position: 1,
  });

  return jsonResponse({ data: group });
}

async function handleListGroups(userId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_sandbox_groups").select("*, vfd_sandbox_group_members(user_id)").order("created_at", { ascending: false });
  return jsonResponse({ data });
}

async function handleJoinGroup(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;

  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  if (group.member_count >= group.max_members) return jsonResponse({ error: "Group is full" }, 400);

  const position = group.member_count + 1;
  const { error } = await db.from("vfd_sandbox_group_members").insert({
    group_id: groupId, user_id: userId, payout_position: position,
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  await db.from("vfd_sandbox_groups").update({
    member_count: position, updated_at: new Date().toISOString(),
  }).eq("id", groupId);

  return jsonResponse({ data: { joined: true, position } });
}

async function handleContributeGroup(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;

  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  if (!group) return jsonResponse({ error: "Group not found" }, 404);
  if (group.status !== "active") return jsonResponse({ error: "Group is not active" }, 400);

  // Check if already contributed this cycle
  const { data: existing } = await db.from("vfd_sandbox_group_contributions")
    .select("id").eq("group_id", groupId).eq("user_id", userId).eq("cycle_number", group.current_cycle).maybeSingle();
  if (existing) return jsonResponse({ error: "Already contributed this cycle" }, 400);

  // Debit from available balance
  const amount = Number(group.contribution_amount);
  const debited = await debitForSavings(userId, amount);
  if (!debited) return jsonResponse({ error: "Insufficient available balance" }, 400);

  // Record contribution
  await db.from("vfd_sandbox_group_contributions").insert({
    group_id: groupId, user_id: userId, cycle_number: group.current_cycle, amount,
  });

  await db.from("vfd_sandbox_group_members").update({ has_contributed_current: true })
    .eq("group_id", groupId).eq("user_id", userId);

  // Check if all members contributed
  const { count } = await db.from("vfd_sandbox_group_contributions")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId).eq("cycle_number", group.current_cycle);

  if (count && count >= group.member_count) {
    // Process payout for this cycle
    const { data: recipient } = await db.from("vfd_sandbox_group_members")
      .select("user_id").eq("group_id", groupId).eq("payout_position", group.current_cycle).single();

    if (recipient) {
      const grossAmount = amount * group.member_count;
      const platformFee = Math.round(grossAmount * 0.025 * 100) / 100; // 2.5%
      const netAmount = grossAmount - platformFee;

      // Credit recipient
      await creditFromSavings(recipient.user_id, netAmount);
      // Also credit their total_balance for the interest part (payout is more than contribution)
      const addToTotal = netAmount - amount; // net gain
      if (addToTotal > 0) {
        const { data: bal } = await db.from("vfd_user_balances").select("*").eq("user_id", recipient.user_id).maybeSingle();
        if (bal) {
          await db.from("vfd_user_balances").update({
            total_balance: Number(bal.total_balance) + addToTotal + amount,
            savings_balance: Math.max(0, Number(bal.savings_balance) - amount),
            updated_at: new Date().toISOString(),
          }).eq("user_id", recipient.user_id);
        }
      }

      await db.from("vfd_sandbox_group_payouts").insert({
        group_id: groupId, recipient_id: recipient.user_id,
        cycle_number: group.current_cycle, gross_amount: grossAmount,
        platform_fee: platformFee, net_amount: netAmount,
      });

      await db.from("vfd_sandbox_group_members").update({ has_received_payout: true })
        .eq("group_id", groupId).eq("user_id", recipient.user_id);

      // Advance cycle or complete
      const nextCycle = group.current_cycle + 1;
      if (nextCycle > group.total_cycles) {
        await db.from("vfd_sandbox_groups").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", groupId);
      } else {
        await db.from("vfd_sandbox_groups").update({
          current_cycle: nextCycle, updated_at: new Date().toISOString(),
        }).eq("id", groupId);
        // Reset contribution flags
        await db.from("vfd_sandbox_group_members").update({ has_contributed_current: false }).eq("group_id", groupId);
      }
    }
  }

  return jsonResponse({ data: { contributed: true, amount, cycle: group.current_cycle } });
}

async function handleGetGroupDetail(body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const groupId = body.group_id as string;
  const { data: group } = await db.from("vfd_sandbox_groups").select("*").eq("id", groupId).single();
  const { data: members } = await db.from("vfd_sandbox_group_members").select("*").eq("group_id", groupId).order("payout_position");
  const { data: contributions } = await db.from("vfd_sandbox_group_contributions").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(20);
  const { data: payouts } = await db.from("vfd_sandbox_group_payouts").select("*").eq("group_id", groupId).order("created_at", { ascending: false });
  return jsonResponse({ data: { group, members, contributions, payouts } });
}

// =============================================
// TARGET AJO
// =============================================

async function handleCreateTarget(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const name = body.name as string;
  const goalAmount = Number(body.goal_amount);
  const maxMembers = Number(body.max_members) || 5;
  const frequency = (body.frequency as string) || "daily";
  const savingsType = (body.savings_type as string) || "group";

  if (!name || !goalAmount) return jsonResponse({ error: "Name and goal amount required" }, 400);

  const contributionAmount = Math.ceil(goalAmount / maxMembers);

  // Calculate target date
  const targetDate = new Date();
  if (frequency === "daily") targetDate.setDate(targetDate.getDate() + maxMembers);
  else if (frequency === "weekly") targetDate.setDate(targetDate.getDate() + maxMembers * 7);
  else targetDate.setMonth(targetDate.getMonth() + maxMembers);

  const { data: target, error } = await db.from("vfd_sandbox_targets").insert({
    name, admin_id: userId, goal_amount: goalAmount,
    contribution_amount: contributionAmount, frequency, max_members: maxMembers,
    savings_type: savingsType, target_date: targetDate.toISOString(), status: "active",
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);

  await db.from("vfd_sandbox_target_members").insert({
    target_id: target.id, user_id: userId,
  });

  return jsonResponse({ data: target });
}

async function handleListTargets(userId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_sandbox_targets").select("*, vfd_sandbox_target_members(user_id)").order("created_at", { ascending: false });
  return jsonResponse({ data });
}

async function handleContributeTarget(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const targetId = body.target_id as string;

  const { data: target } = await db.from("vfd_sandbox_targets").select("*").eq("id", targetId).single();
  if (!target) return jsonResponse({ error: "Target not found" }, 404);
  if (target.status !== "active") return jsonResponse({ error: "Target is not active" }, 400);

  const amount = Number(target.contribution_amount);
  const debited = await debitForSavings(userId, amount);
  if (!debited) return jsonResponse({ error: "Insufficient available balance" }, 400);

  await db.from("vfd_sandbox_target_contributions").insert({
    target_id: targetId, user_id: userId, amount,
  });

  // Update member's contributed amount
  const { data: member } = await db.from("vfd_sandbox_target_members")
    .select("*").eq("target_id", targetId).eq("user_id", userId).maybeSingle();
  if (member) {
    await db.from("vfd_sandbox_target_members").update({
      contributed_amount: Number(member.contributed_amount) + amount,
    }).eq("id", member.id);
  }

  // Update total
  const newTotal = Number(target.total_contributed) + amount;
  const updates: Record<string, unknown> = {
    total_contributed: newTotal, updated_at: new Date().toISOString(),
  };
  if (newTotal >= Number(target.goal_amount)) {
    updates.status = "completed";
  }
  await db.from("vfd_sandbox_targets").update(updates).eq("id", targetId);

  // If completed, release funds back to members
  if (newTotal >= Number(target.goal_amount)) {
    const { data: allMembers } = await db.from("vfd_sandbox_target_members").select("*").eq("target_id", targetId);
    if (allMembers) {
      for (const m of allMembers) {
        await creditFromSavings(m.user_id, Number(m.contributed_amount) + amount);
      }
    }
  }

  return jsonResponse({ data: { contributed: true, amount, total: newTotal } });
}

async function handleGetTargetDetail(body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const targetId = body.target_id as string;
  const { data: target } = await db.from("vfd_sandbox_targets").select("*").eq("id", targetId).single();
  const { data: members } = await db.from("vfd_sandbox_target_members").select("*").eq("target_id", targetId);
  const { data: contributions } = await db.from("vfd_sandbox_target_contributions").select("*").eq("target_id", targetId).order("created_at", { ascending: false }).limit(20);
  return jsonResponse({ data: { target, members, contributions } });
}

// =============================================
// GOAL FUNDING
// =============================================

async function handleCreateCampaign(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const title = body.title as string;
  const goalAmount = Number(body.goal_amount);
  const description = body.description as string || null;
  const deadline = body.deadline as string || null;

  if (!title || !goalAmount) return jsonResponse({ error: "Title and goal amount required" }, 400);

  const { data, error } = await db.from("vfd_sandbox_campaigns").insert({
    title, creator_id: userId, goal_amount: goalAmount, description,
    deadline: deadline ? new Date(deadline).toISOString() : null,
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data });
}

async function handleListCampaigns() {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_sandbox_campaigns").select("*").order("created_at", { ascending: false });
  return jsonResponse({ data });
}

async function handleContributeCampaign(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const campaignId = body.campaign_id as string;
  const amount = Number(body.amount);
  const anonymous = body.anonymous as boolean || false;
  const message = body.message as string || null;

  if (!amount || amount <= 0) return jsonResponse({ error: "Invalid amount" }, 400);

  const { data: campaign } = await db.from("vfd_sandbox_campaigns").select("*").eq("id", campaignId).single();
  if (!campaign) return jsonResponse({ error: "Campaign not found" }, 404);
  if (campaign.status !== "active") return jsonResponse({ error: "Campaign is not active" }, 400);

  const debited = await debitForSavings(userId, amount);
  if (!debited) return jsonResponse({ error: "Insufficient available balance" }, 400);

  await db.from("vfd_sandbox_campaign_contributions").insert({
    campaign_id: campaignId, contributor_id: userId, amount, anonymous, message,
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

// =============================================
// SPLITPAY
// =============================================

async function handleCreateSplit(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const title = body.title as string;
  const totalAmount = Number(body.total_amount);
  const splitCount = Number(body.split_count) || 2;

  if (!title || !totalAmount || totalAmount < 100) return jsonResponse({ error: "Title and total amount (min ₦100) required" }, 400);

  const perPerson = Math.ceil(totalAmount / splitCount);

  const { data: split, error } = await db.from("vfd_sandbox_splits").insert({
    title, creator_id: userId, total_amount: totalAmount,
    split_count: splitCount, per_person_amount: perPerson,
    merchant_name: body.merchant_name as string || null,
    merchant_account: body.merchant_account as string || null,
    merchant_bank: body.merchant_bank as string || null,
  }).select().single();

  if (error) return jsonResponse({ error: error.message }, 500);

  // Add creator as first participant
  await db.from("vfd_sandbox_split_participants").insert({
    split_id: split.id, user_id: userId, amount: perPerson,
  });

  return jsonResponse({ data: split });
}

async function handleListSplits(userId: string) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("vfd_sandbox_splits").select("*, vfd_sandbox_split_participants(user_id, status)").order("created_at", { ascending: false });
  return jsonResponse({ data });
}

async function handlePaySplit(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const splitId = body.split_id as string;

  const { data: split } = await db.from("vfd_sandbox_splits").select("*").eq("id", splitId).single();
  if (!split) return jsonResponse({ error: "Split not found" }, 404);
  if (split.status !== "active") return jsonResponse({ error: "Split is not active" }, 400);

  // Check if participant exists
  const { data: participant } = await db.from("vfd_sandbox_split_participants")
    .select("*").eq("split_id", splitId).eq("user_id", userId).maybeSingle();

  if (!participant) return jsonResponse({ error: "Not a participant" }, 400);
  if (participant.status === "paid") return jsonResponse({ error: "Already paid" }, 400);

  const amount = Number(split.per_person_amount);
  const debited = await debitForSavings(userId, amount);
  if (!debited) return jsonResponse({ error: "Insufficient available balance" }, 400);

  await db.from("vfd_sandbox_split_participants").update({
    status: "paid", paid_at: new Date().toISOString(),
  }).eq("id", participant.id);

  const newPaidCount = split.paid_count + 1;
  const updates: Record<string, unknown> = {
    paid_count: newPaidCount, updated_at: new Date().toISOString(),
  };
  if (newPaidCount >= split.split_count) updates.status = "completed";

  await db.from("vfd_sandbox_splits").update(updates).eq("id", splitId);

  return jsonResponse({ data: { paid: true, amount } });
}

async function handleJoinSplit(userId: string, body: Record<string, unknown>) {
  const db = getSupabaseAdmin();
  const splitId = body.split_id as string;

  const { data: split } = await db.from("vfd_sandbox_splits").select("*").eq("id", splitId).single();
  if (!split) return jsonResponse({ error: "Split not found" }, 404);

  const { count } = await db.from("vfd_sandbox_split_participants")
    .select("*", { count: "exact", head: true }).eq("split_id", splitId);

  if (count && count >= split.split_count) return jsonResponse({ error: "Split is full" }, 400);

  const { error } = await db.from("vfd_sandbox_split_participants").insert({
    split_id: splitId, user_id: userId, amount: Number(split.per_person_amount),
  });

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ data: { joined: true } });
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
      // Thrift Groups
      case "create_group": return await handleCreateGroup(userId, body);
      case "list_groups": return await handleListGroups(userId);
      case "join_group": return await handleJoinGroup(userId, body);
      case "contribute_group": return await handleContributeGroup(userId, body);
      case "get_group_detail": return await handleGetGroupDetail(body);

      // Target Ajo
      case "create_target": return await handleCreateTarget(userId, body);
      case "list_targets": return await handleListTargets(userId);
      case "contribute_target": return await handleContributeTarget(userId, body);
      case "get_target_detail": return await handleGetTargetDetail(body);

      // Goal Funding
      case "create_campaign": return await handleCreateCampaign(userId, body);
      case "list_campaigns": return await handleListCampaigns();
      case "contribute_campaign": return await handleContributeCampaign(userId, body);

      // SplitPay
      case "create_split": return await handleCreateSplit(userId, body);
      case "list_splits": return await handleListSplits(userId);
      case "join_split": return await handleJoinSplit(userId, body);
      case "pay_split": return await handlePaySplit(userId, body);

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[VFD Sandbox Products Error]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
