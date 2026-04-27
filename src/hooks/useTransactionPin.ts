import { useState, useCallback } from "react";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";

export interface PinStatus {
  has_pin: boolean;
  is_locked: boolean;
  locked_until: string | null;
  failed_attempts: number;
  pin_set_at: string | null;
}

export function useTransactionPin() {
  const { client: supabase, session } = useSandboxAwareAuth();
  const [loading, setLoading] = useState(false);

  const invoke = useCallback(
    async (body: Record<string, unknown>) => {
      const accessToken = session?.access_token;
      if (!accessToken) return { success: false, error: "Not authenticated" };
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("transaction-pin", {
          body,
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (error) {
          // Edge function returned non-2xx — try to read the body
          // supabase.functions.invoke returns the JSON body on data even with 4xx in newer SDK
          return { success: false, error: error.message || "Request failed" };
        }
        return data;
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      } finally {
        setLoading(false);
      }
    },
    [session?.access_token, supabase]
  );

  const getStatus = useCallback(async (): Promise<PinStatus | null> => {
    const res = await invoke({ action: "get_status" });
    if (res?.success) {
      return {
        has_pin: !!res.has_pin,
        is_locked: !!res.is_locked,
        locked_until: res.locked_until || null,
        failed_attempts: res.failed_attempts || 0,
        pin_set_at: res.pin_set_at || null,
      };
    }
    return null;
  }, [invoke]);

  const setPin = useCallback(
    (pin: string) => invoke({ action: "set_pin", pin }),
    [invoke]
  );

  const verifyPin = useCallback(
    (pin: string, purpose?: string) =>
      invoke({ action: "verify_pin", pin, purpose }),
    [invoke]
  );

  const changePin = useCallback(
    (current_pin: string, new_pin: string) =>
      invoke({ action: "change_pin", current_pin, new_pin }),
    [invoke]
  );

  return { loading, getStatus, setPin, verifyPin, changePin };
}
