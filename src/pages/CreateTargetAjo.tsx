import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Target } from "lucide-react";
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

export default function CreateTargetAjo() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    target_amount: "",
    contribution_amount: "",
    frequency: "monthly",
    target_date: "",
    reason: "",
    beneficiary_account_name: "",
    beneficiary_bank_name: "",
    beneficiary_account_number: "",
    max_members: "20",
  });

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const targetAmount = parseFloat(form.target_amount);
    if (isNaN(targetAmount) || targetAmount < 1000) { toast.error("Target must be at least ₦1,000"); return; }
    const contribAmount = parseFloat(form.contribution_amount);
    if (isNaN(contribAmount) || contribAmount < 100) { toast.error("Contribution must be at least ₦100"); return; }
    if (!form.beneficiary_bank_name || !form.beneficiary_account_number || !form.beneficiary_account_name) {
      toast.error("Beneficiary bank details required"); return;
    }
    if (form.beneficiary_account_number.length !== 10) { toast.error("Account number must be 10 digits"); return; }

    setSubmitting(true);
    try {
      const { data: group, error } = await (supabase as any).from("target_ajo_groups").insert({
        name: form.name.trim(),
        description: form.description.trim() || null,
        target_amount: targetAmount,
        contribution_amount: contribAmount,
        frequency: form.frequency,
        target_date: form.target_date ? new Date(form.target_date).toISOString() : null,
        reason: form.reason.trim() || null,
        beneficiary_account_name: form.beneficiary_account_name.trim(),
        beneficiary_bank_name: form.beneficiary_bank_name,
        beneficiary_account_number: form.beneficiary_account_number.trim(),
        admin_user_id: user.id,
        max_members: parseInt(form.max_members) || 20,
        member_count: 1,
      }).select().single();

      if (error) throw error;

      // Auto-add admin as member
      await (supabase as any).from("target_ajo_memberships").insert({
        group_id: group.id,
        user_id: user.id,
        status: "active",
      });

      toast.success("Target Ajo created!");
      navigate(`/target-ajo/${group.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create target");
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
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Create Target Ajo</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/20 mb-6"
        >
          <div className="flex items-start gap-3">
            <Target className="h-5 w-5 text-primary mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Set a shared savings target. Members contribute from their wallets on the schedule you choose. Withdrawal requires 2/3 member approval.
            </p>
          </div>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label>Target Name *</Label>
            <Input placeholder="e.g. Office Rent Fund" value={form.name} onChange={(e) => update("name", e.target.value)} maxLength={100} />
          </div>

          <div>
            <Label>Reason / Purpose</Label>
            <Textarea placeholder="Why are we saving?" value={form.reason} onChange={(e) => update("reason", e.target.value)} rows={2} maxLength={500} />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea placeholder="Additional details..." value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} maxLength={1000} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Target Amount (₦) *</Label>
              <Input type="number" placeholder="500000" value={form.target_amount} onChange={(e) => update("target_amount", e.target.value)} min={1000} />
            </div>
            <div>
              <Label>Contribution (₦) *</Label>
              <Input type="number" placeholder="10000" value={form.contribution_amount} onChange={(e) => update("contribution_amount", e.target.value)} min={100} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Frequency *</Label>
              <Select value={form.frequency} onValueChange={(v) => update("frequency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Max Members</Label>
              <Input type="number" value={form.max_members} onChange={(e) => update("max_members", e.target.value)} min={2} max={100} />
            </div>
          </div>

          <div>
            <Label>Target Date</Label>
            <Input type="date" value={form.target_date} onChange={(e) => update("target_date", e.target.value)} min={new Date().toISOString().split("T")[0]} />
          </div>

          <div className="border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Beneficiary Bank Details *</h3>
            <div className="space-y-3">
              <div>
                <Label>Account Name</Label>
                <Input placeholder="Account holder name" value={form.beneficiary_account_name} onChange={(e) => update("beneficiary_account_name", e.target.value)} />
              </div>
              <div>
                <Label>Bank</Label>
                <Select value={form.beneficiary_bank_name} onValueChange={(v) => update("beneficiary_bank_name", v)}>
                  <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>
                    {nigerianBanks.map((bank) => (
                      <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Account Number</Label>
                <Input placeholder="0123456789" value={form.beneficiary_account_number} onChange={(e) => update("beneficiary_account_number", e.target.value.replace(/\D/g, "").slice(0, 10))} maxLength={10} />
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating..." : "Create Target Ajo"}
          </Button>
        </form>
      </main>

      <BottomNav />
    </div>
  );
}
