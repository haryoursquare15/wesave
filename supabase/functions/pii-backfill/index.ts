// One-time backfill: encrypt plaintext PII on profiles into *_encrypted columns.
// Public (no JWT) but idempotent and only writes _encrypted columns when null.
// DELETE THIS FUNCTION after the drop-columns migration runs.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getKey(): Promise<CryptoKey> {
  const keyHex = (Deno.env.get('ENCRYPTION_KEY') || '').replace(/[^0-9a-fA-F]/g, '');
  if (keyHex.length !== 64) throw new Error('ENCRYPTION_KEY invalid');
  const bytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  return await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt']);
}
async function encryptVal(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0); combined.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...combined));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const key = await getKey();
    const { data: rows, error } = await supabase
      .from('profiles')
      .select('id, bvn, bvn_encrypted, bank_account, bank_account_encrypted, bank_name, bank_name_encrypted, phone, phone_encrypted, id_number, id_number_encrypted');
    if (error) throw error;

    let updated = 0, failed = 0;
    for (const r of rows || []) {
      const patch: Record<string, string> = {};
      if (r.bvn && !r.bvn_encrypted) patch.bvn_encrypted = await encryptVal(key, r.bvn);
      if (r.bank_account && !r.bank_account_encrypted) patch.bank_account_encrypted = await encryptVal(key, r.bank_account);
      if (r.bank_name && !r.bank_name_encrypted) patch.bank_name_encrypted = await encryptVal(key, r.bank_name);
      if (r.phone && !r.phone_encrypted) patch.phone_encrypted = await encryptVal(key, r.phone);
      if (r.id_number && !r.id_number_encrypted) patch.id_number_encrypted = await encryptVal(key, r.id_number);
      if (!Object.keys(patch).length) continue;
      const { error: upErr } = await supabase.from('profiles').update(patch).eq('id', r.id);
      if (upErr) { failed++; console.error('row', r.id, upErr.message); } else updated++;
    }
    return new Response(JSON.stringify({ success: true, scanned: rows?.length || 0, updated, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ success: false, error: String(e instanceof Error ? e.message : e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
