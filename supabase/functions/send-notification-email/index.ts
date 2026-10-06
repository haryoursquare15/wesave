import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBrandedEmail } from "../_shared/send-branded-email.ts";
import { sendWhatsAppAlert } from "../_shared/whatsapp-notify.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationPayload {
  record: {
    id: string;
    user_id: string;
    title: string;
    message: string;
    notification_type: string;
    group_id: string | null;
  };
}

function getEmailSubject(type: string, title: string): string {
  switch (type) {
    case 'contribution_success':
      return '✅ Vestara — Contribution Successful';
    case 'contribution_failed':
    case 'contribution_defaulted':
      return '⚠️ Vestara — Contribution Issue';
    case 'contribution_retry':
      return '🔄 Vestara — Contribution Retry';
    case 'card_fallback_success':
      return '✅ Vestara — Card Payment Successful';
    case 'card_fallback_failed':
      return '⚠️ Vestara — Card Payment Failed';
    case 'wallet_funding_reminder':
      return '💰 Vestara — Fund Your Wallet';
    case 'payout_received':
      return '🎉 Vestara — Payout Received!';
    case 'withdrawal_initiated':
      return '💸 Vestara — Withdrawal Initiated';
    case 'withdrawal_completed':
      return '✅ Vestara — Withdrawal Completed';
    case 'withdrawal_failed':
      return '⚠️ Vestara — Withdrawal Failed';
    case 'wallet_credited':
      return '💰 Vestara — Wallet Funded';
    case 'invite_received':
      return '📨 Vestara — Group Invitation';
    case 'group_joined':
      return '🤝 Vestara — Welcome to the Group!';
    case 'cycle_started':
      return '🔄 Vestara — New Cycle Started';
    case 'referral_reward':
      return '🎁 Vestara — Referral Bonus Earned!';
    default:
      return `Vestara — ${title}`;
  }
}

// ── Shared brand constants ────────────────────────────────────────
const BRAND = {
  orange: '#E8621A',
  orangeLight: '#FFF5EB',
  green: '#22c55e',
  greenLight: '#f0fdf4',
  red: '#ef4444',
  redLight: '#fef2f2',
  amber: '#f59e0b',
  amberLight: '#fffbeb',
  blue: '#3b82f6',
  blueLight: '#eff6ff',
  textDark: '#171717',
  textBody: '#555555',
  textMuted: '#999999',
  white: '#ffffff',
  border: '#e5e7eb',
  logoUrl: 'https://vestara.ng/__l5e/assets-v1/0a3456da-5bb0-466e-8e36-0d625b8dfc63/vestara-logo-email.png',
};

function getTypeColors(type: string): { accent: string; bg: string; icon: string } {
  if (type.includes('success') || type.includes('completed') || type.includes('credited') || type === 'payout_received' || type === 'group_joined') {
    return { accent: BRAND.green, bg: BRAND.greenLight, icon: '✅' };
  }
  if (type.includes('failed') || type.includes('defaulted')) {
    return { accent: BRAND.red, bg: BRAND.redLight, icon: '⚠️' };
  }
  if (type.includes('retry') || type.includes('reminder') || type === 'withdrawal_initiated') {
    return { accent: BRAND.amber, bg: BRAND.amberLight, icon: '🔄' };
  }
  if (type.includes('invite')) {
    return { accent: BRAND.blue, bg: BRAND.blueLight, icon: '📨' };
  }
  if (type === 'referral_reward') {
    return { accent: BRAND.orange, bg: BRAND.orangeLight, icon: '🎁' };
  }
  return { accent: BRAND.orange, bg: BRAND.orangeLight, icon: '📢' };
}

function getCTALabel(type: string): string {
  if (type.includes('wallet') || type === 'payout_received' || type.includes('withdrawal')) return 'View Wallet';
  if (type.includes('contribution') || type.includes('cycle')) return 'View Group';
  if (type.includes('invite') || type.includes('group')) return 'View Groups';
  if (type === 'referral_reward') return 'View Referrals';
  return 'Open Vestara';
}

function getCTAUrl(type: string): string {
  if (type.includes('wallet') || type === 'payout_received' || type.includes('withdrawal')) return 'https://app.vestara.ng/wallet';
  if (type.includes('contribution') || type.includes('cycle')) return 'https://app.vestara.ng/groups';
  if (type.includes('invite') || type.includes('group')) return 'https://app.vestara.ng/groups';
  if (type === 'referral_reward') return 'https://app.vestara.ng/referrals';
  return 'https://app.vestara.ng/dashboard';
}


/** Constant-time comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Only trusted internal callers may send notification emails:
 *  - the database trigger, which presents `x-cron-token` matching the
 *    `internal_notifications` row in `internal_cron_tokens` (or CRON_SECRET), or
 *  - another edge function presenting the service role key.
 */
async function isTrustedCaller(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const bearer = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  if (serviceKey && bearer && safeEqual(bearer, serviceKey)) return true;

  const provided = req.headers.get('x-cron-token') || '';
  if (!provided) return false;

  const envSecret = Deno.env.get('CRON_SECRET');
  if (envSecret && safeEqual(provided, envSecret)) return true;

  const { data } = await supabase
    .from('internal_cron_tokens')
    .select('token')
    .eq('name', 'internal_notifications')
    .maybeSingle();

  return !!data?.token && safeEqual(provided, data.token as string);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!(await isTrustedCaller(req, supabase))) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: NotificationPayload = await req.json();
    const { record } = payload;


    if (!record?.user_id || !record?.title || !record?.message) {
      console.log('Missing required notification fields, skipping email');
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch user email from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', record.user_id)
      .single();

    // WhatsApp runs alongside email for opted-in users; failures never block email.
    await sendWhatsAppAlert(supabase, {
      userId: record.user_id,
      notificationId: record.id,
      name: profile?.full_name,
      title: String(record.title),
      message: String(record.message),
    });

    if (!profile?.email) {
      console.log(`No email found for user ${record.user_id}, skipping`);
      return new Response(JSON.stringify({ skipped: true, reason: 'no_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // The React Email template escapes props at render time, so we only
    // length-cap here. Escaping again would render literal HTML entities.
    const safeTitle = String(record.title).slice(0, 200);
    const safeMessage = String(record.message).slice(0, 2000);
    const safeType = String(record.notification_type || 'notification').replace(/[^a-z0-9_]/gi, '').slice(0, 60);

    console.log(`Sending email to ${profile.email}: ${getEmailSubject(safeType, safeTitle)}`);

    const sendResult = await sendBrandedEmail({
      recipientEmail: profile.email,
      recipientName: profile.full_name || undefined,
      title: safeTitle,
      message: safeMessage,
      actionUrl: getCTAUrl(safeType),
      actionLabel: getCTALabel(safeType),
      idempotencyKey: `notification-${record.id}`,
    });

    if (!sendResult.ok) {
      return new Response(JSON.stringify({ success: false, error: sendResult.error }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Email queued successfully');

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Email notification error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
