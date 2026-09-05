/**
 * Shared sender for Vestara app emails.
 *
 * All outbound app email goes through the platform email pipeline
 * (send-transactional-email -> queue -> verified sender domain notify.vestara.ng).
 * Direct Resend calls from `@vestara.ng` are rejected (domain not verified there),
 * so no edge function should call the Resend API directly.
 */
export interface BrandedEmailDetail {
  label: string;
  value: string;
}

export interface BrandedEmailInput {
  recipientEmail: string;
  recipientName?: string;
  title: string;
  message: string;
  /** Optional pre-sanitised rich HTML body; replaces the plain message block. */
  messageHtml?: string;
  details?: BrandedEmailDetail[];
  actionUrl?: string;
  actionLabel?: string;
  idempotencyKey?: string;
  /** Presentation-only extras handled by the shared email shell. */
  highlightLabel?: string;
  highlightValue?: string;
  signOff?: string;
  securityNotice?: boolean;
  showAppBadges?: boolean;
}

export async function sendBrandedEmail(input: BrandedEmailInput): Promise<{ ok: boolean; error?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: 'Email service not configured' };
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        templateName: 'notification',
        recipientEmail: input.recipientEmail,
        idempotencyKey: input.idempotencyKey,
        templateData: {
          recipientName: input.recipientName?.split(' ')[0] || 'there',
          title: input.title,
          message: input.message,
          messageHtml: input.messageHtml,
          details: input.details,
          actionUrl: input.actionUrl,
          actionLabel: input.actionLabel,
          highlightLabel: input.highlightLabel,
          highlightValue: input.highlightValue,
          signOff: input.signOff,
          securityNotice: input.securityNotice,
          showAppBadges: input.showAppBadges,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`send-transactional-email failed [${res.status}]: ${body}`);
      return { ok: false, error: `[${res.status}] ${body}` };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('send-transactional-email request error:', msg);
    return { ok: false, error: msg };
  }
}
