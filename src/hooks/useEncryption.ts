import { supabase } from "@/integrations/supabase/client";

interface EncryptProfilePIIParams {
  bvn?: string;
  bank_account?: string;
  bank_name?: string;
  phone?: string;
}

interface DecryptedPII {
  bvn?: string;
  bank_account?: string;
  bank_name?: string;
  phone?: string;
}

interface MaskedPII {
  bvn_masked?: string;
  bank_account_masked?: string;
  bank_name?: string;
  phone_masked?: string;
}

/**
 * Hook for encrypting and decrypting sensitive PII data
 * Uses AES-256-GCM encryption via edge function
 */
export function useEncryption() {
  /**
   * Encrypt and store sensitive profile data
   * Clears plaintext fields and stores encrypted versions
   */
  const encryptProfilePII = async (data: EncryptProfilePIIParams): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: result, error } = await supabase.functions.invoke('encryption-utils', {
        body: {
          action: 'encrypt_profile_pii',
          ...data,
        },
      });

      if (error) {
        console.error('Encryption error:', error);
        return { success: false, error: 'Failed to encrypt data' };
      }

      return result;
    } catch (error) {
      console.error('Encryption error:', error);
      return { success: false, error: 'Failed to encrypt data' };
    }
  };

  /**
   * Decrypt and retrieve sensitive profile data
   * Only call this when absolutely necessary (e.g., for Flutterwave API calls)
   */
  const decryptProfilePII = async (): Promise<{ success: boolean; data?: DecryptedPII; error?: string }> => {
    try {
      const { data: result, error } = await supabase.functions.invoke('encryption-utils', {
        body: {
          action: 'decrypt_profile_pii',
        },
      });

      if (error) {
        console.error('Decryption error:', error);
        return { success: false, error: 'Failed to decrypt data' };
      }

      return result;
    } catch (error) {
      console.error('Decryption error:', error);
      return { success: false, error: 'Failed to decrypt data' };
    }
  };

  /**
   * Get masked versions of sensitive data for display
   * Shows only last 4 characters (e.g., "****1234")
   */
  const getMaskedProfile = async (): Promise<{ success: boolean; data?: MaskedPII; error?: string }> => {
    try {
      // Don't call the function before the auth session is hydrated
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { success: false, error: 'Not authenticated' };

      const { data: result, error } = await supabase.functions.invoke('encryption-utils', {
        body: {
          action: 'get_masked_profile',
        },
      });

      if (error) {
        console.error('Masked profile error:', error);
        return { success: false, error: 'Failed to get masked data' };
      }

      return result;
    } catch (error) {
      console.error('Masked profile error:', error);
      return { success: false, error: 'Failed to get masked data' };
    }
  };

  return {
    encryptProfilePII,
    decryptProfilePII,
    getMaskedProfile,
  };
}
