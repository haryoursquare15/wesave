import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface UserSearchResult {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  membership_tier: "gold" | "silver" | "bronze" | "newbie";
  credit_score: number | null;
}

interface InviteValidation {
  valid: boolean;
  group_id: string | null;
  group_name: string | null;
  contribution_amount: number | null;
  period: "daily" | "weekly" | "monthly" | null;
  max_members: number | null;
  member_count: number | null;
  error_message: string | null;
}

export function useSearchUsers() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const searchUsers = useCallback(async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: searchError } = await supabase.rpc("search_users", {
        search_term: searchTerm,
      });

      if (searchError) throw searchError;
      setResults(data || []);
    } catch (err) {
      setError(err as Error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { searchUsers, results, loading, error, clearResults: () => setResults([]) };
}

export function useAddMemberToGroup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const addMember = useCallback(async (groupId: string, userId: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: addError } = await supabase.rpc("add_member_to_group", {
        target_group_id: groupId,
        target_user_id: userId,
      });

      if (addError) throw addError;

      const result = data as { success: boolean; error?: string; message?: string };
      if (!result.success) {
        throw new Error(result.error || "Failed to add member");
      }

      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { addMember, loading, error };
}

export function useCreateInviteLink() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createInviteLink = useCallback(async (groupId: string, maxUses?: number) => {
    if (!user) throw new Error("Must be logged in");

    setLoading(true);
    setError(null);

    try {
      const { data, error: createError } = await supabase
        .from("group_invitations")
        .insert({
          group_id: groupId,
          created_by: user.id,
          max_uses: maxUses || null,
        })
        .select("invite_token")
        .single();

      if (createError) throw createError;

      const baseUrl = window.location.origin;
      return `${baseUrl}/invite/${data.invite_token}`;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user]);

  return { createInviteLink, loading, error };
}

export function useValidateInvite() {
  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState<InviteValidation | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const validateToken = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: validateError } = await supabase.rpc("validate_invite_token", {
        token,
      });

      if (validateError) throw validateError;

      if (data && data.length > 0) {
        setValidation(data[0]);
        return data[0];
      }

      throw new Error("Invalid invitation");
    } catch (err) {
      setError(err as Error);
      setValidation(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { validateToken, validation, loading, error };
}

export function useJoinGroupViaInvite() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const joinGroup = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: joinError } = await supabase.rpc("join_group_via_invite", {
        token,
      });

      if (joinError) throw joinError;

      const result = data as { success: boolean; error?: string; group_id?: string };
      if (!result.success) {
        throw new Error(result.error || "Failed to join group");
      }

      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { joinGroup, loading, error };
}
