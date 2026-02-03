import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins for CORS - restrict to application domains
const ALLOWED_ORIGINS = [
  'https://thrift-harmony-hub.lovable.app',
  'https://id-preview--52f5b582-a468-4659-81c8-2245803e62d4.lovable.app',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || '') ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Credentials': 'true',
  };
}

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const FLUTTERWAVE_SECRET_KEY = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
    if (!FLUTTERWAVE_SECRET_KEY) {
      throw new Error('FLUTTERWAVE_SECRET_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, ...params } = await req.json();
    console.log(`Processing action: ${action} for user: ${user.id}`);

    let result;

    switch (action) {
      case 'create_virtual_account': {
        // Get user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileError || !profile) {
          throw new Error('Profile not found');
        }

        if (!profile.bvn || !profile.bank_account || !profile.bank_name) {
          throw new Error('Please complete onboarding with BVN and bank details');
        }

        // Check if virtual account already exists
        if (profile.flw_virtual_account_number) {
          result = {
            success: true,
            message: 'Virtual account already exists',
            virtual_account: {
              account_number: profile.flw_virtual_account_number,
              bank_name: profile.flw_virtual_bank_name,
            }
          };
          break;
        }

        // Create virtual account via Flutterwave
        const virtualAccountResponse = await fetch(`${FLUTTERWAVE_BASE_URL}/virtual-account-numbers`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: user.email,
            is_permanent: true,
            bvn: profile.bvn,
            tx_ref: `user-${user.id}-${Date.now()}`,
            phonenumber: profile.phone || '',
            firstname: profile.full_name?.split(' ')[0] || 'User',
            lastname: profile.full_name?.split(' ').slice(1).join(' ') || 'ThriftPal',
            narration: `${profile.full_name || 'ThriftPal User'} Wallet`,
          }),
        });

        const vaData = await virtualAccountResponse.json();
        console.log('Flutterwave VA response:', JSON.stringify(vaData));

        if (vaData.status !== 'success') {
          throw new Error(vaData.message || 'Failed to create virtual account');
        }

        // Update profile with virtual account details
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            flw_account_reference: vaData.data.order_ref,
            flw_virtual_account_number: vaData.data.account_number,
            flw_virtual_bank_name: vaData.data.bank_name,
          })
          .eq('id', user.id);

        if (updateError) {
          console.error('Failed to update profile:', updateError);
          throw new Error('Failed to save virtual account details');
        }

        result = {
          success: true,
          message: 'Virtual account created successfully',
          virtual_account: {
            account_number: vaData.data.account_number,
            bank_name: vaData.data.bank_name,
            order_ref: vaData.data.order_ref,
          }
        };
        break;
      }

      case 'create_group_subaccount': {
        const { groupId } = params;
        if (!groupId) {
          throw new Error('Group ID is required');
        }

        // Verify user is admin
        const { data: group, error: groupError } = await supabase
          .from('thrift_groups')
          .select('*')
          .eq('id', groupId)
          .eq('admin_id', user.id)
          .single();

        if (groupError || !group) {
          throw new Error('Group not found or you are not the admin');
        }

        if (group.flw_subaccount_id) {
          result = {
            success: true,
            message: 'Group subaccount already exists',
            subaccount_id: group.flw_subaccount_id,
          };
          break;
        }

        // Get admin profile for settlement
        const { data: adminProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        // Create subaccount for group
        const subaccountResponse = await fetch(`${FLUTTERWAVE_BASE_URL}/subaccounts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            account_bank: adminProfile?.bank_name || 'PLACEHOLDER',
            account_number: adminProfile?.bank_account || '0000000000',
            business_name: `ThriftPal - ${group.name}`,
            business_email: user.email,
            business_contact: adminProfile?.full_name || 'Admin',
            business_contact_mobile: adminProfile?.phone || '+234',
            business_mobile: adminProfile?.phone || '+234',
            country: 'NG',
            split_type: 'percentage',
            split_value: 0.02, // 2% platform fee
          }),
        });

        const saData = await subaccountResponse.json();
        console.log('Flutterwave Subaccount response:', JSON.stringify(saData));

        if (saData.status !== 'success') {
          throw new Error(saData.message || 'Failed to create group subaccount');
        }

        // Update group with subaccount ID
        await supabase
          .from('thrift_groups')
          .update({
            flw_subaccount_id: saData.data.subaccount_id,
          })
          .eq('id', groupId);

        result = {
          success: true,
          message: 'Group subaccount created successfully',
          subaccount_id: saData.data.subaccount_id,
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Subaccount error:', error);
    
    // Map detailed errors to safe user-friendly messages
    let userMessage = 'An error occurred processing your request';
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('unauthorized') || msg.includes('no authorization')) {
        userMessage = 'Authentication required';
      } else if (msg.includes('profile not found')) {
        userMessage = 'User profile not found';
      } else if (msg.includes('onboarding') || msg.includes('bvn')) {
        userMessage = 'Please complete account verification first';
      } else if (msg.includes('group not found') || msg.includes('not the admin')) {
        userMessage = 'Group not found or access denied';
      } else if (msg.includes('failed to create') || msg.includes('failed to save')) {
        userMessage = 'Account setup could not be completed';
      } else if (msg.includes('unknown action')) {
        userMessage = 'Invalid operation requested';
      }
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: userMessage 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
