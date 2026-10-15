// Display-only details for the PIN sign-in screen (first name + photo, never email).
export const WELCOME_KEY = "vestara_welcome";
export type Welcome = { firstName?: string; initials?: string; avatarUrl?: string };
export function syncWelcome(fullName?: string | null, avatarUrl?: string | null) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length && !avatarUrl) return;
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const w: Welcome = {
    firstName: parts[0] ? cap(parts[0]) : undefined,
    initials: parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || undefined,
    avatarUrl: avatarUrl || undefined,
  };
  try { localStorage.setItem(WELCOME_KEY, JSON.stringify(w)); } catch { /* ignore */ }
}
