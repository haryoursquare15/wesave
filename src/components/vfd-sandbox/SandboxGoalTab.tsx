import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { Heart, Plus, RefreshCw } from "lucide-react";

interface Campaign {
  id: string; title: string; description: string | null;
  goal_amount: number; raised_amount: number; contributor_count: number;
  deadline: string | null; status: string; creator_id: string;
}

export function SandboxGoalTab() {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", goal_amount: "" });
  const [contributeId, setContributeId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");

  const loadCampaigns = async () => {
    const result = await products.listCampaigns();
    if (result?.data) setCampaigns(result.data);
  };

  useEffect(() => { loadCampaigns(); }, []); // eslint-disable-line

  const handleCreate = async () => {
    const result = await products.createCampaign({
      title: form.title, description: form.description,
      goal_amount: Number(form.goal_amount),
    });
    if (result?.data) {
      toast({ title: "Campaign Created!" });
      setForm({ title: "", description: "", goal_amount: "" });
      setShowCreate(false);
      await loadCampaigns();
    }
  };

  const handleContribute = async (campaignId: string) => {
    const amount = Number(contributeAmount);
    if (!amount || amount <= 0) return;
    const result = await products.contributeCampaign(campaignId, amount);
    if (result?.data) {
      toast({ title: "Contributed!", description: `₦${amount.toLocaleString()}` });
      setContributeId(null);
      setContributeAmount("");
      await loadCampaigns();
    }
  };

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

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Create Campaign</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g., Medical Fund" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" />
            </div>
            <div>
              <Label>Goal (₦)</Label>
              <Input type="number" value={form.goal_amount} onChange={(e) => setForm(p => ({ ...p, goal_amount: e.target.value }))} placeholder="500000" />
            </div>
            <Button onClick={handleCreate} disabled={products.loading || !form.title || !form.goal_amount} className="w-full">
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
              <Card key={c.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{c.title}</p>
                      {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                    </div>
                    <Badge variant="outline" className={c.status === "active" ? "text-green-600 border-green-500" : "text-primary border-primary"}>
                      {c.status}
                    </Badge>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>₦{Number(c.raised_amount).toLocaleString()} raised</span>
                      <span>₦{Number(c.goal_amount).toLocaleString()}</span>
                    </div>
                    <Progress value={Math.min(100, progress)} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{c.contributor_count} contributor(s)</p>
                  </div>
                  {c.status === "active" && (
                    contributeId === c.id ? (
                      <div className="flex gap-2">
                        <Input type="number" value={contributeAmount} onChange={(e) => setContributeAmount(e.target.value)} placeholder="Amount" className="flex-1" />
                        <Button size="sm" onClick={() => handleContribute(c.id)} disabled={products.loading}>Send</Button>
                        <Button size="sm" variant="outline" onClick={() => setContributeId(null)}>✕</Button>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => setContributeId(c.id)}>Contribute</Button>
                    )
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
