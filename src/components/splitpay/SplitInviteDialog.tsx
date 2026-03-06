import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, UserPlus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { useEffect } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  splitRequestId: string;
  amountPerPerson: number;
  purpose: string;
  existingParticipantIds: string[];
}

interface SearchResult {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export function SplitInviteDialog({ open, onOpenChange, splitRequestId, amountPerPerson, purpose, existingParticipantIds }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) {
      setResults([]);
      return;
    }
    const doSearch = async () => {
      setSearching(true);
      const { data } = await supabase.rpc("search_users", { search_term: debouncedSearch });
      setResults((data as SearchResult[]) || []);
      setSearching(false);
    };
    doSearch();
  }, [debouncedSearch]);

  const handleInvite = async (targetUser: SearchResult) => {
    if (!user) return;
    // Insert participant
    const { error } = await supabase.from("split_participants").insert({
      split_request_id: splitRequestId,
      user_id: targetUser.id,
      amount_due: amountPerPerson,
      status: "pending",
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    // Send notification
    await supabase.from("user_notifications").insert({
      user_id: targetUser.id,
      title: "SplitPay Request",
      message: `You've been invited to split "₦${amountPerPerson.toLocaleString()}" for "${purpose}".`,
      notification_type: "split_invite",
    });
    setInvitedIds((prev) => new Set(prev).add(targetUser.id));
    toast({ title: "Invited!", description: `${targetUser.full_name || targetUser.username} has been invited.` });
  };

  const allExcluded = new Set([...existingParticipantIds, ...(user ? [user.id] : [])]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Participants</DialogTitle>
          <DialogDescription>Search for users to split this bill with.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or username..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-60 overflow-y-auto space-y-2">
          {searching && <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>}
          {!searching && results.length === 0 && debouncedSearch.length >= 2 && (
            <p className="text-sm text-muted-foreground text-center py-4">No users found.</p>
          )}
          {results
            .filter((r) => !allExcluded.has(r.id))
            .map((r) => {
              const alreadyInvited = invitedIds.has(r.id);
              return (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                      {(r.full_name || r.username || "?")[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{r.full_name || r.username}</p>
                      {r.username && <p className="text-xs text-muted-foreground">@{r.username}</p>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={alreadyInvited ? "secondary" : "default"}
                    disabled={alreadyInvited}
                    onClick={() => handleInvite(r)}
                  >
                    {alreadyInvited ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  </Button>
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
