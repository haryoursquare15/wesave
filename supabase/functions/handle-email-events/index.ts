import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Notification-only bookkeeping. Lovable's managed delivery already enforces
// suppression at send time — these rows exist so the app's own admin views and
// history keep working exactly as before.

const REASON_MESSAGE: Record<string, string> = {
  bounce: 'Permanent bounce — email address is invalid or rejected',
  complaint: 'Spam complaint — recipient marked email as spam',
  unsubscribe: 'Recipient unsubscribed',
}

const REASON_STATUS: Record<string, string> = {
  bounce: 'bounced',
  complaint: 'complained',
  unsubscribe: 'suppressed',
}

function db() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase environment variables are not configured')
  }
  return createClient(supabaseUrl, serviceKey)
}

async function record(
  eventId: string,
  recipient: string,
  messageId: string | null,
  reason: 'bounce' | 'complaint' | 'unsubscribe',
): Promise<void> {
  const supabase = db()
  const email = recipient.toLowerCase()

  // 1. Suppression record — upsert keeps redeliveries idempotent.
  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert({ email, reason, metadata: null }, { onConflict: 'email' })

  if (suppressError) {
    console.error('Failed to upsert suppressed email', {
      event_id: eventId,
      code: suppressError.code,
      message: suppressError.message,
    })
    throw new Error('Failed to write suppression')
  }

  // 2. Append-only send history entry for the terminal event.
  const { error: logError } = await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: 'system',
    recipient_email: email,
    status: REASON_STATUS[reason],
    error_message: REASON_MESSAGE[reason],
    metadata: null,
  })

  if (logError) {
    console.error('Failed to insert email_send_log', {
      event_id: eventId,
      code: logError.code,
      message: logError.message,
    })
    throw new Error('Failed to write send log')
  }
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await record(event.event_id, event.data.recipient, event.data.message_id ?? null, 'bounce')
    },
    'email.complaint': async (event) => {
      await record(event.event_id, event.data.recipient, event.data.message_id ?? null, 'complaint')
    },
    'email.unsubscribed': async (event) => {
      await record(event.event_id, event.data.recipient, event.data.message_id ?? null, 'unsubscribe')
    },
  },
})

Deno.serve((req) => handler(req))
