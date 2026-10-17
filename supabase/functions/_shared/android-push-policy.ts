export function pushCategoryEnabled(category: string, prefs: { transactions?: boolean; marketing?: boolean } | null): boolean {
  if (category === "security") return true;
  return category === "marketing" ? (prefs?.marketing ?? false) : (prefs?.transactions ?? true);
}

// Preview the message, but strip numeric financial values, account numbers and codes.
export function androidPushData(url: string, tag: string, title?: string, body?: string): Record<string, string> {
  const preview = (value: string, limit: number) => value
    .replace(/(?:₦|NGN|USD|GBP|EUR|\$|£|€)?\s*\d[\d,]*(?:\.\d+)?/gi, " [hidden]")
    .replace(/\s+/g, " ").trim().slice(0, limit);
  return {
    title: preview(title || "Vestara", 120),
    body: preview(body || "You have a new notification. Open Vestara to view it.", 500),
    url, tag,
  };
}

export function isInvalidFcmToken(status: number, body: unknown): boolean {
  if (status === 404) return true;
  const response = body as { error?: { details?: { errorCode?: string; "@type"?: string }[] } } | null;
  return !!response?.error?.details?.some((detail) =>
    detail["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError" &&
    ["UNREGISTERED", "INVALID_ARGUMENT"].includes(detail.errorCode ?? ""),
  );
}