// Best-effort WhatsApp alert. Never throws — email/push must not be affected.
// Only sends to customers who opted in (whatsapp_preferences.opted_in).
import { canSendWhatsAppAlert } from './whatsapp-policy.ts';
// deno-lint-ignore no-explicit-any
type Client = any;

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/whatsapp';
const DEFAULT_TEMPLATE = 'vestara_account_alert';

function clean(s: string, max: number): string {
  // Meta rejects template params with newlines/tabs or 4+ consecutive spaces.
  return String(s || '').replace(/[\n\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
}

export async function sendWhatsAppAlert(
  supabase: Client,
  opts: {
    userId: string; notificationId?: string; name?: string | null; title: string; message: string;
    // Optional approved template; params exclude the leading first-name ({{1}}), which is added here.
    template?: string; params?: string[]; notificationType?: string;
  },
): Promise<void> {
  if (!canSendWhatsAppAlert(opts)) return;
  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const WHATSAPP_API_KEY = Deno.env.get('WHATSAPP_API_KEY');
    if (!LOVABLE_API_KEY || !WHATSAPP_API_KEY) return;

    const { data: pref } = await supabase
      .from('whatsapp_preferences')
      .select('phone, opted_in')
      .eq('user_id', opts.userId)
      .maybeSingle();
    if (!pref?.opted_in || !pref.phone) return;

    if (opts.notificationId) {
      const { data: existing } = await supabase
        .from('whatsapp_messages').select('id').eq('notification_id', opts.notificationId).maybeSingle();
      if (existing) return; // idempotent
    }

    const firstName = clean((opts.name || 'there').split(' ')[0], 40) || 'there';
    const summary = clean(`${opts.title} - ${opts.message}`, 900);
    const TEMPLATE = opts.template && opts.params?.length ? opts.template : DEFAULT_TEMPLATE;
    const values = TEMPLATE === DEFAULT_TEMPLATE
      ? [firstName, summary]
      : [firstName, ...(opts.params || []).map((v) => clean(v, 300) || '-')];

    const res = await fetch(`${GATEWAY_URL}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': WHATSAPP_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: pref.phone,
        type: 'template',
        template: {
          name: TEMPLATE,
          language: { code: 'en' },
          components: [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }],
        },
      }),
    });
    const body = await res.text();
    let waId: string | null = null;
    try { waId = JSON.parse(body)?.messages?.[0]?.id ?? null; } catch { /* ignore */ }
    if (!res.ok) console.error(`WhatsApp send failed [${res.status}]: ${body}`);

    await supabase.from('whatsapp_messages').insert({
      user_id: opts.userId,
      notification_id: opts.notificationId ?? null,
      template: TEMPLATE,
      status: res.ok ? 'sent' : 'failed',
      wa_message_id: waId,
      error: res.ok ? null : body.slice(0, 1000),
    });
  } catch (e) {
    console.error('WhatsApp alert error:', e);
  }
}
