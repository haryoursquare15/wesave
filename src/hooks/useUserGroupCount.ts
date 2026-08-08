import { useState, useEffect } from "react";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
// LEGACY (WeSave decommission): this file still queries dropped tables/RPCs.
// Kept as dead code pending a dedicated frontend cleanup pass.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = supabaseClient as any;
import { useAuth } from "@/contexts/AuthContext";

export function useUserGroupCount() {
  const { user } = useAuth();
  const [groupCount, setGroupCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchGroupCount() {
      if (!user) {
        setGroupCount(0);
        setLoading(false);
        return;
      }

      try {
        const { count, error } = await supabase
          .from("group_memberships")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "active");

        if (error) throw error;
        setGroupCount(count || 0);
      } catch (err) {
        console.error("Error fetching group count:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchGroupCount();
  }, [user]);

  const canJoinGroup = groupCount < 2;
  const canCreateGroup = groupCount < 2;

  return { groupCount, loading, canJoinGroup, canCreateGroup };
}
