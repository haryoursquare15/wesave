import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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

  // Relaxed for testing - no group limit
  const canJoinGroup = true;
  const canCreateGroup = true;

  return { groupCount, loading, canJoinGroup, canCreateGroup };
}
