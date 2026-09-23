/**
 * Shared sender for Vestara app emails.
 *
 * All outbound app email goes through Lovable's managed email delivery using
 * the shared `notification` template and the verified sender domain
 * notify.vestara.ng. Suppression, retries and unsubscribe handling are enforced
 * by Lovable server-side, so no edge function should call an email provider
 * API directly.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendTemplateEmail } from './transactional-email-templates/send-email.ts';

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

const TEMPLATE_NAME = 'notification';

/**
 * Append-only send history. Mirrors the outcome of the managed send; a log
 * failure never changes the send result.
 */
async function logSend(
  recipientEmail: string,
  status: 'sent' | 'suppressed' | 'failed',
  errorMessage?: string,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;

  const supabase = createClient(supabaseUrl, serviceKey);
  const { error } = await supabase.from('email_send_log').insert({
    message_id: null,
    template_name: TEMPLATE_NAME,
    recipient_email: recipientEmail,
    status,
    error_message: errorMessage ? errorMessage.slice(0, 1000) : null,
  });

  if (error) {
    console.error('Failed to write email_send_log', { code: error.code, message: error.message });
  }
}

// Addresses that must never receive automated app/ops emails (e.g. retired
// admin inboxes). Sends to these are skipped silently and logged as such.
const EMAIL_EXCLUSIONS = new Set(['samir@wesave.ng']);

export async function sendBrandedEmail(input: BrandedEmailInput): Promise<{ ok: boolean; error?: string }> {
  if (EMAIL_EXCLUSIONS.has(input.recipientEmail.trim().toLowerCase())) {
    console.log(`Email skipped — excluded recipient ${input.recipientEmail}`);
    return { ok: true };
  }
  try {
    const result = await sendTemplateEmail(TEMPLATE_NAME, input.recipientEmail, {
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
    });

    if (!result.sent) {
      await logSend(input.recipientEmail, 'suppressed');
      console.log('Email not sent — recipient suppressed');
      // A suppressed recipient is an expected outcome, not a delivery failure.
      return { ok: true };
    }

    await logSend(input.recipientEmail, 'sent');
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await logSend(input.recipientEmail, 'failed', msg);
    console.error('Branded email send failed:', msg);
    return { ok: false, error: msg };
  }
}
