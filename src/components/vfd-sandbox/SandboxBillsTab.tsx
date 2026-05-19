import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone, Tv, Wifi, Zap, Globe, ArrowLeft, ChevronRight,
  Search, Loader2, CheckCircle2, AlertCircle, Receipt,
  GraduationCap, Dices, Repeat, Users, Split,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { SandboxBillReceipts } from "./SandboxBillReceipts";
import { SandboxBillBeneficiaries } from "./SandboxBillBeneficiaries";
import { SandboxRecurringBills } from "./SandboxRecurringBills";

/* ─── Types ─── */
interface Biller {
  id: string;
  name: string;
  division: string;
  product: string;
  category: string;
  convenienceFee?: string;
}

interface BillerItem {
  id: string;
  billerid: string;
  amount: string;
  code: string;
  paymentitemname: string;
  productId: string;
  paymentitemid: string;
  currencySymbol: string;
  isAmountFixed: string;
  itemFee: string;
  paymentCode: string;
  billerType: string;
}

/* ─── Category Config ─── */
const categoryConfig: Record<string, { icon: typeof Smartphone; color: string; bg: string }> = {
  Airtime: { icon: Smartphone, color: "text-blue-600", bg: "bg-blue-500/10" },
  "Cable TV": { icon: Tv, color: "text-purple-600", bg: "bg-purple-500/10" },
  Data: { icon: Wifi, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  Utility: { icon: Zap, color: "text-amber-600", bg: "bg-amber-500/10" },
  "Internet Subscription": { icon: Globe, color: "text-rose-600", bg: "bg-rose-500/10" },
  Education: { icon: GraduationCap, color: "text-cyan-600", bg: "bg-cyan-500/10" },
  Betting: { icon: Dices, color: "text-orange-600", bg: "bg-orange-500/10" },
};

type Step = "categories" | "billers" | "items" | "payment" | "success";

export function SandboxBillsTab({ onOpenSplit }: { onOpenSplit?: () => void } = {}) {
  const { toast } = useToast();
  const { client } = useSandboxAwareAuth();
  const [topTab, setTopTab] = useState<"pay" | "receipts" | "recurring" | "beneficiaries">("pay");
  const [step, setStep] = useState<Step>("categories");
  const [loading, setLoading] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState<any[]>([]);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [recurringFreq, setRecurringFreq] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [creatingRecurring, setCreatingRecurring] = useState(false);
  const [creatingSplit, setCreatingSplit] = useState(false);

  // Data
  const [categories, setCategories] = useState<string[]>([]);
  const [billers, setBillers] = useState<Biller[]>([]);
  const [items, setItems] = useState<BillerItem[]>([]);

  // Selections
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedBiller, setSelectedBiller] = useState<Biller | null>(null);
  const [selectedItem, setSelectedItem] = useState<BillerItem | null>(null);

  // Payment form
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [validationResult, setValidationResult] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ reference: string; status: string } | null>(null);

  // Search/filter
  const [billerSearch, setBillerSearch] = useState("");

  const callProducts = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    let { data: sessionData } = await client.auth.getSession();
    let accessToken = sessionData?.session?.access_token;
    const expiresAt = sessionData?.session?.expires_at ?? 0;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!accessToken || expiresAt - nowSec < 60) {
      const { data: refreshed } = await client.auth.refreshSession();
      accessToken = refreshed?.session?.access_token;
    }
    if (!accessToken) throw new Error("Not authenticated");
    const resp = await client.functions.invoke("vfd-sandbox-products", {
      body: { action, ...body },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (resp.error) throw new Error(resp.error.message);
    return resp.data;
  }, [client]);

  /* ─── Step 1: Load Categories ─── */
  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callProducts("bills_categories");
      const cats = result?.data?.data?.map((c: { category: string }) => c.category) || [];
      setCategories(cats.length > 0 ? cats : ["Airtime", "Cable TV", "Data", "Utility", "Internet Subscription", "Education", "Betting"]);
    } catch {
      // Fallback categories
      setCategories(["Airtime", "Cable TV", "Data", "Utility", "Internet Subscription", "Education", "Betting"]);
    } finally {
      setLoading(false);
    }
  }, [callProducts]);

  /* ─── Step 2: Load Billers ─── */
  const loadBillers = useCallback(async (category: string) => {
    setSelectedCategory(category);
    setLoading(true);
    setBillerSearch("");
    try {
      const result = await callProducts("bills_billers", { categoryName: category });
      const list = result?.data?.data || [];
      setBillers(Array.isArray(list) ? list : []);
      if (!Array.isArray(list) || list.length === 0) {
        const msg = result?.data?.message || result?.raw?.message || `No ${category} billers available right now`;
        toast({ title: "No billers", description: String(msg) });
      }
    } catch (err) {
      setBillers([]);
      const msg = err instanceof Error ? err.message : "Could not load billers";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
      setStep("billers");
    }
  }, [callProducts, toast]);

  /* ─── Step 3: Load Items ─── */
  const loadItems = useCallback(async (biller: Biller) => {
    setSelectedBiller(biller);
    setLoading(true);
    try {
      const result = await callProducts("bills_items", {
        billerId: biller.id,
        divisionId: biller.division,
        productId: biller.product,
      });
      const paymentItems = result?.data?.data?.paymentitems || [];

      // If VFD returns no items, create a synthetic custom-amount item so the user can still pay
      if (paymentItems.length === 0) {
        const syntheticItem: BillerItem = {
          id: `syn-${biller.id}`,
          billerid: biller.id,
          amount: "0",
          code: biller.id,
          paymentitemname: `${biller.name} ${selectedCategory}`,
          productId: biller.product,
          paymentitemid: biller.product,
          currencySymbol: "NGN",
          isAmountFixed: "false",
          itemFee: "0",
          paymentCode: biller.id,
          billerType: "MO",
        };
        setItems([]);
        setSelectedItem(syntheticItem);
        setAmount("");
        setCustomerId("");
        setPhoneNumber("");
        setValidationResult(null);
        setStep("payment");
      } else {
        setItems(paymentItems);
        setStep("items");
      }
    } catch {
      setItems([]);
      setStep("items");
    } finally {
      setLoading(false);
    }
  }, [callProducts, selectedCategory]);

  /* ─── Select Item → Payment ─── */
  const selectItem = (item: BillerItem) => {
    setSelectedItem(item);
    if (item.isAmountFixed === "true" && Number(item.amount) > 0) {
      setAmount(item.amount);
    } else {
      setAmount("");
    }
    setCustomerId("");
    setPhoneNumber("");
    setValidationResult(null);
    setStep("payment");
  };

  /* ─── Validate Customer ─── */
  const validateCustomer = async () => {
    if (!customerId || !selectedBiller || !selectedItem) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await callProducts("bills_validate", {
        customerId,
        divisionId: selectedBiller.division,
        paymentItem: selectedItem.paymentCode,
        billerId: selectedBiller.id,
      });
      if (result?.data?.status === "00") {
        setValidationResult("valid");
      } else {
        setValidationResult("invalid");
      }
    } catch {
      setValidationResult("invalid");
    } finally {
      setValidating(false);
    }
  };

  /* ─── Pay ─── */
  const handlePay = async () => {
    if (!selectedBiller || !selectedItem || !customerId || !amount) return;
    setPaying(true);
    try {
      const result = await callProducts("bills_pay", {
        customerId,
        amount,
        division: selectedBiller.division,
        paymentItem: selectedItem.paymentCode,
        productId: selectedBiller.product,
        billerId: selectedBiller.id,
        phoneNumber: phoneNumber || undefined,
        category: selectedCategory,
        billerName: selectedBiller.name,
        paymentItemName: selectedItem.paymentitemname,
      });
      const resData = result?.data;
      if (resData?.status === "00") {
        setPaymentResult({ reference: resData.reference, status: "success" });
        setStep("success");
        toast({ title: "Payment Successful!", description: `₦${Number(amount).toLocaleString()} paid for ${selectedBiller.name}` });
      } else {
        toast({ title: "Payment Failed", description: resData?.message || "Transaction could not be processed", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Payment failed", variant: "destructive" });
    } finally {
      setPaying(false);
    }
  };

  /* ─── Navigation ─── */
  const goBack = () => {
    switch (step) {
      case "billers": setStep("categories"); break;
      case "items": setStep("billers"); break;
      case "payment": setStep("items"); break;
      case "success": resetAll(); break;
      default: break;
    }
  };

  const resetAll = () => {
    setStep("categories");
    setSelectedCategory("");
    setSelectedBiller(null);
    setSelectedItem(null);
    setCustomerId("");
    setAmount("");
    setPhoneNumber("");
    setValidationResult(null);
    setPaymentResult(null);
  };

  // Load beneficiaries when entering payment step
  useEffect(() => {
    if (step === "payment" && selectedCategory) {
      callProducts("list_bill_beneficiaries", { category: selectedCategory })
        .then(r => setBeneficiaries(r?.data || []))
        .catch(() => setBeneficiaries([]));
    }
  }, [step, selectedCategory, callProducts]);

  const pickBeneficiary = (b: any) => {
    setCustomerId(b.customer_id);
    setPhoneNumber(b.phone_number || "");
    setValidationResult(null);
  };

  const createRecurring = async () => {
    if (!paymentResult || !selectedBiller || !selectedItem) return;
    setCreatingRecurring(true);
    try {
      const today = new Date();
      const r = await callProducts("create_recurring_bill", {
        category: selectedCategory,
        biller_id: selectedBiller.id,
        biller_name: selectedBiller.name,
        division: selectedBiller.division,
        product_id: selectedBiller.product,
        payment_item_code: selectedItem.paymentCode,
        payment_item_name: selectedItem.paymentitemname,
        customer_id: customerId,
        phone_number: phoneNumber || undefined,
        amount: Number(amount),
        frequency: recurringFreq,
        day_of_week: recurringFreq === "weekly" ? today.getDay() : undefined,
        day_of_month: recurringFreq === "monthly" ? Math.min(today.getDate(), 28) : undefined,
        nickname: `${selectedBiller.name} • ${customerId.slice(-4)}`,
      });
      if (r?.error) throw new Error(r.error);
      toast({ title: "Recurring bill set", description: `${selectedBiller.name} will auto-pay ${recurringFreq} at 4 PM WAT from your wallet.` });
      setShowRecurringDialog(false);
    } catch (e) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "Could not create recurring bill", variant: "destructive" });
    } finally {
      setCreatingRecurring(false);
    }
  };

  const splitThisBill = async () => {
    if (!selectedBiller || !amount) return;
    setCreatingSplit(true);
    try {
      const r = await callProducts("create_split", {
        title: `${selectedBiller.name} — ${customerId}`,
        total_amount: Number(amount),
        split_count: 2,
        purpose: `Bill: ${selectedBiller.name} (${customerId})`,
        expiry_days: 7,
      });
      if (r?.error) throw new Error(r.error);
      toast({ title: "Split created", description: "Invite flatmates from the SplitPay tab." });
      onOpenSplit?.();
    } catch (e) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "Could not create split", variant: "destructive" });
    } finally {
      setCreatingSplit(false);
    }
  };

  // Auto-load categories on first render
  if (categories.length === 0 && !loading) {
    loadCategories();
  }

  const needsValidation = selectedCategory === "Utility" || selectedCategory === "Cable TV";
  const isAmountFixed = selectedItem?.isAmountFixed === "true" && Number(selectedItem.amount) > 0;
  const convenienceFee = selectedBiller?.convenienceFee ? Number(selectedBiller.convenienceFee) : 0;

  const filteredBillers = billerSearch
    ? billers.filter((b) => b.name.toLowerCase().includes(billerSearch.toLowerCase()))
    : billers;

  const stepTitle: Record<Step, string> = {
    categories: "Pay Bills",
    billers: selectedCategory,
    items: selectedBiller?.name || "Select Plan",
    payment: "Confirm Payment",
    success: "Payment Complete",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      {step !== "categories" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3"
        >
          <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-bold text-foreground">{stepTitle[step]}</h2>
        </motion.div>
      )}

      {step === "categories" && (
        <>
          <div>
            <h2 className="text-lg font-bold text-foreground mb-1">Pay Bills</h2>
            <p className="text-sm text-muted-foreground mb-3">Buy airtime, data, pay for cable TV, electricity & more</p>
          </div>
          <div className="flex gap-1.5 p-1 bg-muted/40 rounded-xl mb-3">
            {([
              { k: "pay", label: "Pay" },
              { k: "receipts", label: "Receipts" },
              { k: "recurring", label: "Recurring" },
              { k: "beneficiaries", label: "Saved" },
            ] as const).map(t => (
              <button
                key={t.k}
                onClick={() => setTopTab(t.k)}
                className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-all ${topTab === t.k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {topTab === "receipts" && <SandboxBillReceipts />}
          {topTab === "recurring" && <SandboxRecurringBills />}
          {topTab === "beneficiaries" && <SandboxBillBeneficiaries />}
        </>
      )}

      <AnimatePresence mode="wait">
        {/* ═══ CATEGORIES ═══ */}
        {step === "categories" && (
          <motion.div
            key="categories"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="grid grid-cols-2 gap-3"
          >
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
              ))
            ) : (
              categories.map((cat) => {
                const cfg = categoryConfig[cat] || { icon: Receipt, color: "text-muted-foreground", bg: "bg-muted" };
                const Icon = cfg.icon;
                return (
                  <motion.button
                    key={cat}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => loadBillers(cat)}
                    className="flex flex-col items-center justify-center gap-3 p-5 rounded-2xl bg-card border border-border/60 hover:border-primary/30 hover:shadow-md transition-all"
                  >
                    <div className={`w-12 h-12 rounded-xl ${cfg.bg} flex items-center justify-center`}>
                      <Icon className={`h-6 w-6 ${cfg.color}`} />
                    </div>
                    <span className="text-sm font-semibold text-foreground">{cat}</span>
                  </motion.button>
                );
              })
            )}
          </motion.div>
        )}

        {/* ═══ BILLERS ═══ */}
        {step === "billers" && (
          <motion.div
            key="billers"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-3"
          >
            {billers.length > 4 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search billers..."
                  value={billerSearch}
                  onChange={(e) => setBillerSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredBillers.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">No billers available for this category in sandbox mode</p>
              </div>
            ) : (
              <div className="bg-card rounded-2xl border border-border/50 divide-y divide-border/30 overflow-hidden">
                {filteredBillers.map((biller) => {
                  const cfg = categoryConfig[selectedCategory] || { icon: Receipt, color: "text-muted-foreground", bg: "bg-muted" };
                  const Icon = cfg.icon;
                  return (
                    <motion.button
                      key={`${biller.id}-${biller.division}`}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => loadItems(biller)}
                      className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`h-5 w-5 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{biller.name}</p>
                        {biller.convenienceFee && (
                          <p className="text-[10px] text-muted-foreground">
                            Convenience fee: ₦{Number(biller.convenienceFee).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ ITEMS (Plans) ═══ */}
        {step === "items" && (
          <motion.div
            key="items"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-3"
          >
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">No items available for this biller in sandbox</p>
              </div>
            ) : (
              <div className="bg-card rounded-2xl border border-border/50 divide-y divide-border/30 overflow-hidden">
                {items.map((item) => {
                  const fixed = item.isAmountFixed === "true" && Number(item.amount) > 0;
                  return (
                    <motion.button
                      key={item.id || item.paymentCode}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => selectItem(item)}
                      className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{item.paymentitemname}</p>
                        {item.itemFee && Number(item.itemFee) > 0 && (
                          <p className="text-[10px] text-muted-foreground">Fee: ₦{Number(item.itemFee).toLocaleString()}</p>
                        )}
                      </div>
                      {fixed && (
                        <Badge variant="secondary" className="text-xs font-bold">
                          ₦{Number(item.amount).toLocaleString()}
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ PAYMENT FORM ═══ */}
        {step === "payment" && selectedBiller && selectedItem && (
          <motion.div
            key="payment"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5"
          >
            {/* Summary card */}
            <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Biller</span>
                <span className="text-sm font-semibold text-foreground">{selectedBiller.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Plan</span>
                <span className="text-sm font-medium text-foreground">{selectedItem.paymentitemname}</span>
              </div>
              {convenienceFee > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Convenience Fee</span>
                  <span className="text-sm font-medium text-warning">₦{convenienceFee.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Customer ID */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {selectedCategory === "Airtime" || selectedCategory === "Data"
                  ? "Phone Number"
                  : selectedCategory === "Utility"
                    ? "Meter Number"
                    : selectedCategory === "Cable TV"
                      ? "Smartcard / IUC Number"
                      : "Customer ID"}
              </Label>
              <Input
                placeholder={
                  selectedCategory === "Airtime" || selectedCategory === "Data"
                    ? "e.g. 08012345678"
                    : selectedCategory === "Utility"
                      ? "e.g. 1234567890"
                      : "Enter customer ID"
                }
                value={customerId}
                onChange={(e) => { setCustomerId(e.target.value); setValidationResult(null); }}
              />
              {needsValidation && customerId.length >= 5 && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={validateCustomer}
                    disabled={validating}
                    className="text-xs"
                  >
                    {validating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Validate
                  </Button>
                  {validationResult === "valid" && (
                    <span className="text-xs text-success flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                    </span>
                  )}
                  {validationResult === "invalid" && (
                    <span className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" /> Invalid
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Amount (₦)</Label>
              <Input
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isAmountFixed}
                min={50}
              />
              {isAmountFixed && (
                <p className="text-[10px] text-muted-foreground">Fixed amount for this plan</p>
              )}
            </div>

            {/* Phone (optional for some) */}
            {(selectedCategory === "Utility") && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Phone Number (optional)</Label>
                <Input
                  placeholder="08012345678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
            )}

            {/* Total */}
            {Number(amount) > 0 && (
              <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-xl font-bold text-foreground">
                    ₦{(Number(amount) + convenienceFee).toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {/* Pay Button */}
            <Button
              onClick={handlePay}
              disabled={paying || !customerId || !amount || Number(amount) <= 0 || (needsValidation && validationResult !== "valid")}
              className="w-full h-12 text-base font-bold"
            >
              {paying ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                `Pay ₦${Number(amount || 0).toLocaleString()}`
              )}
            </Button>
          </motion.div>
        )}

        {/* ═══ SUCCESS ═══ */}
        {step === "success" && paymentResult && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8 space-y-5"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.5, delay: 0.1 }}
              className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto"
            >
              <CheckCircle2 className="h-10 w-10 text-success" />
            </motion.div>
            <div>
              <h3 className="text-xl font-bold text-foreground mb-1">Payment Successful!</h3>
              <p className="text-sm text-muted-foreground">
                ₦{Number(amount).toLocaleString()} paid to {selectedBiller?.name}
              </p>
            </div>
            <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Reference</span>
                <span className="text-xs font-mono text-foreground">{paymentResult.reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Customer ID</span>
                <span className="text-xs text-foreground">{customerId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Amount</span>
                <span className="text-xs font-bold text-foreground">₦{Number(amount).toLocaleString()}</span>
              </div>
            </div>
            <Button onClick={resetAll} className="w-full">Pay Another Bill</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
