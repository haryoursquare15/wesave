import { useState, useCallback, useEffect } from "react";

// Bill catalogue cache (billers/items rarely change): 12h, shown instantly then refreshed.
const BILL_CACHE_TTL = 12 * 60 * 60 * 1000;
function readBillCache<T>(key: string): T | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (raw && raw.t && Date.now() - raw.t < BILL_CACHE_TTL) return raw.v as T;
  } catch { /* ignore */ }
  return null;
}
function writeBillCache(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* ignore */ }
}
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
import {
  getUserFriendlyError,
  insufficientBalanceMessage,
  isInsufficientBalanceError,
} from "@/lib/errorMessages";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import { SandboxBillReceipts } from "./SandboxBillReceipts";
import { SandboxBillBeneficiaries } from "./SandboxBillBeneficiaries";
import { SandboxRecurringBills } from "./SandboxRecurringBills";
import { BillBeneficiaryRename } from "./BillBeneficiaryRename";
import { TransactionPinGate } from "@/components/security/TransactionPinGate";
import { useDebounce } from "@/hooks/useDebounce";
import { billCategoryFor } from "@/lib/transactionLabels";

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
  isAmountFixed: string | boolean;
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

/**
 * VFD returns `isAmountFixed` inconsistently (boolean true, "true", 1, "1").
 * Any item that publishes a price > 0 is treated as fixed so the amount is
 * auto-populated and never typed by the user (e.g. data bundles).
 */
