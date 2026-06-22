import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import {
  Heart, Plus, RefreshCw, ArrowLeft, Target, Users, Clock,
  AlertTriangle, Share2, ImagePlus, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { SocialShareButtons } from "./SocialShareButtons";

import { getUserFriendlyError } from "@/lib/errorMessages";
interface Campaign {
  id: string; title: string; description: string | null;
  goal_amount: number; raised_amount: number; contributor_count: number;
  deadline: string | null; status: string; creator_id: string;
  contribution_visibility?: string; campaign_slug?: string;
  beneficiary_account_name?: string; beneficiary_bank_name?: string;
  beneficiary_account_number?: string; campaign_image?: string;
  escrow_balance?: number; total_withdrawn?: number;
}

const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

// (beneficiary bank list removed — funds credit to creator's wallet)

export function SandboxGoalTab() {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const { client, session } = useSandboxAwareAuth();
  const userId = session?.user?.id;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [form, setForm] = useState({
    title: "", description: "", goal_amount: "", deadline: "",
    contribution_visibility: "public",
    campaign_image: "",
  });
  const [contributeId, setContributeId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeAnonymous, setContributeAnonymous] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const loadCampaigns = async () => {
    const result = await products.listCampaigns();
    if (result?.data) setCampaigns(result.data);
  };

  useEffect(() => { loadCampaigns(); }, []); // eslint-disable-line

  const generateSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").substring(0, 60);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so re-selecting the same file still triggers onChange
    e.target.value = "";
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please choose an image", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    setUploadingImage(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error } = await client.storage
        .from("sandbox-campaign-images")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) {
        toast({ title: "Upload failed", description: getUserFriendlyError(error.message), variant: "destructive" });
        return;
      }
      const { data } = client.storage.from("sandbox-campaign-images").getPublicUrl(path);
      setForm(p => ({ ...p, campaign_image: data.publicUrl }));
      toast({ title: "Image uploaded" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Upload failed", description: getUserFriendlyError(msg), variant: "destructive" });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    const goalAmount = parseFloat(form.goal_amount);
    if (isNaN(goalAmount) || goalAmount < 1000) {
      toast({ title: "Goal must be at least ₦1,000", variant: "destructive" });
      return;
    }

    try {
      const slug = generateSlug(form.title) + "-" + Date.now().toString(36);
      const result = await products.createCampaign({
        title: form.title,
        description: form.description,
        goal_amount: goalAmount,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
        contribution_visibility: form.contribution_visibility,
        campaign_image: form.campaign_image || null,
        campaign_slug: slug,
      });
      if (result?.data) {
        toast({ title: "Campaign Created!" });
        setForm({ title: "", description: "", goal_amount: "", deadline: "", contribution_visibility: "public", campaign_image: "" });
        setShowCreate(false);
        await loadCampaigns();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not create campaign";
      toast({ title: "Create failed", description: getUserFriendlyError(msg), variant: "destructive" });
    }
  };

  const handleContribute = async (campaignId: string) => {
    const amount = Number(contributeAmount);
    if (!amount || amount <= 0) return;
    const result = await products.contributeCampaign(campaignId, amount, contributeAnonymous);
    if (result?.data) {
      toast({ title: "Contributed!", description: `₦${fmt(amount)}` });
      setContributeId(null); setContributeAmount(""); setContributeAnonymous(false);
      if (detailId) loadDetail(detailId); else loadCampaigns();
    }
  };

  const loadDetail = async (id: string) => {
    const result = await products.getCampaignDetail(id);
    if (result?.data) { setDetailData(result.data); setDetailId(id); }
  };

  // Detail view
  if (detailId && detailData) {
    const c = detailData.campaign || detailData;
    const contributions = detailData.contributions || [];
    const updates = detailData.updates || [];
    const progress = Number(c.goal_amount) > 0 ? (Number(c.raised_amount) / Number(c.goal_amount)) * 100 : 0;
    const isOwner = !!userId && c.creator_id === userId;
    const escrow = Number(c.escrow_balance || 0);
    const withdrawn = Number(c.total_withdrawn || 0);

    const handleWithdraw = async () => {
      const amt = withdrawAmount.trim() ? Number(withdrawAmount) : undefined;
      if (amt !== undefined && (isNaN(amt) || amt <= 0)) {
        toast({ title: "Invalid amount", variant: "destructive" }); return;
      }
      if (amt !== undefined && amt > escrow) {
        toast({ title: "Amount exceeds escrow balance", variant: "destructive" }); return;
      }
      const res = await products.withdrawCampaignEscrow(c.id, amt);
      if (res?.data) {
        toast({ title: "Funds moved to wallet", description: `₦${fmt(Number(res.data.withdrawn))}` });
        setWithdrawAmount("");
        loadDetail(c.id);
      }
    };

    return (
      <div className="space-y-4">
        <button onClick={() => { setDetailId(null); setDetailData(null); }} className="text-sm text-primary flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to Campaigns
        </button>

        {/* Hero — image or placeholder */}
        {c.campaign_image ? (
          <div className="h-44 rounded-xl overflow-hidden bg-muted">
            <img src={c.campaign_image} alt={c.title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="h-28 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
            <Target className="h-10 w-10 text-primary/30" />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
          {isOwner && <Badge variant="outline">Your Campaign</Badge>}
        </div>

        <h2 className="text-xl font-bold">{c.title}</h2>
        {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}

        {/* Progress */}
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-bold text-primary">{progress.toFixed(0)}%</span>
          </div>
          <Progress value={Math.min(progress, 100)} className="h-3 mb-3" />
          <div className="flex justify-between">
            <div><p className="text-xs text-muted-foreground">Raised</p><p className="text-lg font-bold">₦{fmt(Number(c.raised_amount))}</p></div>
            <div className="text-right"><p className="text-xs text-muted-foreground">Goal</p><p className="text-lg font-bold">₦{fmt(Number(c.goal_amount))}</p></div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {c.contributor_count} contributors</span>
          {c.deadline && <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {format(new Date(c.deadline), "MMM d, yyyy")}</span>}
        </div>

        {/* Share */}
        <div className="p-3 rounded-xl bg-card border border-border space-y-2">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Share this campaign</p>
          </div>
          <SocialShareButtons
            url={`${window.location.origin}/goal/${c.campaign_slug || c.id}`}
            title={c.title}
            message={`Help support "${c.title}" on Vestara`}
          />
        </div>

        {/* Contribute */}
        {c.status === "active" && (
          contributeId === c.id ? (
            <div className="space-y-2">
              <Input type="number" value={contributeAmount} onChange={(e) => setContributeAmount(e.target.value)} placeholder="Amount (₦)" />
              <div className="flex items-center gap-2">
                <Switch checked={contributeAnonymous} onCheckedChange={setContributeAnonymous} />
                <span className="text-xs text-muted-foreground">Anonymous contribution</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleContribute(c.id)} disabled={products.loading} className="flex-1">Contribute</Button>
                <Button size="sm" variant="outline" onClick={() => setContributeId(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button className="w-full" onClick={() => setContributeId(c.id)}>
              <Heart className="h-4 w-4 mr-2" /> Contribute Now
            </Button>
          )
        )}

        {/* Legal disclaimer */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Contributions are held in campaign escrow and can be withdrawn by the campaign owner to their wallet. Vestara coordinates the escrow but does not own or control the funds.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="activity">
          <TabsList className={`grid w-full ${isOwner ? "grid-cols-3" : "grid-cols-2"}`}>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            {isOwner && <TabsTrigger value="manage">Manage</TabsTrigger>}
          </TabsList>
          <TabsContent value="activity" className="space-y-2 mt-3">
            {[...contributions.map((c: any) => ({ ...c, type: "contribution" })), ...updates.map((u: any) => ({ ...u, type: "update" }))]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((item: any, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-card border border-border">
                  {item.type === "contribution" ? (
                    <div className="flex justify-between">
                      <div>
                        <p className="text-sm font-medium">{item.anonymous ? "Anonymous" : (item.contributor_name || item.user_id?.slice(0, 8) + "...")}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(item.created_at), "MMM d, h:mm a")}</p>
                      </div>
                      <p className="text-sm font-bold text-primary">₦{fmt(Number(item.amount))}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-muted-foreground">{format(new Date(item.created_at), "MMM d, h:mm a")} • Campaign Update</p>
                      <p className="text-sm mt-1">{item.update_message || item.message}</p>
                    </div>
                  )}
                </div>
              ))}
          </TabsContent>
          <TabsContent value="ledger" className="space-y-2 mt-3">
            {contributions.length === 0 ? (
              <p className="text-center py-4 text-sm text-muted-foreground">No contributions yet</p>
            ) : contributions.map((c: any) => (
              <div key={c.id} className="p-3 rounded-lg bg-card border border-border flex justify-between">
                <div>
                  <p className="text-sm font-medium">{c.anonymous ? "Anonymous" : (c.contributor_name || c.user_id?.slice(0, 8) + "...")}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(c.created_at), "MMM d, yyyy")}</p>
                </div>
                <p className="text-sm font-bold">₦{fmt(Number(c.amount))}</p>
              </div>
            ))}
          </TabsContent>
          {isOwner && (
            <TabsContent value="manage" className="space-y-3 mt-3">
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                <p className="text-xs text-muted-foreground mb-1">Escrow balance (available to withdraw)</p>
                <p className="text-2xl font-bold text-primary">₦{fmt(escrow)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Total withdrawn so far: ₦{fmt(withdrawn)}</p>

                <div className="mt-3 space-y-2">
                  <Input
                    type="number"
                    placeholder={`Amount (leave empty to withdraw full ₦${fmt(escrow)})`}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    disabled={escrow <= 0}
                  />
                  <Button className="w-full" size="sm" onClick={handleWithdraw} disabled={products.loading || escrow <= 0}>
                    Withdraw to my wallet
                  </Button>
                </div>
              </div>

              <div>
                <Label>Post an Update</Label>
                <Textarea value={updateMessage} onChange={(e) => setUpdateMessage(e.target.value)} placeholder="Share progress with supporters..." rows={3} />
                <Button className="mt-2 w-full" size="sm" onClick={async () => {
                  if (!updateMessage.trim()) return;
                  await products.postCampaignUpdate(c.id, updateMessage.trim());
                  toast({ title: "Update posted!" });
                  setUpdateMessage("");
                  loadDetail(c.id);
                }} disabled={products.loading || !updateMessage.trim()}>
                  Post Update
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground p-2 rounded bg-muted/30">
                Contributions are held in this campaign's escrow until you withdraw them to your wallet. Vestara does not access or hold escrow funds for any other purpose.
              </p>
            </TabsContent>
          )}
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Heart className="h-4 w-4 text-primary" /> Goal Funding
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadCampaigns}><RefreshCw className="h-3 w-3" /></Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="h-3 w-3 mr-1" /> New Campaign</Button>
        </div>
      </div>

      {/* Escrow notice */}
      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-primary mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Contributions are held in each campaign's escrow until the owner withdraws them to their wallet. Vestara coordinates the escrow but does not own or use the funds.
          </p>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Create Campaign</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Campaign Title *</Label>
              <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g., Help Aisha's Surgery Fund" maxLength={100} />
            </div>

            {/* Image upload */}
            <div>
              <Label>Campaign Image (optional)</Label>
              {form.campaign_image ? (
                <div className="relative rounded-lg overflow-hidden border border-border h-40 mt-1">
                  <img src={form.campaign_image} alt="preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, campaign_image: "" }))}
                    className="absolute top-2 right-2 bg-background/80 backdrop-blur text-xs px-2 py-1 rounded-md border border-border"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <label className="mt-1 flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-primary/40 transition">
                  {uploadingImage ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <ImagePlus className="h-6 w-6 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">Tap to upload (max 5MB)</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                </label>
              )}
            </div>

            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe your campaign..." rows={3} maxLength={2000} />
            </div>
            <div>
              <Label>Goal Amount (₦) *</Label>
              <Input type="number" value={form.goal_amount} onChange={(e) => setForm(p => ({ ...p, goal_amount: e.target.value }))} placeholder="500000" min={1000} />
            </div>
            <div>
              <Label>Campaign Deadline</Label>
              <Input type="date" value={form.deadline} onChange={(e) => setForm(p => ({ ...p, deadline: e.target.value }))} min={new Date().toISOString().split("T")[0]} />
            </div>
            <div>
              <Label>Contribution Visibility</Label>
              <Select value={form.contribution_visibility} onValueChange={(v) => setForm(p => ({ ...p, contribution_visibility: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public (show names & amounts)</SelectItem>
                  <SelectItem value="anonymous">Anonymous contributors allowed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Note: contributors pay into the platform collection account.
                Funds are credited to the campaign creator's wallet on success
                and can be withdrawn from there. No beneficiary bank account
                is collected here. */}

            <Button onClick={handleCreate} disabled={products.loading || !form.title || !form.goal_amount} className="w-full">
              {products.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Campaign
            </Button>
          </CardContent>
        </Card>
      )}

      {campaigns.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No campaigns yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const progress = Number(c.goal_amount) > 0 ? (Number(c.raised_amount) / Number(c.goal_amount)) * 100 : 0;
            return (
              <Card key={c.id} className="cursor-pointer hover:border-primary/30 transition-colors overflow-hidden" onClick={() => loadDetail(c.id)}>
                {c.campaign_image && (
                  <div className="h-32 bg-muted overflow-hidden">
                    <img src={c.campaign_image} alt={c.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{c.title}</p>
                      {c.description && <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>}
                    </div>
                    <Badge variant="outline" className={c.status === "active" ? "text-success border-success" : "text-primary border-primary"}>
                      {c.status}
                    </Badge>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>₦{fmt(Number(c.raised_amount))} raised</span>
                      <span>₦{fmt(Number(c.goal_amount))}</span>
                    </div>
                    <Progress value={Math.min(100, progress)} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{c.contributor_count} contributor(s)</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
