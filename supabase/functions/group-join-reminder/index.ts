import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBrandedEmail } from "../_shared/send-branded-email.ts";
import { verifyCronToken, requireAdminJwt, unauthorized } from "../_shared/cron-auth.ts";
import { sanitizeEmailHtml, htmlToPlainText } from "../_shared/html-sanitize.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
};



serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for audience targeting
    let audience = 'pending'; // default: users without groups
    let customSubject = '';
    let customBody = '';
    let customBodyHtml = '';
    let emailType = 'reminder'; // 'reminder' or 'custom'

    try {
      const body = await req.json();
      if (body.audience) audience = body.audience;
      if (body.subject) customSubject = body.subject;
      if (body.body) customBody = body.body;
      if (body.bodyHtml) customBodyHtml = String(body.bodyHtml);
      if (body.type) emailType = body.type;
    } catch {
      // No body = default behavior (pending users, reminder email)
    }

    // ---------------------------------------------------------------
    // CALLER VERIFICATION — runs before any recipient query or send.
    //
    // Two strictly separated paths:
    //   1. type: 'custom'  -> arbitrary subject/body. ALWAYS requires an
    //      authenticated admin JWT. The cron token is never accepted here.
    //   2. anything else   -> fixed, hard-coded reminder template. Accepts
    //      the scheduler's x-cron-token, or an authenticated admin JWT.
    // ---------------------------------------------------------------
    const isCustom = emailType === 'custom';

    if (isCustom) {
      const caller = await requireAdminJwt(req, supabase);
      if (!caller) {
        console.warn('[group-join-reminder] rejected custom send: no admin JWT');
        return new Response(
          JSON.stringify({ error: 'Custom messages require an authenticated admin session' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      customBodyHtml = sanitizeEmailHtml(customBodyHtml);
      if (customBodyHtml && !customBody.trim()) {
        customBody = htmlToPlainText(customBodyHtml);
      }
      if (!customSubject || (!customBody && !customBodyHtml)) {
        return new Response(
          JSON.stringify({ error: 'subject and body are required for custom messages' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      console.log(`[group-join-reminder] custom send authorised by admin ${caller.userId} (${caller.role})`);
    } else {
      const cronOk = await verifyCronToken(req, 'group_join_reminder', supabase);
      const adminCaller = cronOk ? null : await requireAdminJwt(req, supabase);
      if (!cronOk && !adminCaller) {
        return unauthorized(corsHeaders);
      }
      // The scheduled/reminder path can never carry caller-supplied content.
      emailType = 'reminder';
      customSubject = '';
      customBody = '';
      customBodyHtml = '';
    }


    // Fetch all profiles with emails
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at')
      .not('email', 'is', null);

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0, eligible: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get users who have active group memberships
    const { data: memberships } = await supabase
      .from('group_memberships')
      .select('user_id')
      .eq('status', 'active');

    const usersWithGroups = new Set((memberships || []).map(m => m.user_id));

    // Filter by audience
    let eligibleUsers = profiles;

    if (audience === 'pending') {
      // Users who signed up 3+ days ago, no groups, not reminded in 7 days
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: recentReminders } = await supabase
        .from('group_join_reminders')
        .select('user_id')
        .gte('sent_at', sevenDaysAgo);

      const recentlyReminded = new Set((recentReminders || []).map(r => r.user_id));

      eligibleUsers = profiles.filter(p =>
        !usersWithGroups.has(p.id) &&
        !recentlyReminded.has(p.id) &&
        p.email &&
        p.created_at && new Date(p.created_at) <= new Date(threeDaysAgo)
      );
    } else if (audience === 'no_group') {
      // All users without any group (no time restriction)
      eligibleUsers = profiles.filter(p => !usersWithGroups.has(p.id) && p.email);
    } else if (audience === 'active') {
      // Users who ARE in groups
      eligibleUsers = profiles.filter(p => usersWithGroups.has(p.id) && p.email);
    } else if (audience === 'all') {
      // Everyone with an email
      eligibleUsers = profiles.filter(p => p.email);
    }

    console.log(`Audience: ${audience}, Eligible: ${eligibleUsers.length}, Type: ${emailType}`);

    let sentCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < eligibleUsers.length; i++) {
      const user = eligibleUsers[i];

      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      try {
        let plainText: string;
        let subject: string;

        // `isCustom` is only ever true after the admin-JWT gate above.
        if (isCustom) {
          plainText = customBody;
          subject = customSubject;
        } else {
          plainText = "You signed up for Vestara but haven't joined a savings group yet.\n\nSave together with trusted members, receive your lump-sum payout when it's your turn, and build your Vestara credit score with every on-time contribution. Joining is completely free.\n\nIt only takes a minute to create or join a group.";
          subject = '🤝 Vestara — Your savings group is waiting for you!';
        }

        const sendResult = await sendBrandedEmail({
          recipientEmail: user.email,
          recipientName: String(user.full_name || '').trim().split(/\s+/)[0] || undefined,
          title: subject.replace(/^[^A-Za-z0-9]+/, '').replace(/^Vestara\s*[—-]\s*/, ''),
          message: plainText,
          messageHtml: isCustom && customBodyHtml ? customBodyHtml : undefined,
          actionUrl: 'https://app.vestara.ng',
          actionLabel: 'Open Vestara',
        });

        if (!sendResult.ok) {
          console.error(`Failed to send to ${user.email}:`, sendResult.error);
          errors.push(`${user.email}: ${sendResult.error}`);
          continue;
        }

        // Track reminder for pending audience
        if (emailType === 'reminder' && (audience === 'pending' || audience === 'no_group')) {
          const { data: existing } = await supabase
            .from('group_join_reminders')
            .select('id, reminder_count')
            .eq('user_id', user.id)
            .order('sent_at', { ascending: false })
            .limit(1)
            .single();

          await supabase
            .from('group_join_reminders')
            .insert({
              user_id: user.id,
              reminder_count: existing ? existing.reminder_count + 1 : 1,
            });
        }

        sentCount++;
        console.log(`Email sent to user ${user.id}`);
      } catch (err) {
        console.error(`Error processing user ${user.id}:`, err);
        errors.push(`${user.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    console.log(`Email campaign complete: ${sentCount} sent, ${errors.length} errors`);

    return new Response(JSON.stringify({
      sent: sentCount,
      eligible: eligibleUsers.length,
      audience,
      type: emailType,
      errors: errors.length > 0 ? errors : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Email campaign error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
