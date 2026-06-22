import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BRAND = {
  orange: '#E8621A',
  orangeLight: '#FFF5EB',
  green: '#22c55e',
  greenLight: '#f0fdf4',
  textDark: '#171717',
  textBody: '#555555',
  textMuted: '#999999',
  white: '#ffffff',
  border: '#e5e7eb',
  logoUrl: 'https://sdwkqwmqgpsjrmijkdix.supabase.co/storage/v1/object/public/email-assets/wesave-logo.png',
};

function buildReceiptHtml(
  recipientName: string,
  purpose: string,
  totalAmount: number,
  amountPerPerson: number,
  merchantName: string,
  merchantBank: string,
  merchantAccount: string,
  participants: { name: string; amount: number; paid_at: string }[],
  completedAt: string,
  splitReference: string,
  settlementReference: string | null,
): string {
  const participantRows = participants
    .map(
      (p) =>
        `<tr>
          <td style="padding:8px 12px;font-size:14px;color:${BRAND.textBody};border-bottom:1px solid ${BRAND.border};">${p.name}</td>
          <td style="padding:8px 12px;font-size:14px;color:${BRAND.textDark};font-weight:600;border-bottom:1px solid ${BRAND.border};text-align:right;">₦${p.amount.toLocaleString()}</td>
          <td style="padding:8px 12px;font-size:12px;color:${BRAND.textMuted};border-bottom:1px solid ${BRAND.border};text-align:right;">${new Date(p.paid_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
        </tr>`,
    )
    .join('');

  const firstName = recipientName ? recipientName.split(' ')[0] : 'there';

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SplitPay Receipt</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.white};font-family:'Roboto',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BRAND.white};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">

          <!-- Logo -->
          <tr>
            <td style="padding:0 0 24px;">
              <img src="${BRAND.logoUrl}" width="48" height="48" alt="Vestara" style="border-radius:8px;display:block;" />
            </td>
          </tr>

          <!-- Status Badge -->
          <tr>
            <td style="padding:0 0 20px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background-color:${BRAND.greenLight};border-radius:20px;padding:6px 16px;">
                    <span style="font-size:13px;font-weight:600;color:${BRAND.green};">✅ Payment Complete</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding:0 0 8px;">
              <h1 style="margin:0;font-size:22px;font-weight:bold;color:${BRAND.textDark};line-height:1.3;">SplitPay Receipt</h1>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:0 0 16px;">
              <p style="margin:0;font-size:15px;color:${BRAND.textBody};line-height:1.6;">Hello ${firstName},</p>
              <p style="margin:8px 0 0;font-size:15px;color:${BRAND.textBody};line-height:1.6;">
                All participants have completed payment for <strong>"${purpose}"</strong>. Here's your receipt:
              </p>
            </td>
          </tr>

          <!-- Summary Card -->
          <tr>
            <td style="padding:0 0 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f9fafb;border-radius:12px;border:1px solid ${BRAND.border};">
                <tr>
                  <td style="padding:20px 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="font-size:13px;color:${BRAND.textMuted};padding:0 0 4px;">Total Bill</td>
                        <td style="font-size:20px;font-weight:bold;color:${BRAND.textDark};text-align:right;padding:0 0 4px;">₦${totalAmount.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:${BRAND.textMuted};padding:4px 0;">Per Person</td>
                        <td style="font-size:15px;font-weight:600;color:${BRAND.orange};text-align:right;padding:4px 0;">₦${amountPerPerson.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:${BRAND.textMuted};padding:4px 0;">Participants</td>
                        <td style="font-size:15px;color:${BRAND.textDark};text-align:right;padding:4px 0;">${participants.length}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:${BRAND.textMuted};padding:4px 0;">Completed</td>
                        <td style="font-size:13px;color:${BRAND.textDark};text-align:right;padding:4px 0;">${new Date(completedAt).toLocaleDateString('en-NG', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Merchant Details -->
          <tr>
            <td style="padding:0 0 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BRAND.orangeLight};border-radius:12px;border:1px solid ${BRAND.orange}20;">
                <tr>
                  <td style="padding:16px 24px;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:${BRAND.orange};text-transform:uppercase;letter-spacing:0.5px;">Merchant</p>
                    <p style="margin:0 0 2px;font-size:15px;font-weight:600;color:${BRAND.textDark};">${merchantName}</p>
                    <p style="margin:0;font-size:13px;color:${BRAND.textBody};">${merchantBank} — ${merchantAccount}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Reference Info -->
          <tr>
            <td style="padding:0 0 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f9fafb;border-radius:12px;border:1px solid ${BRAND.border};">
                <tr>
                  <td style="padding:16px 24px;">
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.5px;">Transaction Reference</p>
                    <p style="margin:0 0 8px;font-size:13px;font-family:monospace;color:${BRAND.textDark};">${splitReference}</p>
                    ${settlementReference ? `
                    <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.5px;">Settlement Reference</p>
                    <p style="margin:0;font-size:13px;font-family:monospace;color:${BRAND.textDark};">${settlementReference}</p>
                    ` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Participants Table -->
          <tr>
            <td style="padding:0 0 24px;">
              <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:${BRAND.textDark};">Payment Breakdown</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:12px;border:1px solid ${BRAND.border};overflow:hidden;">
                <tr style="background-color:#f9fafb;">
                  <td style="padding:10px 12px;font-size:12px;font-weight:600;color:${BRAND.textMuted};text-transform:uppercase;">Participant</td>
                  <td style="padding:10px 12px;font-size:12px;font-weight:600;color:${BRAND.textMuted};text-transform:uppercase;text-align:right;">Amount</td>
                  <td style="padding:10px 12px;font-size:12px;font-weight:600;color:${BRAND.textMuted};text-transform:uppercase;text-align:right;">Paid At</td>
                </tr>
                ${participantRows}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 0 28px;">
              <a href="https://app.vestara.ng/split-pay" style="display:inline-block;background-color:${BRAND.orange};color:${BRAND.orangeLight};font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:14px 28px;">
                View in Vestara
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
                This is a transaction receipt from Vestara SplitPay. Payments were made directly from participant wallets.
              </p>
              <p style="margin:0;font-size:12px;color:${BRAND.orange};font-weight:500;">
                Vestara — Save Together, Grow Together 🌍
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

    const { split_request_id } = await req.json();

    if (!split_request_id) {
      return new Response(JSON.stringify({ error: 'Missing split_request_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch split request
    const { data: splitReq, error: reqErr } = await supabase
      .from('split_requests')
      .select('*')
      .eq('id', split_request_id)
      .single();

    if (reqErr || !splitReq) {
      console.error('Split request not found:', reqErr);
      return new Response(JSON.stringify({ error: 'Split request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch participants with paid status
    const { data: participants } = await supabase
      .from('split_participants')
      .select('user_id, amount_due, paid_at, status')
      .eq('split_request_id', split_request_id)
      .eq('status', 'paid');

    if (!participants || participants.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no_paid_participants' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Also include creator in recipient list
    const allUserIds = [...new Set([splitReq.creator_user_id, ...participants.map((p: any) => p.user_id)])];

    // Fetch all profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, username')
      .in('id', allUserIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    // Build participant details for the receipt
    const participantDetails = participants.map((p: any) => {
      const prof = profileMap.get(p.user_id);
      return {
        name: prof?.full_name || prof?.username || 'Unknown',
        amount: Number(p.amount_due),
        paid_at: p.paid_at || new Date().toISOString(),
      };
    });

    const completedAt = splitReq.updated_at || new Date().toISOString();
    const splitReference = `split-${split_request_id}`;
    const settlementReference = splitReq.settlement_reference || null;
    let sentCount = 0;

    // Send receipt to each participant + creator
    for (const userId of allUserIds) {
      const profile = profileMap.get(userId);
      if (!profile?.email) continue;

      const html = buildReceiptHtml(
        profile.full_name || profile.username || '',
        splitReq.purpose,
        Number(splitReq.total_amount),
        Number(splitReq.amount_per_person),
        splitReq.merchant_account_name,
        splitReq.merchant_bank_name,
        splitReq.merchant_account_number,
        participantDetails,
        completedAt,
        splitReference,
        settlementReference,
      );

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Vestara <notify@vestara.ng>',
          to: [profile.email],
          subject: `🧾 Vestara — SplitPay Receipt: ${splitReq.purpose}`,
          html,
        }),
      });

      if (emailRes.ok) {
        sentCount++;
        console.log(`Receipt sent to ${profile.email}`);
      } else {
        const errText = await emailRes.text();
        console.error(`Failed to send to ${profile.email}:`, errText);
      }

      // 600ms delay between sends to prevent rate limiting
      if (allUserIds.indexOf(userId) < allUserIds.length - 1) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    return new Response(JSON.stringify({ success: true, sent: sentCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('SplitPay receipt error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
