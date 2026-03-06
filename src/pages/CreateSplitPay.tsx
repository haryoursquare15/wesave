import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import nigerianBanks from "@/lib/nigerianBanks";

export default function CreateSplitPay() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    purpose: "",
    totalAmount: "",
    numberOfPeople: "",
    merchantAccountName: "",
    merchantBankName: "",
    merchantAccountNumber: "",
    expiryDate: "",
  });

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const totalAmount = parseFloat(form.totalAmount) || 0;
  const numberOfPeople = parseInt(form.numberOfPeople) || 0;
  const amountPerPerson = numberOfPeople > 0 ? Math.ceil((totalAmount / numberOfPeople) * 100) / 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (totalAmount <= 0 || numberOfPeople < 2) {
      toast({ title: "Invalid input", description: "Enter a valid amount and at least 2 participants.", variant: "destructive" });
      return;
    }
    if (!form.merchantAccountName || !form.merchantBankName || !form.merchantAccountNumber) {
      toast({ title: "Missing merchant details", description: "Fill in all merchant account fields.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.from("split_requests").insert({
      creator_user_id: user.id,
      total_amount: totalAmount,
      number_of_people: numberOfPeople,
      amount_per_person: amountPerPerson,
      merchant_account_name: form.merchantAccountName,
      merchant_bank_name: form.merchantBankName,
      merchant_account_number: form.merchantAccountNumber,
      purpose: form.purpose,
      expiry_date: form.expiryDate || null,
    }).select("id").single();

    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Split Created!", description: "Now invite participants." });
    navigate(`/split-pay/${data.id}`);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/split-pay")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">Create Split</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-5 max-w-lg mx-auto">
          <div>
            <Label>Purpose of Payment</Label>
            <Input
              placeholder="e.g. Dinner at Nkoyo"
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Total Bill (₦)</Label>
              <Input
                type="number"
                min="100"
                step="0.01"
                placeholder="50,000"
                value={form.totalAmount}
                onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Number of Participants</Label>
              <Input
                type="number"
                min="2"
                max="50"
                placeholder="5"
                value={form.numberOfPeople}
                onChange={(e) => setForm({ ...form, numberOfPeople: e.target.value })}
                required
              />
            </div>
          </div>

          {amountPerPerson > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
              <p className="text-sm text-muted-foreground">Amount per person</p>
              <p className="text-2xl font-bold text-primary">₦{amountPerPerson.toLocaleString()}</p>
            </div>
          )}

          <div className="space-y-4 border-t border-border pt-4">
            <h3 className="font-semibold text-foreground">Merchant Details</h3>
            <div>
              <Label>Account Name</Label>
              <Input
                placeholder="Business account name"
                value={form.merchantAccountName}
                onChange={(e) => setForm({ ...form, merchantAccountName: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Bank Name</Label>
              <Select value={form.merchantBankName} onValueChange={(v) => setForm({ ...form, merchantBankName: v })}>
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
              <Input
                placeholder="0123456789"
                maxLength={10}
                value={form.merchantAccountNumber}
                onChange={(e) => setForm({ ...form, merchantAccountNumber: e.target.value.replace(/\D/g, "") })}
                required
              />
            </div>
          </div>

          <div>
            <Label>Expiry Date (Optional)</Label>
            <Input
              type="datetime-local"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating..." : "Create Split Request"}
          </Button>
        </form>
      </main>

      <BottomNav />
    </div>
  );
}