const isFixedPriceItem = (item?: BillerItem | null) => {
  if (!item) return false;
  const price = Number(item.amount);
  if (!Number.isFinite(price) || price <= 0) return false;
  const flag = String(item.isAmountFixed ?? "").toLowerCase();
  return flag === "false" ? false : true;
};

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
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splitMyShare, setSplitMyShare] = useState("");
  const [splitOthers, setSplitOthers] = useState(1);
  const [splitStage, setSplitStage] = useState<"setup" | "invite">("setup");
  const [createdSplit, setCreatedSplit] = useState<{ id: string; title: string; per_other: number; my_share: number; service_fee: number; others: number } | null>(null);
  const [splitSearch, setSplitSearch] = useState("");
  const [splitSearchResults, setSplitSearchResults] = useState<any[]>([]);
  const [splitSearching, setSplitSearching] = useState(false);
  const [splitInvited, setSplitInvited] = useState<Set<string>>(new Set());
  const [splitPaying, setSplitPaying] = useState(false);
  const [splitPaid, setSplitPaid] = useState(false);

  // Transaction PIN gate — every money-moving bill action must be authorized
  const [pinOpen, setPinOpen] = useState(false);
  const [pinPurpose, setPinPurpose] = useState("Bill Payment");
  const [pinDescription, setPinDescription] = useState<string | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<null | (() => void | Promise<void>)>(null);

  const requirePin = (purpose: string, description: string | undefined, action: () => void | Promise<void>) => {
    setPinPurpose(purpose);
    setPinDescription(description);
    setPendingAction(() => action);
    setPinOpen(true);
  };


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
  const [validatedName, setValidatedName] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  // Validation requirement comes from the backend policy (single source of truth).
  const [needsValidation, setNeedsValidation] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{
    reference: string;
    status: string;
    delivery_type?: string;
    delivery_token?: string | null;
    delivery_units?: string | null;
    delivery_detail?: Record<string, unknown>;
  } | null>(null);

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
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const response = await fetch(`${supabaseUrl}/functions/v1/vfd-sandbox-products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, ...body }),
    });
    const text = await response.text();
    let data: any = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { error: text }; }
    }
    if (!response.ok) {
      // Expected business outcomes (e.g. low balance) are returned, not thrown,
      // so they show as a friendly message instead of an app error.
      if (data?.code === "INSUFFICIENT_BALANCE") {
        return { error: data.error, code: data.code, shortfall: data.shortfall, required: data.required, available: data.available };
      }
      throw new Error(data?.error || data?.message || `Request failed (${response.status})`);
    }
    return data;
  }, [client]);

  /* ─── Validation requirement: ask the backend, never hardcode categories ─── */
  useEffect(() => {
    let cancelled = false;
    if (!selectedBiller || !selectedItem) { setNeedsValidation(false); return; }
    (async () => {
      try {
        const res = await callProducts("bills_validation_policy", {
          category: selectedCategory,
          billerId: selectedBiller.id,
          billerName: selectedBiller.name,
          paymentItemName: selectedItem.paymentitemname,
          productId: selectedItem.productId,
          divisionId: selectedBiller.division,
        });
        if (!cancelled) setNeedsValidation(Boolean(res?.data?.required));
      } catch {
        // Fail safe for UX: prompt validation; the backend enforces regardless.
        if (!cancelled) setNeedsValidation(true);
      }
    })();
    return () => { cancelled = true; };
  }, [callProducts, selectedCategory, selectedBiller, selectedItem]);

  /* ─── Step 1: Load Categories ─── */
  const loadCategories = useCallback(async () => {
    // Show cached/default categories instantly; refresh quietly in the background.
    const fallback = ["Airtime", "Cable TV", "Data", "Utility", "Internet Subscription", "Education", "Betting"];
    let cached: string[] | null = null;
    try { cached = JSON.parse(localStorage.getItem("vestara_bill_categories") || "null"); } catch { cached = null; }
    setCategories(cached?.length ? cached : fallback);
    setLoading(false);
    try {
      const result = await callProducts("bills_categories");
      const cats = result?.data?.data?.map((c: { category: string }) => c.category) || [];
      if (cats.length > 0) {
        setCategories(cats);
        try { localStorage.setItem("vestara_bill_categories", JSON.stringify(cats)); } catch { /* ignore */ }
      }
    } catch { /* keep shown categories */ }
  }, [callProducts]);

  /* ─── Step 2: Load Billers ─── */
  const loadBillers = useCallback(async (category: string) => {
    setSelectedCategory(category);
    setBillerSearch("");
    const cacheKey = `vestara_billers_${category}`;
    const cachedList = readBillCache<Biller[]>(cacheKey);
    if (cachedList?.length) {
      // Show instantly, refresh quietly in the background.
      setBillers(cachedList); setStep("billers");
      void callProducts("bills_billers", { categoryName: category }).then((result) => {
        const list = result?.data?.data;
        if (Array.isArray(list) && list.length) { writeBillCache(cacheKey, list); setBillers(list); }
      }).catch(() => { /* keep cached */ });
      return;
    }
    setLoading(true);
    try {
      const result = await callProducts("bills_billers", { categoryName: category });
      const list = result?.data?.data || [];
      setBillers(Array.isArray(list) ? list : []);
      if (Array.isArray(list) && list.length) writeBillCache(cacheKey, list);
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
    const cacheKey = `vestara_items_${biller.id}_${biller.division}_${biller.product}`;
    const cachedItems = readBillCache<BillerItem[]>(cacheKey);
    if (!cachedItems?.length) setLoading(true);
    else { setItems(cachedItems); setStep("items"); }
    try {
      const result = await callProducts("bills_items", {
        billerId: biller.id,
        divisionId: biller.division,
        productId: biller.product,
      });
      const paymentItems = result?.data?.data?.paymentitems || [];
      if (paymentItems.length) writeBillCache(cacheKey, paymentItems);
      if (cachedItems?.length) {
        if (paymentItems.length) setItems(paymentItems);
        return;
      }

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
      if (!cachedItems?.length) { setItems([]); setStep("items"); }
    } finally {
      setLoading(false);
    }
  }, [callProducts, selectedCategory]);

  /* ─── Select Item → Payment ─── */
  const selectItem = (item: BillerItem) => {
    setSelectedItem(item);
    if (isFixedPriceItem(item)) {
      setAmount(String(Number(item.amount)));
    } else {
      setAmount("");
    }
    setCustomerId("");
    setPhoneNumber("");
    setValidationResult(null);
    setValidatedName(null);
    setValidationError(null);
    setStep("payment");
  };

  /* ─── Auto-validate customer ID (debounced, no manual button) ─── */
  const debouncedCustomerId = useDebounce(customerId, 700);

  useEffect(() => {
    let cancelled = false;
    if (!needsValidation || !selectedBiller || !selectedItem || step !== "payment") return;
    const id = debouncedCustomerId.trim();
    if (id.length < 5 || id !== customerId.trim()) return;

    (async () => {
      setValidating(true);
      setValidationResult(null);
      setValidatedName(null);
      setValidationError(null);
      try {
        const result = await callProducts("bills_validate", {
          customerId: id,
          divisionId: selectedBiller.division,
          paymentItem: selectedItem.paymentCode,
          billerId: selectedBiller.id,
        });
        if (cancelled) return;
        const d = result?.data as Record<string, any> | undefined;
        if (d?.status === "00") {
          const name = String(
            d?.customerName ?? d?.customer_name ?? d?.data?.customerName ?? d?.data?.responseData?.customer?.customerName ?? d?.name ?? ""
          ).trim();
          setValidatedName(name || null);
          setValidationResult("valid");
        } else {
          setValidationResult("invalid");
          setValidationError(
            String(d?.message || d?.error || "").trim() ||
              "We couldn't verify this number with the biller. Please check it and try again."
          );
        }
      } catch (err) {
        if (cancelled) return;
        setValidationResult("invalid");
        setValidationError(
          err instanceof Error && err.message
            ? err.message
            : "We couldn't verify this number right now. Please check it and try again."
        );
      } finally {
        if (!cancelled) setValidating(false);
      }
    })();

    return () => { cancelled = true; };
  }, [debouncedCustomerId, customerId, needsValidation, selectedBiller, selectedItem, step, callProducts]);

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
        // Only the typed phone number is sent here; for airtime/data the backend
        // falls back to the customer ID (which is the MSISDN) when this is empty.
        phoneNumber: phoneNumber || undefined,
        category: selectedCategory,
        billerName: selectedBiller.name,
        paymentItemName: selectedItem.paymentitemname,
      });
      const resData = result?.data;
      if (resData?.status === "00") {
        setPaymentResult({
          reference: resData.reference,
          status: "success",
          delivery_type: resData.delivery_type,
          delivery_token: resData.delivery_token,
          delivery_units: resData.delivery_units,
          delivery_detail: resData.delivery_detail,
        });
        setStep("success");
        toast({
          title: resData.pending
            ? "Purchase accepted — awaiting biller"
            : resData.delivery_token
              ? "Token delivered!"
              : resData.delivery_type === "token"
                ? "Payment received — token pending"
                : "Payment Successful!",
          description: resData.pending
            ? "The biller has accepted this purchase but hasn't confirmed it yet. We'll notify you once it's delivered, or refund you automatically if it fails."
            : resData.delivery_token
              ? `Token ${resData.delivery_token}${resData.delivery_units ? ` • ${resData.delivery_units}` : ""}`
              : resData.delivery_type === "token"
                ? "The disco has not released your meter token yet. It will appear in your receipt as soon as it does."
                : `₦${Number(amount).toLocaleString()} paid for ${selectedBiller.name}`,
        });


      } else {
        const insufficient = isInsufficientBalanceError(result);
        toast({
          title: insufficient ? "Insufficient balance" : "Payment Failed",
          description: insufficient
            ? insufficientBalanceMessage(result)
            : getUserFriendlyError(result?.error || resData?.message || "Transaction could not be processed"),
          variant: "destructive",
        });
      }
    } catch (err) {
      const insufficient = isInsufficientBalanceError(err);
      toast({
        title: insufficient ? "Insufficient balance" : "Payment failed",
        description: insufficient ? insufficientBalanceMessage() : getUserFriendlyError(err),
        variant: "destructive",
      });
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
    const total = Number(amount);
    const myShare = Number(splitMyShare);
    const others = Math.max(1, Math.min(9, Math.floor(splitOthers || 1)));
    if (total < 1000) {
      toast({ title: "Minimum ₦1,000", description: "Split Pay requires a total of at least ₦1,000.", variant: "destructive" });
      return;
    }
    if (!myShare || myShare <= 0 || myShare >= total) {
      toast({ title: "Invalid contribution", description: `Enter an amount between ₦1 and ₦${(total - 1).toLocaleString()}.`, variant: "destructive" });
      return;
    }
    setCreatingSplit(true);
    try {
      const title = `${selectedBiller.name} — ${customerId}`;
      const r = await callProducts("create_split", {
        title,
        total_amount: total,
        split_count: others + 1,
        creator_amount: myShare,
        purpose: `Bill: ${selectedBiller.name} (${customerId})`,
        expiry_days: 7,
        bill_metadata: {
          customerId,
          amount: total,
          division: selectedBiller.division,
          paymentItem: selectedItem?.paymentCode,
          paymentItemName: selectedItem?.paymentitemname || null,
          productId: selectedBiller.product,
          billerId: selectedBiller.id,
          billerName: selectedBiller.name,
          phoneNumber: phoneNumber || customerId,
          category: selectedCategory,
        },
      });
      if (r?.error) throw new Error(r.error);
      const perOther = Math.ceil(((total - myShare) / others) * 100) / 100;
      const splitId = r?.data?.id;
      if (!splitId) throw new Error("Split was created but no ID returned");
      setCreatedSplit({
        id: splitId,
        title,
        per_other: perOther,
        my_share: myShare,
        service_fee: 100, // creator absorbs full fee
        others,
      });
      setSplitInvited(new Set());
      setSplitSearch("");
      setSplitSearchResults([]);
      setSplitPaid(false);
      setSplitStage("invite");
    } catch (e) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "Could not create split", variant: "destructive" });
    } finally {
      setCreatingSplit(false);
    }
  };

  /* ─── Split: search Vestara users for invite ─── */
  useEffect(() => {
    if (splitStage !== "invite") return;
    const q = splitSearch.trim();
    if (q.length < 2) { setSplitSearchResults([]); return; }
    let cancelled = false;
    setSplitSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await callProducts("search_users", { query: q });
        if (!cancelled) setSplitSearchResults(r?.data || []);
      } catch {
        if (!cancelled) setSplitSearchResults([]);
      } finally {
        if (!cancelled) setSplitSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [splitSearch, splitStage, callProducts]);

  const inviteToSplit = async (inviteeId: string) => {
    if (!createdSplit) return;
    try {
      const r = await callProducts("invite_split_member", {
        split_id: createdSplit.id,
        invitee_id: inviteeId,
      });
      if (r?.error) throw new Error(r.error);
      if (r?.data?.invited || r?.data?.already_invited) {
        setSplitInvited(prev => new Set(prev).add(inviteeId));
        toast({ title: r.data.already_invited ? "Already invited" : "Invite sent!" });
      }
    } catch (e) {
      toast({ title: "Invite failed", description: e instanceof Error ? e.message : "Could not invite user", variant: "destructive" });
    }
  };

  const payMySplitShare = async () => {
    if (!createdSplit) return;
    setSplitPaying(true);
    try {
      const r = await callProducts("pay_split", { split_id: createdSplit.id });
      if (r?.error) throw new Error(r.error);
      setSplitPaid(true);
      toast({ title: "Your share paid", description: `₦${(createdSplit.my_share + createdSplit.service_fee).toLocaleString()} debited from your wallet.` });
    } catch (e) {
      toast({ title: "Payment failed", description: e instanceof Error ? e.message : "Could not pay your share", variant: "destructive" });
    } finally {
      setSplitPaying(false);
    }
  };

  const closeSplitDialog = () => {
    setShowSplitDialog(false);
    // reset on close for next time
    setTimeout(() => {
      setSplitStage("setup");
      setCreatedSplit(null);
      setSplitInvited(new Set());
      setSplitSearch("");
      setSplitSearchResults([]);
      setSplitPaid(false);
    }, 200);
  };



  // Auto-load categories on first render
  if (categories.length === 0 && !loading) {
    loadCategories();
  }

  const isAmountFixed = isFixedPriceItem(selectedItem);
  const itemFee = selectedItem?.itemFee ? Number(selectedItem.itemFee) : 0;
  const convenienceFee = (selectedBiller?.convenienceFee ? Number(selectedBiller.convenienceFee) : 0)
    + (Number.isFinite(itemFee) && itemFee > 0 ? itemFee : 0);

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
        {step === "categories" && topTab === "pay" && (
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
                <p className="text-sm text-muted-foreground">No billers available for this category right now</p>
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
                <p className="text-sm text-muted-foreground">No packages available for this biller right now</p>
              </div>
            ) : (
              <div className="bg-card rounded-2xl border border-border/50 divide-y divide-border/30 overflow-hidden">
                {items.map((item) => {
                  const fixed = isFixedPriceItem(item);
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
              <div className="relative">
                <Input
                  placeholder={
                    selectedCategory === "Airtime" || selectedCategory === "Data"
                      ? "e.g. 08012345678"
                      : selectedCategory === "Utility"
                        ? "e.g. 1234567890"
                        : "Enter customer ID"
                  }
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setValidationResult(null);
                    setValidatedName(null);
                    setValidationError(null);
                  }}
                  className={
                    needsValidation && validationResult === "valid"
                      ? "pr-10 border-success"
                      : needsValidation && validationResult === "invalid"
                        ? "pr-10 border-destructive"
                        : "pr-10"
                  }
                />
                {needsValidation && validating && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {needsValidation && !validating && validationResult === "valid" && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
                )}
                {needsValidation && !validating && validationResult === "invalid" && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                )}
              </div>

              {needsValidation && validating && (
                <p className="text-xs text-muted-foreground">Verifying with {selectedBiller.name}…</p>
              )}

              {needsValidation && !validating && validationResult === "valid" && (
                <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Account name</p>
                  <p className="text-sm font-medium text-foreground">
                    {validatedName || "Verified — name not provided by biller"}
                  </p>
                </div>
              )}

              {needsValidation && !validating && validationResult === "invalid" && (
                <p className="text-xs text-destructive flex items-start gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{validationError || "Invalid number. Please check and try again."}</span>
                </p>
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
              <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Bill amount</span>
                  <span className="text-sm font-medium text-foreground">₦{Number(amount).toLocaleString()}</span>
                </div>
                {convenienceFee > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Convenience fee</span>
                    <span className="text-sm font-medium text-warning">₦{convenienceFee.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border/50 pt-2">
                  <span className="text-sm text-muted-foreground">Total to debit</span>
                  <span className="text-xl font-bold text-foreground">
                    ₦{(Number(amount) + convenienceFee).toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {/* Pay + Split Pay */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() =>
                  requirePin(
                    "Bill Payment",
                    `NGN ${(Number(amount || 0) + convenienceFee).toLocaleString()} to ${selectedBiller.name}`,
                    handlePay
                  )
                }
                disabled={paying || !customerId || !amount || Number(amount) <= 0 || (needsValidation && validationResult !== "valid")}
                className="h-12 text-base font-bold"
              >
                {paying ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  `Pay ₦${(Number(amount || 0) + convenienceFee).toLocaleString()}`
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const total = Number(amount || 0);
                  if (!total || total < 1000) {
                    toast({ title: "Minimum ₦1,000", description: "Split Pay needs a total of at least ₦1,000.", variant: "destructive" });
                    return;
                  }
                  setSplitMyShare(String(Math.max(1, Math.floor(total / 2))));
                  setSplitOthers(1);
                  setShowSplitDialog(true);
                }}
                disabled={paying || !customerId || !amount || Number(amount) < 1000 || (needsValidation && validationResult !== "valid")}
                className="h-12 text-base font-bold"
              >
                <Split className="h-4 w-4 mr-2" />
                Split Pay
              </Button>
            </div>

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
              <p className="text-sm font-semibold text-foreground">
                {billCategoryFor(selectedBiller?.name || "", `${selectedCategory || ""} ${selectedItem?.paymentitemname || ""}`)} — {selectedBiller?.name}
              </p>
              <p className="text-sm text-muted-foreground">
                ₦{Number(amount).toLocaleString()}
                {selectedItem?.paymentitemname ? ` · ${selectedItem.paymentitemname}` : ""}
                {customerId ? ` · ${customerId}` : ""}
              </p>
            </div>
            {paymentResult.delivery_token && (
              <div className="bg-primary/5 border border-primary/30 rounded-2xl p-4 text-left space-y-2">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                  {paymentResult.delivery_type === "pin" ? "Recharge PIN" : "Prepaid meter token"}
                </p>
                <p className="text-lg font-mono font-bold text-foreground tracking-wider break-all">
                  {paymentResult.delivery_token}
                </p>
                {paymentResult.delivery_units && (
                  <p className="text-xs text-muted-foreground">Units: {paymentResult.delivery_units}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                      void navigator.clipboard.writeText(paymentResult.delivery_token || "");
                      toast({ title: "Copied", description: "Token copied to clipboard" });
                    }}
                  >
                    Copy token
                  </Button>
                </div>
                {(paymentResult.delivery_detail?.kct1 || paymentResult.delivery_detail?.kct2) && (
                  <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 space-y-1">
                    <p className="text-[11px] font-semibold text-warning uppercase tracking-wide">
                      Key change tokens — enter these first
                    </p>
                    {["kct1", "kct2"].map((k, i) =>
                      paymentResult.delivery_detail?.[k] ? (
                        <p key={k} className="text-sm font-mono font-bold text-foreground break-all">
                          KCT{i + 1}: {String(paymentResult.delivery_detail[k])}
                        </p>
                      ) : null
                    )}
                  </div>
                )}

                {typeof paymentResult.delivery_detail?.instruction === "string" && (
                  <p className="text-[11px] text-muted-foreground">
                    {paymentResult.delivery_detail.instruction as string}
                  </p>
                )}
              </div>
            )}
            {!paymentResult.delivery_token && typeof paymentResult.delivery_detail?.instruction === "string" && (
              <p className="text-xs text-muted-foreground">{paymentResult.delivery_detail.instruction as string}</p>
            )}
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
            <BillBeneficiaryRename
              category={selectedCategory}
              biller={selectedBiller}
              item={selectedItem}
              customerId={customerId}
              phoneNumber={phoneNumber}
              onRenamed={() => toast({ title: "Beneficiary renamed" })}
            />
            <Button onClick={resetAll} className="w-full">Pay Another Bill</Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SPLIT PAY DIALOG ═══ */}
      <Dialog open={showSplitDialog} onOpenChange={(open) => { if (!open) closeSplitDialog(); else setShowSplitDialog(true); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {splitStage === "setup" ? "Split this bill" : splitPaid ? "Share paid" : "Invite & pay your share"}
            </DialogTitle>
          </DialogHeader>

          {splitStage === "setup" && (() => {
            const total = Number(amount || 0);
            const myShare = Number(splitMyShare || 0);
            const remainder = Math.max(0, total - myShare);
            const others = Math.max(1, Math.min(9, Math.floor(splitOthers || 1)));
            const perOther = others > 0 ? Math.ceil((remainder / others) * 100) / 100 : 0;
            const valid = myShare > 0 && myShare < total;
            return (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">Total bill</span>
                  <span className="text-base font-bold text-foreground">₦{total.toLocaleString()}</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="my-share">How much can you cover?</Label>
                  <Input
                    id="my-share"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={total - 1}
                    value={splitMyShare}
                    onChange={(e) => setSplitMyShare(e.target.value)}
                    placeholder="e.g. 1000"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Split the remaining ₦{remainder.toLocaleString()} with</Label>
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" size="icon" onClick={() => setSplitOthers(Math.max(1, others - 1))}>−</Button>
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-bold text-foreground">{others}</div>
                      <div className="text-xs text-muted-foreground">
                        {others === 1 ? "other person" : "other people"}
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="icon" onClick={() => setSplitOthers(Math.min(9, others + 1))}>+</Button>
                  </div>
                </div>

                {valid && (
                  <div className="rounded-lg border border-border/50 p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">You pay</span>
                      <span className="font-semibold text-foreground">₦{(myShare + 100).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>↳ Your share ₦{myShare.toLocaleString()} + ₦100 service fee</span>
                    </div>
                    <div className="flex justify-between pt-1">
                      <span className="text-muted-foreground">Each of {others} other{others > 1 ? "s" : ""}</span>
                      <span className="font-semibold text-foreground">₦{perOther.toLocaleString()}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground pt-1">
                      You absorb the ₦100 service fee — invitees pay only their bill share.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {splitStage === "invite" && createdSplit && (
            <div className="space-y-4 py-2">
              {/* Summary */}
              <div className="rounded-lg border border-border/50 p-3 space-y-1.5 text-sm bg-muted/30">
                <p className="text-xs text-muted-foreground">{createdSplit.title}</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Your share + fee</span>
                  <span className="font-semibold text-foreground">₦{(createdSplit.my_share + createdSplit.service_fee).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Each of {createdSplit.others} other{createdSplit.others > 1 ? "s" : ""}</span>
                  <span className="font-semibold text-foreground">₦{createdSplit.per_other.toLocaleString()}</span>
                </div>
              </div>

              {/* Invite */}
              <div className="space-y-2">
                <Label className="text-xs">Invite by username or name</Label>
                <Input
                  placeholder="e.g. @ada or Adaobi"
                  value={splitSearch}
                  onChange={(e) => setSplitSearch(e.target.value)}
                  className="text-sm"
                />
                {splitSearch.length >= 2 && (
                  <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-border p-1">
                    {splitSearching ? (
                      <p className="text-xs text-muted-foreground text-center py-3">Searching…</p>
                    ) : splitSearchResults.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">No users found</p>
                    ) : splitSearchResults.map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between p-2 rounded hover:bg-accent/50">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{u.full_name || u.username || "User"}</p>
                          {u.username && <p className="text-[10px] text-muted-foreground truncate">@{u.username}</p>}
                        </div>
                        {splitInvited.has(u.id) ? (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600">Invited</Badge>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => inviteToSplit(u.id)}>
                            Invite
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Invited {splitInvited.size}/{createdSplit.others}. You can also share later from the SplitPay tab.
                </p>
              </div>

              {/* Pay my share */}
              <Button
                onClick={() =>
                  requirePin(
                    "Split Pay Share",
                    `NGN ${(createdSplit.my_share + createdSplit.service_fee).toLocaleString()} from your wallet`,
                    payMySplitShare
                  )
                }
                disabled={splitPaying || splitPaid}
                className="w-full h-11 font-bold"
              >
                {splitPaid ? (
                  <><CheckCircle2 className="h-4 w-4 mr-2" />Your share paid</>
                ) : splitPaying ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Paying…</>
                ) : (
                  `Pay my share ₦${(createdSplit.my_share + createdSplit.service_fee).toLocaleString()}`
                )}
              </Button>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {splitStage === "setup" ? (
              <>
                <Button variant="ghost" onClick={closeSplitDialog} disabled={creatingSplit}>
                  Cancel
                </Button>
                <Button onClick={splitThisBill} disabled={creatingSplit}>
                  {creatingSplit ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating…</> : "Continue"}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={closeSplitDialog} className="w-full">
                {splitPaid ? "Done" : "Close"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransactionPinGate
        open={pinOpen}
        onOpenChange={setPinOpen}
        purpose={pinPurpose}
        description={pinDescription}
        onVerified={() => {
          setPinOpen(false);
          const action = pendingAction;
          setPendingAction(null);
          void action?.();
        }}
        onCancel={() => {
          setPinOpen(false);
          setPendingAction(null);
        }}
      />
    </div>
  );
}


