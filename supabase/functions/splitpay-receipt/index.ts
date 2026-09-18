import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBrandedEmail } from "../_shared/send-branded-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Caller must be authenticated (or an internal service-role caller).
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Internal callers must present the actual service-role key. Decoding an
    // unverified JWT payload for a `role` claim is forgeable, so it is not used.
    const isServiceRole = !!supabaseServiceKey && token === supabaseServiceKey;


    let callerId: string | null = null;
    if (!isServiceRole) {
      const { data: authData, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !authData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      callerId = authData.user.id;
    }

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

    // Ownership check: only the split creator or a participant may (re-)send receipts.
    if (callerId) {
      let allowed = splitReq.creator_user_id === callerId;
      if (!allowed) {
        const { data: membership } = await supabase
          .from('split_participants')
          .select('id')
          .eq('split_request_id', split_request_id)
          .eq('user_id', callerId)
          .maybeSingle();
        allowed = !!membership;
      }
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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

      const details = [
        { label: 'Purpose', value: String(splitReq.purpose) },
        { label: 'Total', value: `NGN ${Number(splitReq.total_amount).toLocaleString()}` },
        { label: 'Per person', value: `NGN ${Number(splitReq.amount_per_person).toLocaleString()}` },
        { label: 'Paid to', value: `${splitReq.merchant_account_name} · ${splitReq.merchant_bank_name} · ${splitReq.merchant_account_number}` },
        { label: 'Participants', value: participantDetails.map((p) => `${p.name} (NGN ${Number(p.amount).toLocaleString()})`).join(', ') },
        { label: 'Completed', value: new Date(completedAt).toLocaleString('en-NG') },
        { label: 'Reference', value: String(splitReference) },
        ...(settlementReference ? [{ label: 'Settlement ref', value: String(settlementReference) }] : []),
      ];

      const sendResult = await sendBrandedEmail({
        recipientEmail: profile.email,
        recipientName: profile.full_name || profile.username || undefined,
        title: `SplitPay receipt: ${splitReq.purpose}`,
        message: 'Your split bill has been settled in full. Here is your receipt.',
        details,
        highlightLabel: 'Total settled',
        highlightValue: `NGN ${Number(splitReq.total_amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        actionUrl: 'https://vestara.ng/splitpay',
        actionLabel: 'View Receipt',
        idempotencyKey: `splitpay-receipt-${splitReference}-${userId}`,
      });

      if (sendResult.ok) {
        sentCount++;
        console.log(`Receipt sent to user ${userId}`);
      } else {
        console.error(`Failed to send receipt to user ${userId}:`, sendResult.error);
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
