import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBrandedEmail } from "../_shared/send-branded-email.ts";
import { verifyCronToken, requireAdminJwt, unauthorized } from "../_shared/cron-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
};

function buildReminderEmail(fullName: string): string {
  const name = fullName ? fullName.split(' ')[0] : 'there';
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
              <tr>
                <td style="background-color: #E8621A; padding: 24px 30px;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">Vestara</h1>
                </td>
              </tr>
              <tr>
                <td style="padding: 30px;">
                  <h2 style="margin: 0 0 12px; color: #1a1a1a; font-size: 18px; font-weight: 600;">Hey ${name}, you're missing out! 👋</h2>
                  <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
                    You signed up for Vestara but haven't joined a savings group yet. Here's what you're missing:
                  </p>
                  <ul style="margin: 0 0 20px; padding-left: 20px; color: #4b5563; font-size: 15px; line-height: 1.8;">
                    <li><strong>Save Together</strong> — Join a group and contribute alongside trusted members</li>
                    <li><strong>Earn Payouts</strong> — Receive your lump-sum payout when it's your turn</li>
                    <li><strong>Build Credit</strong> — Boost your Vestara credit score with every on-time contribution</li>
                    <li><strong>Zero Fees to Join</strong> — Getting started is completely free</li>
                  </ul>
                  <p style="margin: 0 0 24px; color: #4b5563; font-size: 15px; line-height: 1.6;">
                    It only takes a minute to create or join a group. Start saving smarter today!
                  </p>
                  <a href="https://app.vestara.ng/groups" style="display: inline-block; background-color: #E8621A; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">
                    Explore Groups
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px 30px; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                    You're receiving this because you have an account on Vestara.
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

function buildGenericEmail(fullName: string, subject: string, body: string): string {
  const name = fullName ? fullName.split(' ')[0] : 'there';
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
        <tr><td align="center" style="padding: 40px 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <tr><td style="background-color: #E8621A; padding: 24px 30px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">Vestara</h1>
            </td></tr>
            <tr><td style="padding: 30px;">
              <h2 style="margin: 0 0 12px; color: #1a1a1a; font-size: 18px; font-weight: 600;">Hi ${name} 👋</h2>
              <div style="margin: 0 0 24px; color: #4b5563; font-size: 15px; line-height: 1.6;">
                ${body.replace(/\n/g, '<br/>')}
              </div>
              <a href="https://app.vestara.ng/dashboard" style="display: inline-block; background-color: #E8621A; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">
                Open Vestara
              </a>
            </td></tr>
            <tr><td style="padding: 20px 30px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                You're receiving this because you have an account on Vestara.
              </p>
            </td></tr>
          </table>
        </td></tr>
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for audience targeting
    let audience = 'pending'; // default: users without groups
    let customSubject = '';
    let customBody = '';
    let emailType = 'reminder'; // 'reminder' or 'custom'

    try {
      const body = await req.json();
      if (body.audience) audience = body.audience;
      if (body.subject) customSubject = body.subject;
      if (body.body) customBody = body.body;
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
      if (!customSubject || !customBody) {
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
          plainText = "Your savings group is waiting for you. Join a Vestara group to start saving together and reach your goals faster.";
          subject = '🤝 Vestara — Your savings group is waiting for you!';
        }

        const sendResult = await sendBrandedEmail({
          recipientEmail: user.email,
          recipientName: user.full_name || undefined,
          title: subject.replace(/^[^A-Za-z0-9]+/, '').replace(/^Vestara\s*[—-]\s*/, ''),
          message: plainText,
          actionUrl: 'https://vestara.ng/groups',
          actionLabel: 'View groups',
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
        console.log(`Email sent to ${user.email}`);
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
