export function pushCategoryEnabled(category: string, prefs: { transactions?: boolean; marketing?: boolean } | null): boolean {
  if (category === "security") return true;
  return category === "marketing" ? (prefs?.marketing ?? false) : (prefs?.transactions ?? true);
}

// Android lock screens never receive financial text from notification producers.
export function androidPushData(url: string, tag: string): Record<string, string> {
  return { title: "Vestara", body: "You have a new notification. Open Vestara to view it.", url, tag };
}

export function isInvalidFcmToken(status: number, body: unknown): boolean {
  if (status === 404) return true;
  const response = body as { error?: { details?: { errorCode?: string; "@type"?: string }[] } } | null;
  return !!response?.error?.details?.some((detail) =>
    detail["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError" &&
    ["UNREGISTERED", "INVALID_ARGUMENT"].includes(detail.errorCode ?? ""),
  );
}