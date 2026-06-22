import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Target, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { nigerianBanks } from "@/lib/nigerianBanks";

import { getUserFriendlyError } from "@/lib/errorMessages";
export default function CreateGoalCampaign() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    campaign_title: "",
    description: "",
    goal_amount: "",
    campaign_deadline: "",
    beneficiary_account_name: "",
    beneficiary_bank_name: "",
    beneficiary_account_number: "",
    contribution_visibility: "public",
  });

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const generateSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").substring(0, 60);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!form.campaign_title.trim()) {
      toast.error("Campaign title is required");
      return;
    }
    const goalAmount = parseFloat(form.goal_amount);
    if (isNaN(goalAmount) || goalAmount < 1000) {
      toast.error("Goal amount must be at least ₦1,000");
      return;
    }
    if (!form.beneficiary_bank_name || !form.beneficiary_account_number || !form.beneficiary_account_name) {
      toast.error("Beneficiary bank details are required");
      return;
    }
    if (form.beneficiary_account_number.length !== 10) {
      toast.error("Account number must be 10 digits");
      return;
    }

    setSubmitting(true);
    try {
      const slug = generateSlug(form.campaign_title) + "-" + Date.now().toString(36);

      const { error } = await (supabase as any).from("goal_campaigns").insert({
        campaign_title: form.campaign_title.trim(),
        description: form.description.trim() || null,
        goal_amount: goalAmount,
        campaign_owner_user_id: user.id,
        beneficiary_account_name: form.beneficiary_account_name.trim(),
        beneficiary_bank_name: form.beneficiary_bank_name,
        beneficiary_account_number: form.beneficiary_account_number.trim(),
        campaign_deadline: form.campaign_deadline ? new Date(form.campaign_deadline).toISOString() : null,
        campaign_slug: slug,
        contribution_visibility: form.contribution_visibility,
      });

      if (error) throw error;
      toast.success("Campaign created!");
      navigate("/goal-funding");
    } catch (err: any) {
      toast.error(getUserFriendlyError(err.message || "Failed to create campaign"));
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-32 safe-bottom">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Create Campaign</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        {/* Notice */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/20 mb-6"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-primary mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Vestara facilitates contributions. Payments go directly to the campaign beneficiary. Vestara does not hold or manage contributed funds.
            </p>
          </div>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label>Campaign Title *</Label>
            <Input
              placeholder="e.g. Help Aisha's Surgery Fund"
              value={form.campaign_title}
              onChange={(e) => update("campaign_title", e.target.value)}
              maxLength={100}
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              placeholder="Describe your campaign and why you need support..."
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={4}
              maxLength={2000}
            />
          </div>

          <div>
            <Label>Goal Amount (₦) *</Label>
            <Input
              type="number"
              placeholder="e.g. 500000"
              value={form.goal_amount}
              onChange={(e) => update("goal_amount", e.target.value)}
              min={1000}
            />
          </div>

          <div>
            <Label>Campaign Deadline</Label>
            <Input
              type="date"
              value={form.campaign_deadline}
              onChange={(e) => update("campaign_deadline", e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>

          <div>
            <Label>Contribution Visibility</Label>
            <Select
              value={form.contribution_visibility}
              onValueChange={(v) => update("contribution_visibility", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public (show names & amounts)</SelectItem>
                <SelectItem value="anonymous">Anonymous contributors allowed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Beneficiary Bank Details *
            </h3>
            <div className="space-y-3">
              <div>
                <Label>Account Name</Label>
                <Input
                  placeholder="Account holder name"
                  value={form.beneficiary_account_name}
                  onChange={(e) => update("beneficiary_account_name", e.target.value)}
                />
              </div>
              <div>
                <Label>Bank</Label>
                <Select
                  value={form.beneficiary_bank_name}
                  onValueChange={(v) => update("beneficiary_bank_name", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {nigerianBanks.map((bank) => (
                      <SelectItem key={bank} value={bank}>
                        {bank}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Account Number</Label>
                <Input
                  placeholder="0123456789"
                  value={form.beneficiary_account_number}
                  onChange={(e) => update("beneficiary_account_number", e.target.value.replace(/\D/g, "").slice(0, 10))}
                  maxLength={10}
                />
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating..." : "Create Campaign"}
          </Button>
        </form>
      </main>

      <BottomNav />
    </div>
  );
}
