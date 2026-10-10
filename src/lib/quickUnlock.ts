// Device-local quick-unlock state for the sandbox app.
// Stores the user's email (not tokens) so the sign-in screen can offer PIN
// unlock, plus an opaque biometric device token the login-pin edge function
// trades for a fresh session after a successful WebAuthn/biometric check.
const QU_KEY = "vestara.sandbox.quickUnlock";
const BIO_CRED_KEY = "vestara.sandbox.biometricCredId";
const BIO_TOKEN_KEY = "vestara.sandbox.biometricToken";

export interface QuickUnlockState {
  email: string;
  hasPin: boolean;
  updatedAt: number;
}

export function readQuickUnlock(): QuickUnlockState | null {
  try {
    const raw = localStorage.getItem(QU_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as QuickUnlockState;
  } catch {
    return null;
  }
}

export function saveQuickUnlock(email: string, hasPin: boolean) {
  localStorage.setItem(
    QU_KEY,
    JSON.stringify({ email: email.toLowerCase(), hasPin, updatedAt: Date.now() } as QuickUnlockState),
  );
}

export function clearQuickUnlock() {
  localStorage.removeItem(QU_KEY);
  localStorage.removeItem(BIO_CRED_KEY);
  localStorage.removeItem(BIO_TOKEN_KEY);
}

export function hasBiometricSetup(): boolean {
  return !!(localStorage.getItem(BIO_CRED_KEY) && localStorage.getItem(BIO_TOKEN_KEY));
}

export function clearBiometric() {
  localStorage.removeItem(BIO_CRED_KEY);
  localStorage.removeItem(BIO_TOKEN_KEY);
}

export function readBiometricToken(): string | null {
  return localStorage.getItem(BIO_TOKEN_KEY);
}

// --- WebAuthn helpers (platform authenticator = device biometric) -----------

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(s: string): ArrayBuffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function biometricSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("PublicKeyCredential" in window)) return false;
  try {
    // deno-lint-ignore no-explicit-any
    return await (PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function enrollBiometric(userId: string, email: string, deviceToken: string): Promise<boolean> {
  if (!(await biometricSupported())) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(userId);
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: "Vestara", id: window.location.hostname },
        user: { id: userIdBytes, name: email, displayName: email },
        challenge,
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    localStorage.setItem(BIO_CRED_KEY, b64url(cred.rawId));
    localStorage.setItem(BIO_TOKEN_KEY, deviceToken);
    return true;
  } catch (e) {
    console.warn("biometric enroll failed:", e);
    return false;
  }
}

export async function biometricAssert(): Promise<string | null> {
  const credId = localStorage.getItem(BIO_CRED_KEY);
  const token = localStorage.getItem(BIO_TOKEN_KEY);
  if (!credId || !token) return null;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: fromB64url(credId), type: "public-key" }],
        userVerification: "required",
        timeout: 60_000,
        rpId: window.location.hostname,
      },
    });
    return assertion ? token : null;
  } catch (e) {
    console.warn("biometric assert failed:", e);
    return null;
  }
}
