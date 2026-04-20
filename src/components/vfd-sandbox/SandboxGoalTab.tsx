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

interface Campaign {
  id: string; title: string; description: string | null;
  goal_amount: number; raised_amount: number; contributor_count: number;
  deadline: string | null; status: string; creator_id: string;
  contribution_visibility?: string; campaign_slug?: string;
  beneficiary_account_name?: string; beneficiary_bank_name?: string;
  beneficiary_account_number?: string; campaign_image?: string;
}

const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

const nigerianBanks = [
  "Access Bank", "Citibank", "Ecobank", "Fidelity Bank", "First Bank",
  "FCMB", "GTBank", "Heritage Bank", "Keystone Bank", "Kuda Bank",
  "Moniepoint MFB", "OPay", "Palmpay", "Polaris Bank", "Providus Bank",
  "Stanbic IBTC", "Sterling Bank", "UBA", "Union Bank", "Unity Bank",
  "VFD MFB", "Wema Bank", "Zenith Bank",
];

export function SandboxGoalTab() {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const { client, user } = useSandboxAwareAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [form, setForm] = useState({
    title: "", description: "", goal_amount: "", deadline: "",
    beneficiary_account_name: "", beneficiary_bank_name: "",
    beneficiary_account_number: "", contribution_visibility: "public",
    campaign_image: "",
  });
  const [contributeId, setContributeId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeAnonymous, setContributeAnonymous] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

  const loadCampaigns = async () => {
    const result = await products.listCampaigns();
    if (result?.data) setCampaigns(result.data);
  };

  useEffect(() => { loadCampaigns(); }, []); // eslint-disable-line

  const generateSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").substring(0, 60);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await client.storage.from("sandbox-campaign-images").upload(path, file, { upsert: false });
      if (error) {
        toast({ title: "Upload failed", description: error.message, variant: "destructive" });
        return;
      }
      const { data } = client.storage.from("sandbox-campaign-images").getPublicUrl(path);
      setForm(p => ({ ...p, campaign_image: data.publicUrl }));
      toast({ title: "Image uploaded" });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    const goalAmount = parseFloat(form.goal_amount);
    if (isNaN(goalAmount) || goalAmount < 1000) { toast({ title: "Goal must be at least ₦1,000", variant: "destructive" }); return; }
    if (!form.beneficiary_bank_name || !form.beneficiary_account_number || !form.beneficiary_account_name) {
      toast({ title: "Beneficiary bank details required", variant: "destructive" }); return;
    }
    if (form.beneficiary_account_number.length !== 10) {
      toast({ title: "Account number must be 10 digits", variant: "destructive" }); return;
    }

    const slug = generateSlug(form.title) + "-" + Date.now().toString(36);
    const result = await products.createCampaign({
      title: form.title, description: form.description,
      goal_amount: goalAmount,
      deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      beneficiary_account_name: form.beneficiary_account_name,
      beneficiary_bank_name: form.beneficiary_bank_name,
      beneficiary_account_number: form.beneficiary_account_number,
      contribution_visibility: form.contribution_visibility,
      campaign_image: form.campaign_image || null,
      campaign_slug: slug,
    });
    if (result?.data) {
      toast({ title: "Campaign Created!" });
      setForm({ title: "", description: "", goal_amount: "", deadline: "", beneficiary_account_name: "", beneficiary_bank_name: "", beneficiary_account_number: "", contribution_visibility: "public", campaign_image: "" });
      setShowCreate(false);
      await loadCampaigns();
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
    const isOwner = true; // sandbox

    return (
      <div className="space-y-4">
        <button onClick={() => { setDetailId(null); setDetailData(null); }} className="text-sm text-primary flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to Campaigns
        </button>

        {/* Hero */}
        <div className="h-28 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
          <Target className="h-10 w-10 text-primary/30" />
        </div>

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
              Wesave provides a platform for coordinating contributions. Payments go directly to the campaign beneficiary. Wesave does not hold or manage contributed funds.
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
              {c.beneficiary_bank_name && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border text-xs space-y-1">
                  <p className="font-semibold">Beneficiary Details</p>
                  <p>{c.beneficiary_account_name}</p>
                  <p>{c.beneficiary_bank_name} — {c.beneficiary_account_number}</p>
                </div>
              )}
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

      {/* Legal notice */}
      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-primary mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Wesave facilitates contributions. Payments go directly to the campaign beneficiary. Wesave does not hold or manage contributed funds.
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

            {/* Beneficiary Bank Details */}
            <div className="border-t border-border pt-3">
              <h4 className="text-sm font-semibold mb-3">Beneficiary Bank Details *</h4>
              <div className="space-y-3">
                <div>
                  <Label>Account Name</Label>
                  <Input value={form.beneficiary_account_name} onChange={(e) => setForm(p => ({ ...p, beneficiary_account_name: e.target.value }))} placeholder="Account holder name" />
                </div>
                <div>
                  <Label>Bank</Label>
                  <Select value={form.beneficiary_bank_name} onValueChange={(v) => setForm(p => ({ ...p, beneficiary_bank_name: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                    <SelectContent>
                      {nigerianBanks.map(bank => <SelectItem key={bank} value={bank}>{bank}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Account Number</Label>
                  <Input value={form.beneficiary_account_number} onChange={(e) => setForm(p => ({ ...p, beneficiary_account_number: e.target.value.replace(/\D/g, "").slice(0, 10) }))} placeholder="0123456789" maxLength={10} />
                </div>
              </div>
            </div>

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
              <Card key={c.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => loadDetail(c.id)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{c.title}</p>
                      {c.description && <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>}
                    </div>
                    <Badge variant="outline" className={c.status === "active" ? "text-green-600 border-green-500" : "text-primary border-primary"}>
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
