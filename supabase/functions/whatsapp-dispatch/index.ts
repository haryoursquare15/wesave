// Receives in-app notification inserts (database trigger) and sends the matching
// approved WhatsApp template to opted-in users. Best-effort: never affects the app.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendWhatsAppAlert } from "../_shared/whatsapp-notify.ts";
import { canSendWhatsAppAlert } from "../_shared/whatsapp-policy.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Only money / thrift / savings / mandate events go to WhatsApp.
const ALLOWED = new Set([
  "transfer_received", "transfer_sent", "transfer_failed", "transfer_reversed", "wallet_credit", "credit_received",
  "contribution_success", "contribution_failed", "payout_received", "payout_notification",
  "ddm_mandate_submitted", "ddm_mandate_authorized", "mandate_debit_succeeded", "mandate_debit_failed",
  "bill_payment", "split_refund", "lock_created", "lock_broken", "savings_failed", "goal_debit_failed",
]);

const ngn = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const amountIn = (m: string) => m.match(/(?:₦|NGN\s?)\s?[\d,]+(?:\.\d+)?/)?.[0]?.replace(/^NGN\s?/, "₦") ?? null;

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const provided = req.headers.get("x-cron-token") || "";
    const { data: tok } = await db.from("internal_cron_tokens").select("token").eq("name", "internal_notifications").maybeSingle();
    if (!provided || !tok?.token || !safeEqual(provided, tok.token as string)) return json({ error: "Unauthorized" }, 401);

    const { record: r } = await req.json();
    if (!r?.id || !r?.user_id || !r?.notification_type) return json({ error: "Invalid payload" }, 400);
    const type = String(r.notification_type);
    if (!canSendWhatsAppAlert({ notificationType: type, title: String(r.title || '') })) {
      return json({ skipped: true, reason: "whatsapp_transaction_alerts_disabled" });
    }
    if (!ALLOWED.has(type)) return json({ skipped: true });

    const title = String(r.title || "Vestara update");
    const msg = String(r.message || "");
    const [{ data: client }, { data: group }] = await Promise.all([
      db.from("vfd_sandbox_clients").select("full_name").eq("user_id", r.user_id).maybeSingle(),
      r.group_id ? db.from("vfd_sandbox_groups").select("name, contribution_amount").eq("id", r.group_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const groupName = (group?.name as string) || msg.match(/for ([^.]+?)(?: was| is|\.|$)/)?.[1] || "your group";
    const amt = amountIn(msg);
    const balance = async () => {
      const { data } = await db.rpc("vestara_user_ledger_wallet_balance", { _user_id: r.user_id });
      return data == null ? "available in your app" : ngn(Number(data));
    };

    let template: string | undefined;
    let params: string[] | undefined;
    if ((type === "transfer_received" || type === "credit_received") && amt) {
      const from = msg.match(/from (.+?)\.(?:\s|$)/)?.[1] || "a sender";
      template = "vestara_money_alert"; params = ["received", amt, "from", from, await balance()];
    } else if (type === "wallet_credit" && amt) {
      template = "vestara_money_alert"; params = ["received", amt, "into", "your wallet", await balance()];
    } else if (type === "transfer_sent" && amt) {
      const to = msg.match(/sent to (.+?)\.(?:\s|$)/)?.[1] || "the recipient";
      template = "vestara_money_alert"; params = ["sent", amt, "to", to, await balance()];
    } else if (type === "contribution_failed") {
      const a = amt || (group?.contribution_amount ? ngn(Number(group.contribution_amount)) : "your contribution");
      const reason = /insufficient/i.test(msg) ? "your wallet balance was too low"
        : /mandate|expired/i.test(msg) ? "your direct-debit authority is not active" : "the debit did not go through";
      template = "vestara_thrift_failed"; params = [a, groupName, reason];
    } else if (["contribution_success", "payout_received", "payout_notification"].includes(type)) {
      template = "vestara_thrift_update"; params = [groupName, msg.replace(/\.$/, "")];
    } else if (type === "mandate_debit_succeeded" && amt) {
      template = "vestara_debit_success"; params = [amt, group?.name ? `your thrift group ${group.name}` : "your plan", await balance()];
    } else if (["mandate_debit_failed", "savings_failed", "goal_debit_failed"].includes(type) && amt) {
      template = "vestara_savings_failed";
      params = [group?.name ? "thrift" : "savings", amt, /insufficient/i.test(msg) ? "your balance was too low" : "the debit did not go through"];
    }
    // Everything else uses the approved general account alert.

    await sendWhatsAppAlert(db, {
      userId: r.user_id, notificationId: r.id, name: (client?.full_name as string) || null,
      title, message: msg, template, params, notificationType: type,
    });
    return json({ ok: true, template: template ?? "vestara_account_alert" });
  } catch (e) {
    console.error("whatsapp-dispatch error:", e);
    return json({ ok: false }, 200);
  }
});
