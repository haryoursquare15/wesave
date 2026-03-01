import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildReminderEmail(fullName: string): string {
  const name = fullName || 'there';
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
                <td style="background-color: #E8621A; padding: 24px 30px;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">WeSave</h1>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 30px;">
                  <h2 style="margin: 0 0 12px; color: #1a1a1a; font-size: 18px; font-weight: 600;">Hey ${name}, you're missing out! 👋</h2>
                  <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
                    You signed up for WeSave but haven't joined a savings group yet. Here's what you're missing:
                  </p>
                  
                  <ul style="margin: 0 0 20px; padding-left: 20px; color: #4b5563; font-size: 15px; line-height: 1.8;">
                    <li><strong>Save Together</strong> — Join a group and contribute alongside trusted members</li>
                    <li><strong>Earn Payouts</strong> — Receive your lump-sum payout when it's your turn</li>
                    <li><strong>Build Credit</strong> — Boost your WeSave credit score with every on-time contribution</li>
                    <li><strong>Zero Fees to Join</strong> — Getting started is completely free</li>
                  </ul>
                  
                  <p style="margin: 0 0 24px; color: #4b5563; font-size: 15px; line-height: 1.6;">
                    It only takes a minute to create or join a group. Start saving smarter today!
                  </p>
                  
                  <a href="https://app.wesave.ng/groups" style="display: inline-block; background-color: #E8621A; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;">
                    Explore Groups
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

    // Find users who:
    // 1. Signed up at least 3 days ago
    // 2. Have no active group memberships
    // 3. Haven't received a reminder in the last 7 days
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get all users who signed up 3+ days ago with their email
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at')
      .lte('created_at', threeDaysAgo)
      .not('email', 'is', null);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      console.log('No eligible users found');
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get users who have active group memberships
    const { data: memberships, error: membershipError } = await supabase
      .from('group_memberships')
      .select('user_id')
      .eq('status', 'active');

    if (membershipError) throw membershipError;

    const usersWithGroups = new Set((memberships || []).map(m => m.user_id));

    // Get users who received a reminder in the last 7 days
    const { data: recentReminders, error: reminderError } = await supabase
      .from('group_join_reminders')
      .select('user_id')
      .gte('sent_at', sevenDaysAgo);

    if (reminderError) throw reminderError;

    const recentlyReminded = new Set((recentReminders || []).map(r => r.user_id));

    // Filter to users without groups and not recently reminded
    const eligibleUsers = profiles.filter(p => 
      !usersWithGroups.has(p.id) && !recentlyReminded.has(p.id) && p.email
    );

    console.log(`Found ${eligibleUsers.length} eligible users for group join reminder`);

    let sentCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < eligibleUsers.length; i++) {
      const user = eligibleUsers[i];
      
      // Rate limit: wait 600ms between sends to stay under 2/sec
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      try {
        const html = buildReminderEmail(user.full_name || '');

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'WeSave <noreply@notify.noreply.wesave.ng>',
            to: [user.email],
            subject: '🤝 WeSave — Your savings group is waiting for you!',
            html,
          }),
        });

        if (!emailRes.ok) {
          const errorText = await emailRes.text();
          console.error(`Failed to send to ${user.email}:`, errorText);
          errors.push(`${user.email}: ${errorText}`);
          continue;
        }

        // Track that we sent a reminder
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

        sentCount++;
        console.log(`Reminder sent to ${user.email} (count: ${existing ? existing.reminder_count + 1 : 1})`);
      } catch (err) {
        console.error(`Error processing user ${user.id}:`, err);
        errors.push(`${user.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    console.log(`Group join reminders complete: ${sentCount} sent, ${errors.length} errors`);

    return new Response(JSON.stringify({ 
      sent: sentCount, 
      eligible: eligibleUsers.length,
      errors: errors.length > 0 ? errors : undefined 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Group join reminder error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
