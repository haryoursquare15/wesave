/**
 * Single place that tells a customer their VFD e-mandate is live.
 *
 * Fires three channels for every approval, on every product (thrift group,
 * Target Ajo, Goal Savings): in-app notification, branded email and web push.
 * Reads the mandate row itself so the message always carries the real amount,
 * frequency, start/end dates and setup-fee breakdown.
 */
import { sendBrandedEmail } from "./send-branded-email.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const money = (n: unknown) => `₦${new Intl.NumberFormat("en-NG").format(Number(n || 0))}`;

const dateLabel = (d: unknown) => {
  if (!d) return "—";
  const parsed = new Date(String(d));
  if (isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
};

const freqLabel = (f: unknown) => {
  const v = String(f || "").toLowerCase();
  if (v === "daily" || v === "1") return "Daily";
  if (v === "weekly" || v === "2") return "Weekly";
  if (v === "monthly" || v === "3") return "Monthly";
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : "—";
};

const PRODUCT_LABEL: Record<string, string> = {
  thrift: "Ajo Thrift Group",
  target_ajo: "Target Ajo",
  fd_investment: "Goal Savings",
};

export interface MandateApprovedInput {
  userId: string;
  /** thrift | target_ajo | fd_investment */
  productType: string;
  /** group / target / savings id */
  productReference?: string | null;
  /** VFD mandate reference — preferred lookup key */
  mandateReference?: string | null;
  /** Friendly product name, e.g. the group or plan name. */
  subjectName?: string;
}

export async function notifyMandateApproved(db: Db, input: MandateApprovedInput): Promise<void> {
  try {
    let query = db
      .from("mandates")
      .select(
        "amount, frequency, start_date, end_date, setup_fee, setup_fee_internal_share, setup_fee_nibss_share, mandate_reference, payer_account_number, product_type, product_reference",
      )
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (input.mandateReference) query = query.eq("mandate_reference", input.mandateReference);
    else if (input.productReference) {
      query = query.eq("product_type", input.productType).eq("product_reference", input.productReference);
    }
    const { data: rows } = await query;
    const m = (rows && rows[0]) || null;

    const productLabel = PRODUCT_LABEL[input.productType] || "Vestara";
    const subject = input.subjectName || productLabel;
    const title = "E-Mandate Approved";
    const message =
      `Great news — your bank has approved the direct-debit mandate for ${subject}. ` +
      `Contributions will now be collected automatically on schedule.`;

    const details = [
      { label: "Product", value: `${productLabel}${input.subjectName ? ` — ${input.subjectName}` : ""}` },
      { label: "Mandate amount", value: `${money(m?.amount)} / ${freqLabel(m?.frequency).toLowerCase()}` },
      { label: "Start date", value: dateLabel(m?.start_date) },
      { label: "End date", value: dateLabel(m?.end_date) },
      { label: "Status", value: "Active (bank approved)" },
      {
        label: "Setup fee",
        value: `${money(m?.setup_fee ?? 100)} (${money(m?.setup_fee_internal_share ?? 50)} management + ${money(m?.setup_fee_nibss_share ?? 50)} NIBSS)`,
      },
      { label: "Payer account", value: String(m?.payer_account_number || "—") },
      { label: "Reference", value: String(m?.mandate_reference || input.mandateReference || "—") },
    ];

    // 1. In-app notification (main app inbox)
    await db
      .rpc("insert_user_notification", {
        _user_id: input.userId,
        _title: title,
        _message: message,
        _notification_type: "ddm_mandate_authorized",
      })
      .then(() => {}, () => {});

    // 2. Email
    const { data: profile } = await db
      .from("profiles")
      .select("email, full_name")
      .eq("id", input.userId)
      .maybeSingle();

    if (profile?.email) {
      await sendBrandedEmail({
        recipientEmail: profile.email as string,
        recipientName: (profile.full_name as string) || undefined,
        title,
        message,
        details,
        highlightLabel: "Mandate amount",
        highlightValue: `${money(m?.amount)} / ${freqLabel(m?.frequency).toLowerCase()}`,
        actionUrl: "https://app.vestara.ng/app",
        actionLabel: "View mandate",
        idempotencyKey: `mandate-approved-${input.userId}-${m?.mandate_reference || input.mandateReference || input.productReference}`,
        securityNotice: true,
      });
    }

    // 3. Web push
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceKey) {
      await fetch(`${supabaseUrl}/functions/v1/push-notification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_push",
          user_id: input.userId,
          title,
          body: `${subject}: mandate active — ${money(m?.amount)} ${freqLabel(m?.frequency).toLowerCase()}.`,
          url: "/app",
          tag: "mandate-approved",
        }),
      }).catch(() => null);
    }
  } catch (err) {
    console.error("notifyMandateApproved failed:", err instanceof Error ? err.message : String(err));
  }
}
