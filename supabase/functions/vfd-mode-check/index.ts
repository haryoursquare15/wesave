import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const raw = Deno.env.get('MANDATE_TEST_MODE') ?? null
  const active = (raw ?? '').toLowerCase() === 'true'
  const mode = (Deno.env.get('VFD_MODE') ?? 'sandbox').toLowerCase()
  return new Response(JSON.stringify({
    mandate_test_mode_raw: raw,
    mandate_test_mode_active: active,
    vfd_mode: mode,
    mandate_host: mode === 'production'
      ? 'https://api-apps.vfdbank.systems/vtech-mandate/api/v2/directdebit'
      : 'https://api-devapps.vfdbank.systems/vtech-mandate/api/v1/directdebit',
    live_calls_enabled: !active && mode === 'production',
  }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
