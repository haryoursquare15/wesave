import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
      return '✅ WeSave — Contribution Successful';
    case 'contribution_failed':
    case 'contribution_defaulted':
      return '⚠️ WeSave — Contribution Issue';
    case 'contribution_retry':
      return '🔄 WeSave — Contribution Retry';
    case 'card_fallback_success':
      return '✅ WeSave — Card Payment Successful';
    case 'card_fallback_failed':
      return '⚠️ WeSave — Card Payment Failed';
    case 'wallet_funding_reminder':
      return '💰 WeSave — Fund Your Wallet';
    case 'payout_received':
      return '🎉 WeSave — Payout Received!';
    case 'withdrawal_initiated':
      return '💸 WeSave — Withdrawal Initiated';
    case 'withdrawal_completed':
      return '✅ WeSave — Withdrawal Completed';
    case 'withdrawal_failed':
      return '⚠️ WeSave — Withdrawal Failed';
    case 'wallet_credited':
      return '💰 WeSave — Wallet Funded';
    case 'invite_received':
      return '📨 WeSave — Group Invitation';
    case 'group_joined':
      return '🤝 WeSave — Welcome to the Group!';
    case 'cycle_started':
      return '🔄 WeSave — New Cycle Started';
    case 'referral_reward':
      return '🎁 WeSave — Referral Bonus Earned!';
    default:
      return `WeSave — ${title}`;
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
  logoUrl: 'https://sdwkqwmqgpsjrmijkdix.supabase.co/storage/v1/object/public/email-assets/wesave-logo.png',
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
  return 'Open WeSave';
}

function getCTAUrl(type: string): string {
  if (type.includes('wallet') || type === 'payout_received' || type.includes('withdrawal')) return 'https://app.wesave.ng/wallet';
  if (type.includes('contribution') || type.includes('cycle')) return 'https://app.wesave.ng/groups';
  if (type.includes('invite') || type.includes('group')) return 'https://app.wesave.ng/groups';
  if (type === 'referral_reward') return 'https://app.wesave.ng/referrals';
  return 'https://app.wesave.ng/dashboard';
}

function buildEmailHtml(title: string, message: string, type: string, userName?: string): string {
  const { accent, bg, icon } = getTypeColors(type);
  const ctaLabel = getCTALabel(type);
  const ctaUrl = getCTAUrl(type);
  const greeting = userName ? `Hi ${userName},` : 'Hi there,';

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.white};font-family:'Roboto',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BRAND.white};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">

          <!-- Logo -->
          <tr>
            <td style="padding:0 0 24px;">
              <img src="${BRAND.logoUrl}" width="48" height="48" alt="WeSave" style="border-radius:8px;display:block;" />
            </td>
          </tr>

          <!-- Status Badge -->
          <tr>
            <td style="padding:0 0 20px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background-color:${bg};border-radius:20px;padding:6px 16px;">
                    <span style="font-size:13px;font-weight:600;color:${accent};">${icon} ${type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding:0 0 8px;">
              <h1 style="margin:0;font-size:24px;font-weight:bold;color:${BRAND.textDark};line-height:1.3;">${title}</h1>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:0 0 16px;">
              <p style="margin:0;font-size:15px;color:${BRAND.textBody};line-height:1.6;">${greeting}</p>
            </td>
          </tr>

          <!-- Message Card -->
          <tr>
            <td style="padding:0 0 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f9fafb;border-radius:12px;border:1px solid ${BRAND.border};">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0;font-size:15px;color:${BRAND.textBody};line-height:1.7;">${message}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding:0 0 28px;">
              <a href="${ctaUrl}" style="display:inline-block;background-color:${BRAND.orange};color:${BRAND.orangeLight};font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:14px 28px;">
                ${ctaLabel}
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 0 16px;">
              <hr style="border:none;border-top:1px solid ${BRAND.border};margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:12px;color:${BRAND.textMuted};line-height:1.5;">
                You're receiving this because you have a WeSave account. Update your notification preferences in the app.
              </p>
              <p style="margin:0;font-size:12px;color:${BRAND.orange};font-weight:500;">
                WeSave — Save Together, Grow Together 🌍
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    if (!profile?.email) {
      console.log(`No email found for user ${record.user_id}, skipping`);
      return new Response(JSON.stringify({ skipped: true, reason: 'no_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subject = getEmailSubject(record.notification_type, record.title);
    const html = buildEmailHtml(record.title, record.message, record.notification_type, profile.full_name);

    console.log(`Sending email to ${profile.email}: ${subject}`);

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WeSave <no-reply@wesave.ng>',
        to: [profile.email],
        subject,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errorText = await emailRes.text();
      console.error('Resend API error:', errorText);
      return new Response(JSON.stringify({ success: false, error: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await emailRes.json();
    console.log('Email sent successfully:', result.id);

    return new Response(JSON.stringify({ success: true, email_id: result.id }), {
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
