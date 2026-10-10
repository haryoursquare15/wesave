import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";

const base = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function post(fn: string, body: unknown, token?: string) {
  try {
    const res = await fetch(`${base()}/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { success: false, error: "Couldn't reach Vestara. Check your connection and try again." };
  }
}

async function hydrate(session?: { access_token: string; refresh_token: string }) {
  if (!session) return new Error("Sign-in failed. Please try again.");
  const { error } = await sandboxSupabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  return error ? new Error(error.message) : null;
}

export async function requestSignupOtp(email: string): Promise<{ error: string | null }> {
  const r = await post("sandbox-signup-otp", { action: "send", email });
  return { error: r?.success ? null : r?.error || "Couldn't send the code. Try again." };
}

export async function verifySignupAndSignIn(input: {
  email: string; code: string; password: string; fullName: string; phone: string;
}): Promise<{ error: string | null; attemptsRemaining?: number }> {
  const r = await post("sandbox-signup-otp", {
    action: "verify_and_create",
    email: input.email,
    code: input.code,
    password: input.password,
    full_name: input.fullName,
    phone: input.phone,
  });
  if (!r?.success) return { error: r?.error || "Verification failed.", attemptsRemaining: r?.attempts_remaining };
  const err = await hydrate(r.session);
  return { error: err?.message ?? null };
}

export async function unlockWithPin(email: string, pin: string) {
  const r = await post("login-pin", { action: "unlock_pin", email, pin });
  if (!r?.success) return { error: r?.error || "Incorrect PIN.", reset: !!r?.reset, locked: !!r?.is_locked };
  const err = await hydrate(r.session);
  return { error: err?.message ?? null, reset: false, locked: false };
}

export async function unlockWithBiometricToken(device_token: string) {
  const r = await post("login-pin", { action: "unlock_biometric", device_token });
  if (!r?.success) return { error: r?.error || "Biometric unlock failed.", reset: !!r?.reset };
  const err = await hydrate(r.session);
  return { error: err?.message ?? null, reset: false };
}

export async function loginPinAction(body: Record<string, unknown>) {
  const { data } = await sandboxSupabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { success: false, error: "Please sign in again." };
  return post("login-pin", body, token);
}
