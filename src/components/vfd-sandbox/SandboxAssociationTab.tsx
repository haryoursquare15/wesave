import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, Users, Plus, Wallet, ChevronRight, ArrowDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { format } from "date-fns";

interface Association {
  id: string;
  name: string;
  description: string | null;
  admin_id: string;
  status: string;
  member_count: number;
  max_members: number;
  created_at: string;
}

interface AssociationDetail extends Association {
  wallet_balance: number;
  members: Array<{ user_id: string; role: string; joined_at: string }>;
  contributions: Array<{ id: string; user_id: string; amount: number; narration: string | null; created_at: string }>;
}

export function SandboxAssociationTab() {
  const products = useVfdSandboxProducts();
  const [associations, setAssociations] = useState<Association[]>([]);
  const [myAssociations, setMyAssociations] = useState<Association[]>([]);
  const [selectedAssoc, setSelectedAssoc] = useState<AssociationDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showContribute, setShowContribute] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxMembers, setMaxMembers] = useState("50");

  // Contribute form
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeNarration, setContributeNarration] = useState("");

  const refresh = async () => {
    const result = await products.listAssociations();
    if (result) {
      setAssociations(result.all || []);
      setMyAssociations(result.mine || []);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const result = await products.createAssociation({
      name: name.trim(),
      description: description.trim() || null,
      max_members: parseInt(maxMembers) || 50,
    });
    if (result) {
      setShowCreate(false);
      setName(""); setDescription(""); setMaxMembers("50");
      refresh();
    }
  };

  const handleViewDetail = async (id: string) => {
    const result = await products.getAssociationDetail(id);
    if (result?.data) setSelectedAssoc(result.data);
  };

  const handleJoin = async (id: string) => {
    await products.joinAssociation(id);
    refresh();
  };

  const handleContribute = async () => {
    if (!selectedAssoc || !contributeAmount) return;
    const amount = parseFloat(contributeAmount);
    if (isNaN(amount) || amount <= 0) return;
    await products.contributeAssociation(selectedAssoc.id, amount, contributeNarration.trim() || undefined);
    setShowContribute(false);
    setContributeAmount(""); setContributeNarration("");
    handleViewDetail(selectedAssoc.id);
    refresh();
  };

  if (selectedAssoc) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedAssoc(null)} className="text-sm text-primary flex items-center gap-1">
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
              <Badge variant="outline">{selectedAssoc.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedAssoc.description && (
              <p className="text-sm text-muted-foreground">{selectedAssoc.description}</p>
            )}

            <div className="flex items-center justify-between p-3 rounded-xl bg-success/5 border border-success/20">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-success" />
                <span className="text-sm font-medium">Wallet Balance</span>
              </div>
              <span className="text-sm font-bold text-success">₦{Number(selectedAssoc.wallet_balance).toLocaleString()}</span>
            </div>

            <Button className="w-full" onClick={() => setShowContribute(true)}>
              <ArrowDownLeft className="h-4 w-4 mr-2" />
              Contribute to Association
            </Button>

            {/* Members */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Members ({selectedAssoc.members?.length || 0})</h4>
              <div className="space-y-1.5">
                {(selectedAssoc.members || []).map((m: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
                    <span className="font-medium truncate max-w-[180px]">{m.display_name || `User ${m.user_id?.slice(0, 6)}`}</span>
                    <Badge variant={m.role === "admin" ? "default" : "secondary"} className="text-[10px]">{m.role}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Contributions */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Recent Contributions</h4>
              {(selectedAssoc.contributions || []).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No contributions yet</p>
              ) : (
                <div className="space-y-1.5">
                  {(selectedAssoc.contributions || []).slice(0, 10).map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
                      <div>
                        <span className="font-medium">{c.display_name || `User ${c.user_id?.slice(0, 6)}`}</span>
                        {c.narration && <span className="text-muted-foreground ml-2">— {c.narration}</span>}
                      </div>
                      <span className="font-semibold text-success">+₦{Number(c.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Associations</h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Create
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-xl bg-primary/5 border border-primary/20"
      >
        <div className="flex items-start gap-2">
          <Building2 className="h-4 w-4 text-primary mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Pool resources with up to 50 members. Shared wallet with full audit trail.
          </p>
        </div>
      </motion.div>

      <Tabs defaultValue="explore">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="explore">Explore</TabsTrigger>
          <TabsTrigger value="mine">My Associations</TabsTrigger>
        </TabsList>

        <TabsContent value="explore" className="space-y-3 mt-3">
          {associations.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No associations yet. Create the first one!</p>
          ) : associations.map((a) => (
            <AssociationCard key={a.id} assoc={a} onView={() => handleViewDetail(a.id)} onJoin={() => handleJoin(a.id)} />
          ))}
        </TabsContent>

        <TabsContent value="mine" className="space-y-3 mt-3">
          {myAssociations.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">You haven't joined any associations yet</p>
          ) : myAssociations.map((a) => (
            <AssociationCard key={a.id} assoc={a} onView={() => handleViewDetail(a.id)} isMember />
          ))}
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
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
              <Input type="number" min="5" max="50" value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={products.loading || !name.trim()}>
              {products.loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssociationCard({ assoc, onView, onJoin, isMember }: {
  assoc: Association; onView: () => void; onJoin?: () => void; isMember?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-3"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{assoc.name}</p>
          <p className="text-[11px] text-muted-foreground">
            <Users className="h-3 w-3 inline mr-1" />{assoc.member_count}/{assoc.max_members} • {format(new Date(assoc.created_at), "MMM d")}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onView}>
          View <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
        {!isMember && onJoin && (
          <Button size="sm" className="flex-1" onClick={onJoin}>Join</Button>
        )}
      </div>
    </motion.div>
  );
}
