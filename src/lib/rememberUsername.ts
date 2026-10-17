const KEY = "vestara_remembered_username";

export function readRememberedUsername(): string {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function rememberUsername(username: string, enabled: boolean): void {
  try {
    if (enabled && username.trim()) localStorage.setItem(KEY, username.trim());
    else localStorage.removeItem(KEY);
  } catch {
    // Restricted device storage must never prevent signing in.
  }
}