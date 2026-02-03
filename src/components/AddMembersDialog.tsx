import { useState, useEffect } from "react";
import { Search, UserPlus, Copy, Check, Link2, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useSearchUsers, useSendMemberInvite, useCreateInviteLink } from "@/hooks/useGroupInvites";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";

interface AddMembersDialogProps {
  groupId: string;
  groupName: string;
  children: React.ReactNode;
  onMemberAdded?: () => void;
}

export function AddMembersDialog({ groupId, groupName, children, onMemberAdded }: AddMembersDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [addedUsers, setAddedUsers] = useState<Set<string>>(new Set());

  const debouncedSearch = useDebounce(searchTerm, 300);
  const { searchUsers, results, loading: searching, clearResults } = useSearchUsers();
  const { sendInvite, loading: sending } = useSendMemberInvite();
  const { createInviteLink, loading: creatingLink } = useCreateInviteLink();

  useEffect(() => {
    if (debouncedSearch) {
      searchUsers(debouncedSearch);
    } else {
      clearResults();
    }
  }, [debouncedSearch, searchUsers, clearResults]);

  const handleSendInvite = async (userId: string) => {
    try {
      await sendInvite(groupId, userId);
      setAddedUsers(prev => new Set([...prev, userId]));
      toast.success("Invite sent! Waiting for user to accept.");
      onMemberAdded?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to send invite");
    }
  };

  const handleCreateLink = async () => {
    try {
      const link = await createInviteLink(groupId);
      setInviteLink(link);
    } catch (err: any) {
      toast.error(err.message || "Failed to create invite link");
    }
  };

  const handleCopyLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "gold":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
      case "silver":
        return "bg-gray-400/10 text-gray-600 border-gray-400/30";
      case "bronze":
        return "bg-orange-500/10 text-orange-600 border-orange-500/30";
      default:
        return "bg-primary/10 text-primary border-primary/30";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Members to {groupName}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="search" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">
              <Search className="h-4 w-4 mr-2" />
              Search Users
            </TabsTrigger>
            <TabsTrigger value="invite">
              <Link2 className="h-4 w-4 mr-2" />
              Invite Link
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
                  onClick={() => {
                    setSearchTerm("");
                    clearResults();
                  }}
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
                results.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>
                          {(user.full_name || user.username || "U").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">
                          {user.full_name || user.username || "Unknown"}
                        </p>
                        {user.username && (
                          <p className="text-xs text-muted-foreground">@{user.username}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={getTierColor(user.membership_tier)}>
                        {user.membership_tier}
                      </Badge>
                      {addedUsers.has(user.id) ? (
                        <Button size="sm" disabled variant="ghost">
                          <Check className="h-4 w-4 text-success" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSendInvite(user.id)}
                          disabled={sending}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              ) : searchTerm.length >= 2 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No users found matching "{searchTerm}"</p>
                </div>
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
              Create a shareable link that allows anyone to join your group. They'll need to
              complete onboarding first if they don't have an account.
            </p>

            {inviteLink ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={inviteLink}
                    readOnly
                    className="text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyLink}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleCreateLink}
                  disabled={creatingLink}
                >
                  Generate New Link
                </Button>
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={handleCreateLink}
                disabled={creatingLink}
              >
                {creatingLink ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 mr-2" />
                    Create Invite Link
                  </>
                )}
              </Button>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Links expire after 7 days
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
