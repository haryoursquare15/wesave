import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/hooks/use-toast";
import { Search, UserPlus, Check, Loader2, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetId: string;
  targetName: string;
  onMemberAdded?: () => void;
}

export function SandboxTargetInviteDialog({ open, onOpenChange, targetId, targetName, onMemberAdded }: Props) {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitedUsers, setInvitedUsers] = useState<Set<string>>(new Set());

  const debouncedSearch = useDebounce(searchTerm, 300);

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
    const res = await products.inviteTargetMember(targetId, userId);
    if (res?.data?.already_invited) {
      setInvitedUsers((prev) => new Set([...prev, userId]));
      toast({ title: "Already invited", description: "This user already has a pending invite." });
    } else if (res?.data) {
      setInvitedUsers((prev) => new Set([...prev, userId]));
      toast({ title: "Invite sent!" });
      onMemberAdded?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Members to {targetName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="max-h-72 overflow-y-auto space-y-2">
            {searching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : results.length > 0 ? (
              results.map((user: any) => (
                <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback>
                        {(user.full_name || user.username || "U").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{user.full_name || user.username || "Unknown"}</p>
                      {user.username && <p className="text-xs text-muted-foreground truncate">@{user.username}</p>}
                    </div>
                  </div>
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

          <p className="text-xs text-muted-foreground">
            Target Ajo is invite-only. Invitees will receive a notification and can accept from their pending invites.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
