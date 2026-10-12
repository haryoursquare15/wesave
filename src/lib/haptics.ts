// Haptic feedback via Capacitor (native) with a quiet web fallback. Never throws.
import { Capacitor } from "@capacitor/core";

type Kind = "light" | "success" | "error";

export async function haptic(kind: Kind = "light") {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
      if (kind === "light") await Haptics.impact({ style: ImpactStyle.Light });
      else await Haptics.notification({ type: kind === "success" ? NotificationType.Success : NotificationType.Error });
      return;
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(kind === "light" ? 8 : kind === "success" ? [10, 40, 10] : [30, 40, 30]);
    }
  } catch {
    /* silent */
  }
}
