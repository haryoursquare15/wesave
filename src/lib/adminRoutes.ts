/**
 * Obscured admin/staff console paths.
 *
 * The console is intentionally NOT served from a guessable path like
 * "/admin" or "/admin/login". Update ADMIN_BASE here to rotate the path;
 * every link in the app derives from these constants.
 *
 * Note: obscurity is a defence-in-depth layer only — access is still
 * enforced server-side by the is_any_admin RPC + RLS.
 */
export const ADMIN_BASE = "/vst-ops-9f3c";

export const ADMIN_LOGIN_PATH = `${ADMIN_BASE}/signin`;
export const ADMIN_CONSOLE_PATH = `${ADMIN_BASE}/console`;
export const ADMIN_RECURRING_TEST_PATH = `${ADMIN_BASE}/console/recurring-test`;

/** Applies noindex/nofollow so crawlers never surface staff pages. */
export function useNoIndex() {
  if (typeof document === "undefined") return;
  let tag = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = "robots";
    document.head.appendChild(tag);
  }
  tag.content = "noindex, nofollow, noarchive, nosnippet";
}
