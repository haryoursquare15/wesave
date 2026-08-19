import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { requireAdminJwt, serviceClient, verifyCronToken } from '../_shared/cron-auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // This endpoint leaks internal banking gateway configuration, so it is
  // restricted to admins and internal ops/cron callers.
  const db = serviceClient()
  const isCron = await verifyCronToken(req, 'vfd_mode_check', db)
  const admin = isCron ? null : await requireAdminJwt(req, db)
  if (!isCron && !admin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const raw = Deno.env.get('MANDATE_TEST_MODE') ?? null
  const active = (raw ?? '').toLowerCase() === 'true'
  const mode = (Deno.env.get('VFD_MODE') ?? 'sandbox').toLowerCase()
  const prod = mode === 'production'
  const host = prod ? 'https://api-apps.vfdbank.systems' : 'https://api-devapps.vfdbank.systems'
  const apiBase = Deno.env.get('VFD_API_BASE') || null
  const baseUrl = Deno.env.get('VFD_BASE_URL') || null
  const gw = Deno.env.get('VFD_GATEWAY_URL') || null
  const resolved = {
    products_api: apiBase || host,
    mandate_api: baseUrl || (host + '/vtech-mandate/api/v2/directdebit'),
    wallet_api: host + '/vtech-wallet/api/v2/wallet2',
    bills_api: host + '/vtech-bills/api/v2/billspaymentstore',
    gateway_url: gw,
  }
  const sandboxLeaks = Object.entries(resolved)
    .filter(([, v]) => typeof v === 'string' && v.includes('devapps'))
    .map(([k]) => k)
  return new Response(JSON.stringify({
    vfd_mode: mode,
    mandate_test_mode_raw: raw,
    mandate_test_mode_active: active,
    override_secrets: { VFD_API_BASE: apiBase, VFD_BASE_URL: baseUrl },
    resolved,
    sandbox_leaks: sandboxLeaks,
    live_calls_enabled: !active && prod && sandboxLeaks.length === 0,
  }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
