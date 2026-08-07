/**
 * Customer-facing route paths for the Vestara app.
 *
 * The product used to live under /vfd-sandbox/*. Those paths are still
 * registered in the router as redirect-only routes (see App.tsx) so old
 * invite links, password-reset emails and bookmarks keep working.
 */
export const APP_HOME = "/app";
export const SIGN_IN = "/signin";
export const FORGOT_PASSWORD = "/password/forgot";
export const RESET_PASSWORD = "/password/reset";
export const JOIN = "/join"; // + /:token

export const joinPath = (token: string) => `${JOIN}/${token}`;

/** Legacy paths kept alive purely for backward compatibility. */
export const LEGACY_APP_BASE = "/vfd-sandbox";
