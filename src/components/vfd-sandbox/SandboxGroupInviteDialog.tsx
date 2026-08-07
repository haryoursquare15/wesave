import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/hooks/use-toast";
import {
  Search, UserPlus, Link2, Copy, Check, Loader2, X,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
  onMemberAdded?: () => void;
}

export function SandboxGroupInviteDialog({ open, onOpenChange, groupId, groupName, onMemberAdded }: Props) {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitedUsers, setInvitedUsers] = useState<Set<string>>(new Set());
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Pre-load already-invited users so the badge shows up on first search
  useEffect(() => {
    if (!open || !groupId) return;
    products.listPendingGroupInvitees(groupId).then((res) => {
      const ids: string[] = res?.data?.invitee_ids || [];
      if (ids.length) setInvitedUsers(new Set(ids));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupId]);

  useEffect(() => {
    if (debouncedSearch && debouncedSearch.length >= 2) {
      setSearching(true);
      products.searchUsers(debouncedSearch).then((res) => {
        setResults(res?.data || []);
        setSearching(false);
      });
    } else {
      setResults([]);
    }
  }, [debouncedSearch]); // eslint-disable-line

  const handleInvite = async (userId: string) => {
    const res = await products.inviteGroupMember(groupId, userId);
    if (res?.data?.already_invited) {
      setInvitedUsers(prev => new Set([...prev, userId]));
      toast({ title: "Already invited", description: "This user already has a pending invite." });
    } else if (res?.data) {
      setInvitedUsers(prev => new Set([...prev, userId]));
      toast({ title: "Invite sent!" });
      onMemberAdded?.();
    }
  };

  const handleCreateLink = async () => {
    setCreatingLink(true);
    const res = await products.createGroupInviteLink(groupId);
    if (res?.data?.invite_token) {
      const baseUrl = window.location.origin;
      setInviteLink(`${baseUrl}/join/${res.data.invite_token}`);
    }
    setCreatingLink(false);
  };

  const handleCopy = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast({ title: "Link copied!" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "gold": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
      case "silver": return "bg-gray-400/10 text-gray-600 border-gray-400/30";
      case "bronze": return "bg-orange-500/10 text-orange-600 border-orange-500/30";
      default: return "bg-primary/10 text-primary border-primary/30";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Members to {groupName}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="search" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">
              <Search className="h-4 w-4 mr-2" /> Search Users
            </TabsTrigger>
            <TabsTrigger value="invite">
              <Link2 className="h-4 w-4 mr-2" /> Invite Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="mt-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by username or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
              {searchTerm && (
                <button
                  onClick={() => { setSearchTerm(""); setResults([]); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {searching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : results.length > 0 ? (
                results.map((user: any) => (
                  <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>
                          {(user.full_name || user.username || "U").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{user.full_name || user.username || "Unknown"}</p>
                        {user.username && <p className="text-xs text-muted-foreground">@{user.username}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={getTierColor(user.membership_tier)}>
                        {user.membership_tier || "newbie"}
                      </Badge>
                      {typeof user.credit_score === "number" && (
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary bg-primary/5">
                          {user.credit_score}
                        </Badge>
                      )}
                      {invitedUsers.has(user.id) ? (
                        <Badge variant="outline" className="text-[10px] gap-1 border-success/40 text-success bg-success/10">
                          <Check className="h-3 w-3" /> Invited
                        </Badge>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => handleInvite(user.id)} disabled={products.loading}>
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              ) : searchTerm.length >= 2 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No users found matching "{searchTerm}"</p>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Search for users by name or username</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="invite" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Create a shareable link that allows anyone to join your group. Links expire after 7 days.
            </p>

            {inviteLink ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input value={inviteLink} readOnly className="text-sm" />
                  <Button variant="outline" size="icon" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Button variant="outline" className="w-full" onClick={handleCreateLink} disabled={creatingLink}>
                  Generate New Link
                </Button>
              </div>
            ) : (
              <Button className="w-full" onClick={handleCreateLink} disabled={creatingLink}>
                {creatingLink ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                ) : (
                  <><Link2 className="h-4 w-4 mr-2" /> Create Invite Link</>
                )}
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
