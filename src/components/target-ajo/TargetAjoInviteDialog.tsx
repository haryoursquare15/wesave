import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { UserPlus, Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  onSuccess: () => void;
}

export function TargetAjoInviteDialog({ open, onOpenChange, groupId, onSuccess }: Props) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);

  const searchUsers = async () => {
    if (!query.trim() || query.trim().length < 2) return;
    setSearching(true);
    try {
      const escaped = query.trim().replace(/[%_\\]/g, "\\$&");
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username, email")
        .or(`username.ilike.%${escaped}%,full_name.ilike.%${escaped}%`)
        .neq("id", user?.id || "")
        .limit(10);
      setResults(data || []);
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const inviteUser = async (inviteeId: string) => {
    if (!user) return;
    setInviting(inviteeId);
    try {
      const { error } = await (supabase as any).from("target_ajo_invites").insert({
        group_id: groupId,
        inviter_id: user.id,
        invitee_id: inviteeId,
      });
      if (error) {
        if (error.code === "23505") toast.error("User already invited");
        else throw error;
        return;
      }
      toast.success("Invite sent!");
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to invite");
    } finally {
      setInviting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Invite Members
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Search by name or username..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchUsers()}
          />
          <Button size="icon" onClick={searchUsers} disabled={searching}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {results.length === 0 && !searching && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Search for users to invite
            </p>
          )}
          {results.map((u) => (
            <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium text-foreground">{u.full_name || u.username || "User"}</p>
                <p className="text-xs text-muted-foreground">@{u.username || u.email?.split("@")[0]}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => inviteUser(u.id)}
                disabled={inviting === u.id}
              >
                {inviting === u.id ? "..." : "Invite"}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
