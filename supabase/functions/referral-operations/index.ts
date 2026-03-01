import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // GET: referral-link
    if (action === 'link') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('id', user.id)
        .single();

      return new Response(JSON.stringify({
        referral_code: profile?.referral_code,
        referral_link: `https://app.wesave.ng/auth?mode=signup&ref=${profile?.referral_code}`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET: referral-stats
    if (action === 'stats') {
      const { data: referrals } = await supabase
        .from('referrals')
        .select('id, status, reward_amount, created_at')
        .eq('referrer_id', user.id);

      const total = referrals?.length || 0;
      const pending = referrals?.filter(r => r.status === 'pending').length || 0;
      const completed = referrals?.filter(r => r.status === 'completed').length || 0;
      const rewarded = referrals?.filter(r => r.status === 'rewarded').length || 0;
      const totalEarned = referrals?.filter(r => r.status === 'rewarded')
        .reduce((sum, r) => sum + Number(r.reward_amount || 0), 0) || 0;

      // Get liened amount from ledger
      const { data: wallet } = await supabase
        .from('wallets')
        .select('locked_balance')
        .eq('user_id', user.id)
        .single();

      // Get referral-specific liens from ledger
      const { data: lienEntries } = await supabase
        .from('ledger_entries')
        .select('amount')
        .eq('user_id', user.id)
        .eq('reference_type', 'referral_bonus')
        .ilike('description', '%liened%');

      const lienedAmount = lienEntries?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

      // Check released liens
      const { data: releaseEntries } = await supabase
        .from('ledger_entries')
        .select('amount')
        .eq('user_id', user.id)
        .eq('reference_type', 'referral_lien_release');

      const releasedAmount = releaseEntries?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
      const currentLiened = Math.max(lienedAmount - releasedAmount, 0);

      return new Response(JSON.stringify({
        total_referrals: total,
        pending_referrals: pending,
        completed_referrals: completed + rewarded,
        total_earned: totalEarned,
        liened_amount: currentLiened,
        available_amount: totalEarned - currentLiened,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET: referral-history
    if (action === 'history') {
      const { data: referrals } = await supabase
        .from('referrals')
        .select('id, referred_user_id, status, reward_amount, created_at, completed_at, rewarded_at, fraud_flag')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      // Get referred user names
      const userIds = referrals?.map(r => r.referred_user_id) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      const history = referrals?.map(r => ({
        ...r,
        referred_user_name: profileMap.get(r.referred_user_id)?.full_name || 'Unknown',
        referred_username: profileMap.get(r.referred_user_id)?.username,
      })) || [];

      return new Response(JSON.stringify({ referrals: history }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST: record-referral (called after signup)
    if (action === 'record' && req.method === 'POST') {
      const { referral_code } = await req.json();
      if (!referral_code) {
        return new Response(JSON.stringify({ error: 'Missing referral_code' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find referrer
      const { data: referrer } = await supabase
        .from('profiles')
        .select('id')
        .eq('referral_code', referral_code)
        .single();

      if (!referrer) {
        return new Response(JSON.stringify({ error: 'Invalid referral code' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Self-referral check
      if (referrer.id === user.id) {
        return new Response(JSON.stringify({ error: 'Cannot refer yourself' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if already referred
      const { data: existing } = await supabase
        .from('referrals')
        .select('id')
        .eq('referred_user_id', user.id)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: 'Already referred' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fraud checks: same device fingerprint or bank details
      const { data: referrerProfile } = await supabase
        .from('profiles')
        .select('bvn, bank_account')
        .eq('id', referrer.id)
        .single();

      const { data: newUserProfile } = await supabase
        .from('profiles')
        .select('bvn, bank_account')
        .eq('id', user.id)
        .single();

      let fraudFlag = false;
      let fraudReason = null;

      if (referrerProfile && newUserProfile) {
        if (referrerProfile.bvn && newUserProfile.bvn && referrerProfile.bvn === newUserProfile.bvn) {
          fraudFlag = true;
          fraudReason = 'same_bvn';
        }
        if (referrerProfile.bank_account && newUserProfile.bank_account &&
            referrerProfile.bank_account === newUserProfile.bank_account) {
          fraudFlag = true;
          fraudReason = (fraudReason ? fraudReason + ',same_bank_account' : 'same_bank_account');
        }
      }

      // Create referral
      const { data: referral, error: insertError } = await supabase
        .from('referrals')
        .insert({
          referrer_id: referrer.id,
          referred_user_id: user.id,
          fraud_flag: fraudFlag,
          fraud_reason: fraudReason,
        })
        .select()
        .single();

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update referred_by on profile
      await supabase
        .from('profiles')
        .update({ referred_by: referrer.id })
        .eq('id', user.id);

      return new Response(JSON.stringify({ success: true, referral }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST: process-cycle-reward (called by backend when cycle completes)
    if (action === 'process-reward' && req.method === 'POST') {
      const { referred_user_id } = await req.json();

      const result = await supabase.rpc('process_referral_reward', {
        p_referred_user_id: referred_user_id,
      });

      // Also try to release liens for the referrer
      const { data: referral } = await supabase
        .from('referrals')
        .select('referrer_id')
        .eq('referred_user_id', referred_user_id)
        .maybeSingle();

      if (referral?.referrer_id) {
        await supabase.rpc('release_referral_liens', {
          p_user_id: referral.referrer_id,
        });
      }

      // Send email notification to referrer
      if (referral?.referrer_id) {
        try {
          const notifPayload = {
            record: {
              id: crypto.randomUUID(),
              user_id: referral.referrer_id,
              title: 'Referral Bonus Earned! 🎉',
              message: 'You earned ₦1,000 referral bonus! It has been credited and will unlock after you complete a thrift cycle.',
              notification_type: 'referral_reward',
              group_id: null,
            },
          };

          await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify(notifPayload),
          });
        } catch (e) {
          console.error('Failed to send referral email:', e);
        }
      }

      return new Response(JSON.stringify(result.data || { success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST: admin review
    if (action === 'admin-review' && req.method === 'POST') {
      // Check admin
      const { data: role } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'super_admin'])
        .maybeSingle();

      if (!role) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { referral_id, new_status, fraud_flag, fraud_reason } = await req.json();

      const { error: updateError } = await supabase
        .from('referrals')
        .update({
          status: new_status,
          fraud_flag,
          fraud_reason,
          ...(new_status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
          ...(new_status === 'rewarded' ? { rewarded_at: new Date().toISOString() } : {}),
        })
        .eq('id', referral_id);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Referral operation error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
