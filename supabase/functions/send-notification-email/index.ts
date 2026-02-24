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
    default:
      return `WeSave — ${title}`;
  }
}

function getNotificationColor(type: string): string {
  if (type.includes('success') || type.includes('completed') || type.includes('credited') || type === 'payout_received' || type === 'group_joined') {
    return '#22c55e';
  }
  if (type.includes('failed') || type.includes('defaulted')) {
    return '#ef4444';
  }
  if (type.includes('retry') || type.includes('reminder') || type.includes('initiated')) {
    return '#f59e0b';
  }
  if (type.includes('invite')) {
    return '#3b82f6';
  }
  return '#6366f1';
}

function buildEmailHtml(title: string, message: string, type: string): string {
  const accentColor = getNotificationColor(type);
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background-color: ${accentColor}; padding: 24px 30px;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">WeSave</h1>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 30px;">
                  <h2 style="margin: 0 0 12px; color: #1a1a1a; font-size: 18px; font-weight: 600;">${title}</h2>
                  <p style="margin: 0 0 24px; color: #4b5563; font-size: 15px; line-height: 1.6;">${message}</p>
                  
                  <a href="https://wesave.lovable.app/wallet" style="display: inline-block; background-color: ${accentColor}; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">
                    Open WeSave
                  </a>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 20px 30px; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                    You're receiving this because you have an account on WeSave. 
                    If you no longer wish to receive these emails, you can update your notification preferences in the app.
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
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
    const html = buildEmailHtml(record.title, record.message, record.notification_type);

    console.log(`Sending email to ${profile.email}: ${subject}`);

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WeSave <noreply@wesave.ng>',
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
