import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Building2, Users, Plus, Wallet, ChevronRight, ArrowDownLeft, UserPlus, MessageSquare, Send, FileUp, Loader2, ShieldCheck, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

import { getUserFriendlyError } from "@/lib/errorMessages";
interface Association {
  id: string;
  name: string;
  description: string | null;
  admin_id: string;
  status: string;
  approval_status: string;
  member_count: number;
  max_members: number;
  created_at: string;
  rejection_reason?: string | null;
}

interface Invite {
  id: string;
  association_id: string;
  inviter_id: string;
  vfd_sandbox_associations: { id: string; name: string; description: string | null; member_count: number; max_members: number; approval_status: string };
}

const fmt = (n: number) => `₦${Number(n || 0).toLocaleString()}`;

export function SandboxAssociationTab() {
  const products = useVfdSandboxProducts();
  const { client, session } = useSandboxAwareAuth();
  const { toast } = useToast();
  const userId = session?.user?.id;

  const [associations, setAssociations] = useState<Association[]>([]);
  const [myAssociations, setMyAssociations] = useState<Association[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [selectedAssoc, setSelectedAssoc] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showContribute, setShowContribute] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxMembers, setMaxMembers] = useState("50");
  const [signaturesPath, setSignaturesPath] = useState<string | null>(null);
  const [letterPath, setLetterPath] = useState<string | null>(null);
  const [execIdsPath, setExecIdsPath] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  // Contribute / Invite / Chat
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeNarration, setContributeNarration] = useState("");
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteResults, setInviteResults] = useState<Array<{ id: string; full_name?: string; username?: string }>>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Accept-invite dialog state
  const [pendingAccept, setPendingAccept] = useState<Invite | null>(null);
  const [acceptRole, setAcceptRole] = useState<"member" | "exco">("member");

  const refresh = async () => {
    const result = await products.listAssociations();
    if (result) {
      setAssociations(result.all || []);
      setMyAssociations(result.mine || []);
      setInvites(result.invites || []);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const uploadDoc = async (file: File, key: string) => {
    if (!userId) return null;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10MB", variant: "destructive" });
      return null;
    }
    setUploadingDoc(key);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${userId}/${Date.now()}-${key}.${ext}`;
      const { error } = await client.storage.from("sandbox-association-docs").upload(path, file, { upsert: false });
      if (error) {
        toast({ title: "Upload failed", description: getUserFriendlyError(error.message), variant: "destructive" });
        return null;
      }
      return path;
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (!signaturesPath || !letterPath || !execIdsPath) {
      toast({ title: "Documents required", description: "Upload all 3 documents to continue.", variant: "destructive" });
      return;
    }
    const result = await products.createAssociation({
      name: name.trim(),
      description: description.trim() || null,
      max_members: parseInt(maxMembers) || 50,
      signatures_url: signaturesPath,
      request_letter_url: letterPath,
      executive_ids_url: execIdsPath,
    });
    if (result?.data) {
      toast({ title: "Submitted for review", description: "Your association will be visible after platform approval." });
      setShowCreate(false);
      setName(""); setDescription(""); setMaxMembers("50");
      setSignaturesPath(null); setLetterPath(null); setExecIdsPath(null);
      refresh();
    }
  };

  const handleViewDetail = async (id: string) => {
    const result = await products.getAssociationDetail(id);
    if (result?.data) {
      setSelectedAssoc(result.data);
      if (result.data.is_member) loadChat(id);
    }
  };

  const loadChat = async (associationId: string) => {
    const result = await products.listAssocChat(associationId);
    if (result?.data) {
      setChatMessages(result.data);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  const handleSendChat = async () => {
    if (!selectedAssoc || !chatInput.trim()) return;
    setChatLoading(true);
    const result = await products.postAssocChat(selectedAssoc.id, chatInput.trim());
    setChatLoading(false);
    if (result?.data) {
      setChatInput("");
      loadChat(selectedAssoc.id);
    }
  };

  const handleContribute = async () => {
    if (!selectedAssoc || !contributeAmount) return;
    const amount = parseFloat(contributeAmount);
    if (isNaN(amount) || amount <= 0) return;
    const r = await products.contributeAssociation(selectedAssoc.id, amount, contributeNarration.trim() || undefined);
    if (r?.data) {
      toast({ title: "Contributed", description: fmt(amount) });
      setShowContribute(false);
      setContributeAmount(""); setContributeNarration("");
      handleViewDetail(selectedAssoc.id);
      refresh();
    }
  };

  const searchInvitees = async (q: string) => {
    setInviteSearch(q);
    if (q.length < 2) { setInviteResults([]); return; }
    const r = await products.searchUsers(q);
    if (r?.data) setInviteResults(r.data);
  };

  const handleInvite = async (inviteeId: string) => {
    if (!selectedAssoc) return;
    const r = await products.inviteAssocMember(selectedAssoc.id, inviteeId);
    if (r?.data) {
      toast({ title: "Invite sent" });
      setShowInvite(false);
      setInviteSearch(""); setInviteResults([]);
    }
  };

  const handleRespondInvite = async (accept: boolean) => {
    if (!pendingAccept) return;
    const r = await products.respondAssocInvite(pendingAccept.id, accept, acceptRole);
    if (r?.data) {
      toast({ title: accept ? `Joined as ${acceptRole}` : "Invite declined" });
      setPendingAccept(null);
      setAcceptRole("member");
      refresh();
    }
  };

  // ==== Detail view ====
  if (selectedAssoc) {
    const isAdmin = selectedAssoc.admin_id === userId;
    const isMember = !!selectedAssoc.is_member;
    const isApproved = selectedAssoc.approval_status === "approved";

    return (
      <div className="space-y-4">
        <button onClick={() => { setSelectedAssoc(null); setChatMessages([]); }} className="text-sm text-primary flex items-center gap-1">
          ← Back to Associations
        </button>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{selectedAssoc.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{selectedAssoc.member_count} members</p>
                </div>
              </div>
              <Badge variant={isApproved ? "default" : "secondary"}>
                {isApproved ? "Approved" : selectedAssoc.approval_status === "pending" ? "Awaiting Review" : "Rejected"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedAssoc.description && <p className="text-sm text-muted-foreground">{selectedAssoc.description}</p>}

            {!isApproved && selectedAssoc.approval_status === "rejected" && selectedAssoc.rejection_reason && (
              <div className="text-xs p-2 rounded bg-destructive/10 text-destructive">
                Reason: {selectedAssoc.rejection_reason}
              </div>
            )}

            {/* Wallet visible to all members */}
            {isMember && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-success/5 border border-success/20">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium">Wallet Balance</span>
                </div>
                <span className="text-sm font-bold text-success">{fmt(selectedAssoc.wallet_balance)}</span>
              </div>
            )}

            {/* Smart summary */}
            {isMember && selectedAssoc.summary && (
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <p className="text-[10px] text-muted-foreground">Total Inflow</p>
                  <p className="text-xs font-bold">{fmt(selectedAssoc.summary.total_inflow)}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <p className="text-[10px] text-muted-foreground">Last 30 days</p>
                  <p className="text-xs font-bold">{fmt(selectedAssoc.summary.inflow_last_30_days)}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <p className="text-[10px] text-muted-foreground">Outflow</p>
                  <p className="text-xs font-bold">{fmt(selectedAssoc.summary.total_outflow)}</p>
                </div>
              </div>
            )}

            {isMember && isApproved && (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setShowContribute(true)} size="sm">
                  <ArrowDownLeft className="h-4 w-4 mr-1" /> Contribute
                </Button>
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => setShowInvite(true)}>
                    <UserPlus className="h-4 w-4 mr-1" /> Invite Member
                  </Button>
                )}
              </div>
            )}

            {/* Members + Chat tabs */}
            {isMember && (
              <Tabs defaultValue="members">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="members">Members</TabsTrigger>
                  <TabsTrigger value="chat"><MessageSquare className="h-3 w-3 mr-1" />Chat</TabsTrigger>
                  <TabsTrigger value="ledger">Ledger</TabsTrigger>
                </TabsList>

                <TabsContent value="members" className="space-y-1.5 mt-3">
                  {(selectedAssoc.members || []).map((m: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
                      <span className="font-medium truncate max-w-[180px]">{m.display_name}</span>
                      <Badge variant={m.role === "admin" ? "default" : m.role === "exco" ? "outline" : "secondary"} className="text-[10px]">{m.role}</Badge>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="chat" className="mt-3">
                  <div className="border border-border rounded-lg flex flex-col h-72">
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {chatMessages.length === 0 ? (
                        <p className="text-center text-xs text-muted-foreground py-8">No messages yet. Say hello!</p>
                      ) : chatMessages.map((m: any) => (
                        <div key={m.id} className={`flex ${m.user_id === userId ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[75%] p-2 rounded-lg ${m.user_id === userId ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            {m.user_id !== userId && <p className="text-[10px] font-semibold mb-0.5 opacity-70">{m.display_name}</p>}
                            <p className="text-xs">{m.message}</p>
                            <p className="text-[9px] opacity-60 mt-0.5">{format(new Date(m.created_at), "HH:mm")}</p>
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                    <div className="border-t border-border p-2 flex gap-2">
                      <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSendChat()} placeholder="Type a message..." className="text-xs h-8" />
                      <Button size="sm" onClick={handleSendChat} disabled={chatLoading || !chatInput.trim()}>
                        <Send className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="ledger" className="mt-3">
                  {(selectedAssoc.contributions || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No contributions yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(selectedAssoc.contributions || []).slice(0, 20).map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
                          <div>
                            <span className="font-medium">{c.display_name}</span>
                            {c.narration && <span className="text-muted-foreground ml-2">— {c.narration}</span>}
                          </div>
                          <span className="font-semibold text-success">+{fmt(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* Contribute Dialog */}
        <Dialog open={showContribute} onOpenChange={setShowContribute}>
          <DialogContent>
            <DialogHeader><DialogTitle>Contribute to {selectedAssoc.name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Amount (₦)</Label>
                <Input type="number" placeholder="5000" value={contributeAmount} onChange={(e) => setContributeAmount(e.target.value)} />
              </div>
              <div>
                <Label>Narration (optional)</Label>
                <Input placeholder="Monthly dues" value={contributeNarration} onChange={(e) => setContributeNarration(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleContribute} disabled={products.loading}>
                {products.loading ? "Processing..." : "Contribute"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Invite Dialog */}
        <Dialog open={showInvite} onOpenChange={setShowInvite}>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite a Member</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Search by name, username, or email" value={inviteSearch} onChange={(e) => searchInvitees(e.target.value)} />
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {inviteResults.map((u) => (
                  <div key={u.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-xs font-medium">{u.full_name || u.username || u.id.slice(0, 8)}</p>
                      {u.username && <p className="text-[10px] text-muted-foreground">@{u.username}</p>}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleInvite(u.id)}>Invite</Button>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ==== List view ====
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Associations</h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Create
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-xl bg-primary/5 border border-primary/20"
      >
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 text-primary mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Associations are <strong>invite-only</strong>. Admins must upload required documents and pass platform review before inviting members.
          </p>
        </div>
      </motion.div>

      {/* Pending invites for me */}
      {invites.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Pending Invites ({invites.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-2 rounded-lg bg-card border border-border">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{inv.vfd_sandbox_associations?.name}</p>
                  <p className="text-[11px] text-muted-foreground">{inv.vfd_sandbox_associations?.member_count}/{inv.vfd_sandbox_associations?.max_members} members</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setPendingAccept(inv); setAcceptRole("member"); }}>Respond</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="mine">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="mine">My Associations</TabsTrigger>
          <TabsTrigger value="explore">Explore</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="space-y-3 mt-3">
          {myAssociations.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">You haven't joined any associations yet</p>
          ) : myAssociations.map((a) => (
            <AssociationCard key={a.id} assoc={a} onView={() => handleViewDetail(a.id)} isMember />
          ))}
        </TabsContent>

        <TabsContent value="explore" className="space-y-3 mt-3">
          {associations.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No approved associations yet.</p>
          ) : associations.map((a) => (
            <AssociationCard key={a.id} assoc={a} onView={() => handleViewDetail(a.id)} />
          ))}
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Association</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input placeholder="e.g. Staff Cooperative" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea placeholder="What is this association about?" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>Max Members</Label>
              <Input type="number" min="5" max="200" value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} />
            </div>

            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold">Required Documents</p>
              <DocUploadRow
                label="List of members + signatures"
                hint=".doc/.docx/.pdf/.png"
                done={!!signaturesPath}
                uploading={uploadingDoc === "signatures"}
                onChange={async (f) => { const p = await uploadDoc(f, "signatures"); if (p) setSignaturesPath(p); }}
              />
              <DocUploadRow
                label="Letter of request (on letterhead)"
                hint=".pdf preferred"
                done={!!letterPath}
                uploading={uploadingDoc === "letter"}
                onChange={async (f) => { const p = await uploadDoc(f, "letter"); if (p) setLetterPath(p); }}
              />
              <DocUploadRow
                label="Valid IDs of executives"
                hint=".pdf or images"
                done={!!execIdsPath}
                uploading={uploadingDoc === "execids"}
                onChange={async (f) => { const p = await uploadDoc(f, "execids"); if (p) setExecIdsPath(p); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={products.loading || !name.trim() || !signaturesPath || !letterPath || !execIdsPath}>
              {products.loading ? "Submitting..." : "Submit for Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Respond to invite dialog */}
      <Dialog open={!!pendingAccept} onOpenChange={(o) => !o && setPendingAccept(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Join {pendingAccept?.vfd_sandbox_associations?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Choose how you'd like to participate.</p>
            <div>
              <Label>Role</Label>
              <Select value={acceptRole} onValueChange={(v) => setAcceptRole(v as "member" | "exco")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="exco">Executive (Exco)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleRespondInvite(false)}>
              <XCircle className="h-4 w-4 mr-1" /> Decline
            </Button>
            <Button onClick={() => handleRespondInvite(true)}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocUploadRow({ label, hint, done, uploading, onChange }: {
  label: string; hint: string; done: boolean; uploading: boolean;
  onChange: (file: File) => void;
}) {
  return (
    <label className="flex items-center justify-between p-2 rounded-lg border border-dashed border-border cursor-pointer hover:bg-muted/30">
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{label}</p>
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <FileUp className="h-4 w-4 text-muted-foreground" />}
        <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]; if (f) onChange(f);
        }} />
      </div>
    </label>
  );
}

function AssociationCard({ assoc, onView, isMember }: {
  assoc: Association; onView: () => void; isMember?: boolean;
}) {
  const isPending = assoc.approval_status === "pending";
  const isRejected = assoc.approval_status === "rejected";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-3"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{assoc.name}</p>
            {isPending && <Badge variant="secondary" className="text-[9px]">Pending</Badge>}
            {isRejected && <Badge variant="destructive" className="text-[9px]">Rejected</Badge>}
          </div>
          <p className="text-[11px] text-muted-foreground">
            <Users className="h-3 w-3 inline mr-1" />{assoc.member_count}/{assoc.max_members} • {format(new Date(assoc.created_at), "MMM d")}
          </p>
        </div>
      </div>
      <Button size="sm" variant="outline" className="w-full" onClick={onView}>
        View <ChevronRight className="h-3 w-3 ml-1" />
      </Button>
    </motion.div>
  );
}
