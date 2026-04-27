import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
// NOTE: Use *Sync variants — async bcrypt spawns a Web Worker which is unavailable in Supabase edge runtime ("Worker is not defined").

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Reject obviously weak PINs
function isWeakPin(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "PIN must be exactly 4 digits";
  // All same digit
  if (/^(\d)\1{3}$/.test(pin)) return "PIN cannot be all the same digit";
  // Sequential ascending or descending
  const digits = pin.split("").map(Number);
  let asc = true, desc = true;
  for (let i = 1; i < 4; i++) {
    if (digits[i] !== digits[i - 1] + 1) asc = false;
    if (digits[i] !== digits[i - 1] - 1) desc = false;
  }
  if (asc || desc) return "PIN cannot be sequential digits";
  // Common weak PINs
  const weak = ["1234", "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1212", "2121", "1010", "2580", "0852", "1357", "2468"];
  if (weak.includes(pin)) return "This PIN is too common, please choose another";
  return null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ success: false, error: "Authentication required" }, 401);

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return jsonResponse({ success: false, error: "Authentication required" }, 401);

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    const { action, pin, new_pin, current_pin, purpose } = await req.json();
    console.log(`transaction-pin action: ${action} user: ${user.id}`);

    const audit = async (event_type: string, metadata: Record<string, unknown> = {}) => {
      await supabase.from("pin_audit_log").insert({
        user_id: user.id,
        event_type,
        purpose: purpose || null,
        ip_address: ip,
        user_agent: userAgent,
        metadata,
      });
    };

    switch (action) {
      case "get_status": {
        const { data } = await supabase
          .from("transaction_pins")
          .select("id, failed_attempts, locked_until, pin_set_at, last_used_at")
          .eq("user_id", user.id)
          .maybeSingle();

        const isLocked = data?.locked_until && new Date(data.locked_until) > new Date();
        return jsonResponse({
          success: true,
          has_pin: !!data,
          is_locked: !!isLocked,
          locked_until: isLocked ? data.locked_until : null,
          failed_attempts: data?.failed_attempts || 0,
          pin_set_at: data?.pin_set_at || null,
        });
      }

      case "set_pin": {
        if (!pin) return jsonResponse({ success: false, error: "PIN is required" }, 400);
        const weak = isWeakPin(pin);
        if (weak) return jsonResponse({ success: false, error: weak }, 400);

        const { data: existing } = await supabase
          .from("transaction_pins")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing) {
          return jsonResponse({
            success: false,
            error: "PIN already set. Use change_pin to update.",
          }, 400);
        }

        const hash = bcrypt.hashSync(pin, bcrypt.genSaltSync(10));
        const { error: insertError } = await supabase
          .from("transaction_pins")
          .insert({
            user_id: user.id,
            pin_hash: hash,
            failed_attempts: 0,
            pin_set_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error("set_pin insert error:", insertError);
          return jsonResponse({ success: false, error: "Failed to set PIN" }, 500);
        }

        await audit("pin_set");
        return jsonResponse({ success: true, message: "PIN set successfully" });
      }

      case "change_pin": {
        if (!current_pin || !new_pin) {
          return jsonResponse({ success: false, error: "Current and new PIN required" }, 400);
        }
        const weak = isWeakPin(new_pin);
        if (weak) return jsonResponse({ success: false, error: weak }, 400);

        const { data: row } = await supabase
          .from("transaction_pins")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!row) return jsonResponse({ success: false, error: "No PIN set" }, 400);

        const isLocked = row.locked_until && new Date(row.locked_until) > new Date();
        if (isLocked) {
          return jsonResponse({
            success: false,
            error: "PIN is locked. Try again later.",
            locked_until: row.locked_until,
          }, 423);
        }

        const valid = bcrypt.compareSync(current_pin, row.pin_hash);
        if (!valid) {
          await audit("verify_failed", { reason: "change_pin_wrong_current" });
          return jsonResponse({ success: false, error: "Current PIN is incorrect" }, 400);
        }

        const newHash = bcrypt.hashSync(new_pin, bcrypt.genSaltSync(10));
        await supabase
          .from("transaction_pins")
          .update({
            pin_hash: newHash,
            failed_attempts: 0,
            locked_until: null,
            pin_set_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);

        await audit("pin_changed");
        return jsonResponse({ success: true, message: "PIN changed successfully" });
      }

      case "verify_pin": {
        if (!pin) return jsonResponse({ success: false, error: "PIN is required" }, 400);

        const { data: row } = await supabase
          .from("transaction_pins")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!row) {
          return jsonResponse({ success: false, error: "No PIN set", needs_setup: true }, 400);
        }

        const isLocked = row.locked_until && new Date(row.locked_until) > new Date();
        if (isLocked) {
          // Return 200 so supabase-js doesn't surface this as a console/runtime error.
          // The client keys off `success` + `is_locked`, not the HTTP status.
          return jsonResponse({
            success: false,
            error: `Too many failed attempts. Try again after ${new Date(row.locked_until).toLocaleTimeString()}.`,
            locked_until: row.locked_until,
            is_locked: true,
          });
        }

        const valid = bcrypt.compareSync(pin, row.pin_hash);

        if (!valid) {
          const newAttempts = (row.failed_attempts || 0) + 1;
          const updates: Record<string, unknown> = { failed_attempts: newAttempts };

          if (newAttempts >= MAX_ATTEMPTS) {
            const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
            updates.locked_until = lockUntil;
            await supabase.from("transaction_pins").update(updates).eq("user_id", user.id);
            await audit("locked_out", { attempts: newAttempts });
            // Return 200 — handled gracefully by the client gate.
            return jsonResponse({
              success: false,
              error: `Too many failed attempts. PIN locked for ${LOCKOUT_MINUTES} minutes.`,
              locked_until: lockUntil,
              is_locked: true,
            });
          }

          await supabase.from("transaction_pins").update(updates).eq("user_id", user.id);
          await audit("verify_failed", { attempts: newAttempts });

          // Return 200 — wrong PIN is an expected user input case, not a transport error.
          return jsonResponse({
            success: false,
            error: `Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? "" : "s"} remaining.`,
            attempts_remaining: MAX_ATTEMPTS - newAttempts,
          });
        }

        // Success — reset counters
        await supabase
          .from("transaction_pins")
          .update({
            failed_attempts: 0,
            locked_until: null,
            last_used_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);

        await audit("verify_success");
        return jsonResponse({ success: true, verified: true });
      }

      default:
        return jsonResponse({ success: false, error: "Invalid action" }, 400);
    }
  } catch (err) {
    console.error("transaction-pin error:", err);
    return jsonResponse({
      success: false,
      error: err instanceof Error ? err.message : "Internal error",
    }, 500);
  }
});
