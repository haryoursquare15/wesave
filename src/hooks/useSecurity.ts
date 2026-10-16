import { invokeSecurityControls } from "@/lib/securityControls";
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TwoFASetupResult {
  success: boolean;
  secret?: string;
  otpauth_url?: string;
  backup_codes?: string[];
  message?: string;
  error?: string;
}

interface DeviceInfo {
  id: string;
  device_name: string;
  browser: string | null;
  os: string | null;
  is_trusted: boolean;
  is_current: boolean;
  last_used_at: string;
  created_at: string;
  device_fingerprint?: string;
}

interface WithdrawalCheckResult {
  allowed: boolean;
  reason?: string;
  daily_remaining?: number;
  monthly_remaining?: number;
  cooldown_until?: string;
  requires_2fa?: boolean;
  flagged?: boolean;
}

export function useSecurity() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ==================== 2FA Functions ====================
  const setup2FA = useCallback(async (): Promise<TwoFASetupResult> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await invokeSecurityControls(supabase, {
        body: { action: "setup_2fa" },
      });

      if (invokeError) throw invokeError;
      if (!data.success) throw new Error(data.error);

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to setup 2FA";
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const verify2FASetup = useCallback(async (token: string): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await invokeSecurityControls(supabase, {
        body: { action: "verify_2fa_setup", token },
      });

      if (invokeError) throw invokeError;
      if (!data.success) throw new Error(data.error);

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to verify 2FA";
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const verify2FA = useCallback(async (token: string, purpose?: string): Promise<{ verified: boolean; error?: string }> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await invokeSecurityControls(supabase, {
        body: { action: "verify_2fa", token, purpose },
      });

      if (invokeError) throw invokeError;

      return { verified: data.verified || false, error: data.error };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to verify 2FA";
      setError(message);
      return { verified: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const disable2FA = useCallback(async (token: string): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await invokeSecurityControls(supabase, {
        body: { action: "disable_2fa", token },
      });

      if (invokeError) throw invokeError;
      if (!data.success) throw new Error(data.error);

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to disable 2FA";
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const get2FAStatus = useCallback(async (): Promise<{ is_enabled: boolean; verified_at: string | null }> => {
    try {
      const { data, error: invokeError } = await invokeSecurityControls(supabase, {
        body: { action: "get_2fa_status" },
      });

      if (invokeError) throw invokeError;

      return {
        is_enabled: data.is_enabled || false,
        verified_at: data.verified_at || null,
      };
    } catch {
      return { is_enabled: false, verified_at: null };
    }
  }, []);

  // ==================== Device Functions ====================
  const registerDevice = useCallback(async (fingerprint: string, deviceInfo?: {
    device_name?: string;
    browser?: string;
    os?: string;
    ip_address?: string;
  }): Promise<{ is_new_device: boolean; is_trusted: boolean; requires_verification: boolean }> => {
    try {
      const { data, error: invokeError } = await invokeSecurityControls(supabase, {
        body: { 
          action: "register_device", 
          fingerprint,
          ...deviceInfo,
        },
      });

      if (invokeError) throw invokeError;

      return {
        is_new_device: data.is_new_device || false,
        is_trusted: data.is_trusted || false,
        requires_verification: data.requires_verification || false,
      };
    } catch {
      return { is_new_device: true, is_trusted: false, requires_verification: true };
    }
  }, []);

  const getDevices = useCallback(async (): Promise<DeviceInfo[]> => {
    try {
      const { data, error: invokeError } = await invokeSecurityControls(supabase, {
        body: { action: "get_devices" },
      });

      if (invokeError) throw invokeError;

      return data.devices || [];
    } catch {
      return [];
    }
  }, []);

  const trustDevice = useCallback(async (fingerprint: string, token?: string): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    try {
      const { data, error: invokeError } = await invokeSecurityControls(supabase, {
        body: { action: "trust_device", fingerprint, token },
      });

      if (invokeError) throw invokeError;
      if (!data.success) throw new Error(data.error);

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to trust device";
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const removeDevice = useCallback(async (deviceId: string): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    try {
      const { data, error: invokeError } = await invokeSecurityControls(supabase, {
        body: { action: "remove_device", device_id: deviceId },
      });

      if (invokeError) throw invokeError;
      if (!data.success) throw new Error(data.error);

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove device";
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== Withdrawal Functions ====================
  const checkWithdrawal = useCallback(async (amount: number): Promise<WithdrawalCheckResult> => {
    try {
      const { data, error: invokeError } = await invokeSecurityControls(supabase, {
        body: { action: "check_withdrawal", amount },
      });

      if (invokeError) throw invokeError;

      return data;
    } catch (err) {
      return { 
        allowed: false, 
        reason: err instanceof Error ? err.message : "Failed to check withdrawal limits" 
      };
    }
  }, []);

  const setBankCooldown = useCallback(async (): Promise<{ success: boolean; cooldown_until?: string; error?: string }> => {
    setLoading(true);
    try {
      const { data, error: invokeError } = await invokeSecurityControls(supabase, {
        body: { action: "set_bank_cooldown" },
      });

      if (invokeError) throw invokeError;

      return { 
        success: data.success, 
        cooldown_until: data.cooldown_until,
        error: data.error,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to set cooldown";
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== Credit Score Functions ====================
  const getCreditScoreHistory = useCallback(async () => {
    try {
      const { data, error: invokeError } = await invokeSecurityControls(supabase, {
        body: { action: "get_score_history" },
      });

      if (invokeError) throw invokeError;

      return data.history || [];
    } catch {
      return [];
    }
  }, []);

  return {
    loading,
    error,
    // 2FA
    setup2FA,
    verify2FASetup,
    verify2FA,
    disable2FA,
    get2FAStatus,
    // Devices
    registerDevice,
    getDevices,
    trustDevice,
    removeDevice,
    // Withdrawals
    checkWithdrawal,
    setBankCooldown,
    // Credit Score
    getCreditScoreHistory,
  };
}
