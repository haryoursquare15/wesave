import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, UserPlus, Check, Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  splitRequestId: string;
  amountPerPerson: number;
  purpose: string;
  existingParticipantIds: string[];
  maxParticipants: number;
}

interface UserResult {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export function SplitInviteDialog({ open, onOpenChange, splitRequestId, amountPerPerson, purpose, existingParticipantIds, maxParticipants }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState("friends");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<UserResult[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebounce(search, 300);

  // Fetch friends: users who were in the same split_requests before
  const fetchFriends = useCallback(async () => {
    if (!user) return;
    setLoadingFriends(true);

    // Get all split request IDs the current user participated in
    const { data: myParticipations } = await supabase
      .from("split_participants")
      .select("split_request_id")
      .eq("user_id", user.id);

    if (!myParticipations || myParticipations.length === 0) {
      setFriends([]);
      setLoadingFriends(false);
      return;
    }

    const splitIds = myParticipations.map((p) => p.split_request_id);

    // Get distinct user IDs from those splits (excluding self)
    const { data: coParticipants } = await supabase
      .from("split_participants")
      .select("user_id")
      .in("split_request_id", splitIds)
      .neq("user_id", user.id);

    if (!coParticipants || coParticipants.length === 0) {
      setFriends([]);
      setLoadingFriends(false);
      return;
    }

    const uniqueIds = [...new Set(coParticipants.map((p) => p.user_id))];

    // Use RPC to fetch profiles (bypasses RLS restrictions on profiles table)
    const { data: profiles } = await supabase.rpc("get_public_profiles", { user_ids: uniqueIds });

    setFriends((profiles as UserResult[]) || []);
    setLoadingFriends(false);
  }, [user]);

  useEffect(() => {
    if (open) {
      fetchFriends();
      setInvitedIds(new Set());
      setSearch("");
      setResults([]);
      setTab("friends");
    }
  }, [open, fetchFriends]);

  // Search users
  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) {
      setResults([]);
      return;
    }
    const doSearch = async () => {
      setSearching(true);
      const { data } = await supabase.rpc("search_users", { search_term: debouncedSearch });
      setResults((data as UserResult[]) || []);
      setSearching(false);
    };
    doSearch();
  }, [debouncedSearch]);

  const remainingSlots = maxParticipants - existingParticipantIds.length - invitedIds.size;
  const allExcluded = new Set([...existingParticipantIds, ...(user ? [user.id] : [])]);

  const handleInvite = async (targetUser: UserResult) => {
    if (!user) return;
    if (remainingSlots <= 0) {
      toast({ title: "Limit reached", description: "All participant slots are filled.", variant: "destructive" });
      return;
    }
    console.log("[SplitInvite] Calling send_split_invite with:", {
      splitRequestId, inviterId: user.id, inviteeId: targetUser.id, amountPerPerson
    });
    const { data, error } = await supabase.rpc("send_split_invite", {
      _split_request_id: splitRequestId,
      _inviter_id: user.id,
      _invitee_id: targetUser.id,
      _amount_due: amountPerPerson,
    });
    console.log("[SplitInvite] Result:", { data, error });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      toast({ title: "Error", description: result.error || "Could not send invite", variant: "destructive" });
      return;
    }
    setInvitedIds((prev) => new Set(prev).add(targetUser.id));
    toast({ title: "Invited!", description: `${targetUser.full_name || targetUser.username} has been invited.` });
  };

  const renderUserRow = (u: UserResult) => {
    const excluded = allExcluded.has(u.id);
    const alreadyInvited = invitedIds.has(u.id);
    if (excluded) return null;

    return (
      <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            {u.avatar_url && <AvatarImage src={u.avatar_url} alt={u.full_name || ""} />}
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
              {(u.full_name || u.username || "?")[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium text-foreground">{u.full_name || u.username}</p>
            {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
          </div>
        </div>
        <Button
          size="sm"
          variant={alreadyInvited ? "secondary" : "default"}
          disabled={alreadyInvited || remainingSlots <= 0}
          onClick={() => handleInvite(u)}
          className="gap-1.5"
        >
          {alreadyInvited ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span className="text-xs">Sent</span>
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" />
              <span className="text-xs">Invite</span>
            </>
          )}
        </Button>
      </div>
    );
  };

  const filteredFriends = friends.filter((f) => !allExcluded.has(f.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-lg">Invite Participants</DialogTitle>
          <DialogDescription className="text-sm">
            {remainingSlots > 0
              ? `${remainingSlots} slot${remainingSlots === 1 ? "" : "s"} remaining`
              : "All slots filled"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full rounded-none border-b border-border bg-transparent h-auto p-0">
            <TabsTrigger
              value="friends"
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 gap-1.5"
            >
              <Users className="h-4 w-4" />
              Friends
              {filteredFriends.length > 0 && (
                <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                  {filteredFriends.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="search"
              className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 gap-1.5"
            >
              <Search className="h-4 w-4" />
              Search
            </TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="mt-0 px-4 pb-4">
            <div className="max-h-72 overflow-y-auto space-y-2 pt-3">
              {loadingFriends ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredFriends.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <Users className="h-10 w-10 mx-auto text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No friends yet</p>
                  <p className="text-xs text-muted-foreground/70">
                    People you've split bills with will appear here
                  </p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => setTab("search")}>
                    <Search className="h-3.5 w-3.5 mr-1.5" /> Search users
                  </Button>
                </div>
              ) : (
                filteredFriends.map(renderUserRow)
              )}
            </div>
          </TabsContent>

          <TabsContent value="search" className="mt-0 px-4 pb-4">
            <div className="relative pt-3">
              <Search className="absolute left-3 top-[calc(0.75rem+50%)] -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or username..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2 mt-3">
              {searching && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!searching && results.length === 0 && debouncedSearch.length >= 2 && (
                <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
              )}
              {!searching && debouncedSearch.length < 2 && (
                <p className="text-sm text-muted-foreground text-center py-8">Type at least 2 characters to search</p>
              )}
              {results.filter((r) => !allExcluded.has(r.id)).map(renderUserRow)}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
