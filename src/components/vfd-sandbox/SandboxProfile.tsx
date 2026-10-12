import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Phone, ShieldCheck, IdCard, Landmark, BadgeCheck, Hash, FileText, KeyRound, Lock,
  Fingerprint, Timer, Smartphone, History, LogOut, MessageCircle, Bell, Mail, Palette,
  Sparkles, Download, AlertTriangle, LifeBuoy, HelpCircle, ClipboardList,
  ScrollText, Shield, Info, Copy, Camera, Loader2, CheckCircle, Monitor, Trash2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ProfileSection } from "./profile/ProfileSection";
import { ProfileRow } from "./profile/ProfileRow";
import { LoginPinSettings } from "@/components/settings/LoginPinSettings";
import { WhatsAppAlertSettings } from "@/components/settings/WhatsAppAlertSettings";
import { useTransactionPin } from "@/hooks/useTransactionPin";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useDeviceFingerprint } from "@/hooks/useDeviceFingerprint";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { RESET_PASSWORD } from "@/lib/appRoutes";
import { loginPinAction } from "@/lib/loginPinApi";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface ProfileClient {
  full_name: string | null;
  phone: string | null;
  bvn: string | null;
  nin: string | null;
  tier: string;
  vfd_account_number: string | null;
  metadata?: Record<string, unknown> | null;
}

interface WithdrawalBank {
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  set_at: string;
}

interface SandboxProfileProps {
  userId?: string;
  email?: string | null;
  client: ProfileClient | null;
  avatarUrl: string | null;
  banks?: Array<{ code: string; name: string }>;
  onLoadBanks?: () => Promise<void> | void;
  onValidateBeneficiary?: (account: string, bankCode: string) => Promise<string | null>;
  onChangePhoto: () => void;
  onNavigate: (view: string) => void;
  onSignOut: () => Promise<void> | void;
}

type SheetKey =
  | null | "loginPin" | "txPin" | "whatsapp" | "soon" | "freeze" | "signout" | "tier"
  | "contact" | "password" | "doc" | "autolock" | "devices" | "withdrawbank" | "pushsetup";

const AUTOLOCK_KEY = "vestara:autolock";
const AUTOLOCK_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "1", label: "After 1 minute (default)" },
  { value: "2", label: "After 2 minutes" },
  { value: "5", label: "After 5 minutes" },
  { value: "10", label: "After 10 minutes" },
  { value: "15", label: "After 15 minutes" },
  { value: "never", label: "Never (not recommended)" },
];
const autolockLabel = (v: string) => AUTOLOCK_OPTIONS.find(o => o.value === v)?.label.replace(" (default)", "") || "After 1 minute";

const mask = (v?: string | null, keep = 4) =>
  v ? `••••${v.replace(/\s/g, "").slice(-keep)}` : "Not added";

const maskPhone = (p?: string | null) => {
  if (!p) return "Not added";
  const d = p.replace(/\D/g, "").replace(/^234/, "0");
  return d.length >= 7 ? `${d.slice(0, 4)}•••${d.slice(-3)}` : d;
};

function Chip({ tone = "muted", children }: { tone?: "success" | "muted" | "primary"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "success" && "bg-success/10 text-success",
        tone === "primary" && "bg-primary/10 text-primary",
        tone === "muted" && "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

const WEAK = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "2345", "3456", "4567", "5678", "6789", "9876", "8765", "7654", "6543", "5432", "0123", "3210"]);
const four = (v: string) => v.replace(/\D/g, "").slice(0, 4);

function TransactionPinSheet({ onDone }: { onDone: () => void }) {
  const { changePin, loading } = useTransactionPin();
  const [mode, setMode] = useState<"menu" | "change" | "forgot">("menu");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (cur.length !== 4 || next.length !== 4) return setErr("Each transaction PIN must be 4 digits.");
    if (WEAK.has(next)) return setErr("That PIN is too easy to guess. Avoid repeated or sequential digits.");
    if (next !== confirm) return setErr("The new PINs don't match.");
    const r = await changePin(cur, next);
    if (!r?.success) {
      const left = typeof r?.attempts_remaining === "number" ? ` ${r.attempts_remaining} tries left.` : "";
      return setErr(r?.is_locked ? "Too many wrong tries. Please wait a few minutes and try again." : `Incorrect PIN.${left}`);
    }
    toast.success("Transaction PIN changed");
    onDone();
  };

  if (mode === "change") {
    return (
      <div className="space-y-3 pt-2">
        <Input type="password" inputMode="numeric" placeholder="Current 4-digit transaction PIN" value={cur} onChange={(e) => setCur(four(e.target.value))} />
        <Input type="password" inputMode="numeric" placeholder="New 4-digit transaction PIN" value={next} onChange={(e) => setNext(four(e.target.value))} />
        <Input type="password" inputMode="numeric" placeholder="Confirm new transaction PIN" value={confirm} onChange={(e) => setConfirm(four(e.target.value))} />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={loading} className="flex-1">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
          <Button variant="ghost" onClick={() => setMode("menu")}>Back</Button>
        </div>
      </div>
    );
  }
  if (mode === "forgot") {
    return (
      <div className="space-y-3 pt-2 text-sm text-muted-foreground">
        <p>To reset your 4-digit transaction PIN, our support team will verify you with a code sent to your registered number.</p>
        <p className="rounded-xl bg-primary/10 text-foreground p-3">After a reset, your transfer limits are lower for 24 hours to keep your money safe.</p>
        <div className="flex gap-2">
          <Button asChild className="flex-1"><a href="mailto:support@vestara.ng?subject=Reset%20my%20transaction%20PIN">Contact support</a></Button>
          <Button variant="ghost" onClick={() => setMode("menu")}>Back</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden mt-2">
      <ProfileRow icon={Lock} label="Change transaction PIN" onClick={() => setMode("change")} />
      <ProfileRow icon={HelpCircle} label="Forgot transaction PIN?" onClick={() => setMode("forgot")} />
    </div>
  );
}

export function SandboxProfile({ userId, email, client, avatarUrl, banks = [], onLoadBanks, onValidateBeneficiary, onChangePhoto, onNavigate, onSignOut }: SandboxProfileProps) {
  const [doc, setDoc] = useState({ title: "", src: "" });
  const [resetSending, setResetSending] = useState(false);
  const sendReset = async () => {
    if (!email) return;
    setResetSending(true);
    const { error } = await sandboxSupabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${RESET_PASSWORD}` });
    setResetSending(false);
    if (error) return toast.error("We couldn't send the link. Please try again.");
    toast.success("Check your email for a link to set a new password");
    setSheet(null);
  };
  const { theme, setTheme } = useTheme();
  const push = usePushNotifications();
  const device = useDeviceFingerprint();
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [soonTitle, setSoonTitle] = useState("");
  const [wa, setWa] = useState<{ phone: string; opted_in: boolean } | null>(null);
  const [cats, setCats] = useState({ money: true, ajo: true, weekly: false });
  const [threshold, setThreshold] = useState("");
  const [insightsOn, setInsightsOn] = useState(() => localStorage.getItem("vestara:insights") !== "off");
  const [signingOut, setSigningOut] = useState(false);
  const [autolock, setAutolock] = useState<string>(() => localStorage.getItem(AUTOLOCK_KEY) || "1");
  const [autolockUnlocked, setAutolockUnlocked] = useState(false);
  const [autolockPin, setAutolockPin] = useState("");
  const [autolockBusy, setAutolockBusy] = useState(false);
  const [hasLoginPin, setHasLoginPin] = useState<boolean | null>(null);

  // Withdrawal bank state (read from client.metadata; immutable once set)
  const withdrawalBank = useMemo<WithdrawalBank | null>(() => {
    const meta = (client?.metadata || {}) as Record<string, unknown>;
    const wb = meta.withdrawal_bank as WithdrawalBank | undefined;
    return wb && wb.account_number && wb.bank_name ? wb : null;
  }, [client?.metadata]);
  const [wbBankCode, setWbBankCode] = useState("");
  const [wbAccount, setWbAccount] = useState("");
  const [wbName, setWbName] = useState("");
  const [wbVerifying, setWbVerifying] = useState(false);
  const [wbVerified, setWbVerified] = useState(false);
  const [wbSaving, setWbSaving] = useState(false);

  // Devices state
  const [devices, setDevices] = useState<Array<{ id: string; device_fingerprint: string; device_name: string; browser: string | null; os: string | null; is_current: boolean; last_used_at: string }>>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  const loadWa = () => {
    if (!userId) return;
    void sandboxSupabase.from("whatsapp_preferences" as never).select("phone, opted_in").eq("user_id", userId).maybeSingle()
      .then(({ data }) => setWa((data as { phone: string; opted_in: boolean } | null) ?? null));
  };
  useEffect(loadWa, [userId]);

  const loadDevices = async () => {
    setDevicesLoading(true);
    try {
      const { data } = await sandboxSupabase.functions.invoke("security-controls", { body: { action: "get_devices" } });
      setDevices((data?.devices || []) as typeof devices);
    } finally { setDevicesLoading(false); }
  };

  useEffect(() => {
    if (sheet === "devices") void loadDevices();
    if (sheet === "withdrawbank") { if (banks.length === 0 && onLoadBanks) void onLoadBanks(); }
  }, [sheet]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live validation for withdrawal bank form
  useEffect(() => {
    if (!wbBankCode || wbAccount.length !== 10 || !onValidateBeneficiary) { setWbVerified(false); setWbName(""); return; }
    let active = true;
    const t = setTimeout(async () => {
      setWbVerifying(true);
      try {
        const name = await onValidateBeneficiary(wbAccount, wbBankCode);
        if (!active) return;
        if (name) { setWbName(name); setWbVerified(true); }
        else { setWbName(""); setWbVerified(false); }
      } finally { if (active) setWbVerifying(false); }
    }, 450);
    return () => { active = false; clearTimeout(t); };
  }, [wbBankCode, wbAccount, onValidateBeneficiary]);

  const saveWithdrawalBank = async () => {
    if (!userId || !wbVerified || !wbName) return;
    setWbSaving(true);
    try {
      const bankName = banks.find(b => b.code === wbBankCode)?.name || "";
      const next: WithdrawalBank = {
        bank_code: wbBankCode, bank_name: bankName,
        account_number: wbAccount, account_name: wbName,
        set_at: new Date().toISOString(),
      };
      const meta = { ...(client?.metadata || {}), withdrawal_bank: next };
      const { error } = await sandboxSupabase.from("vfd_sandbox_clients").update({ metadata: meta as Record<string, unknown> as never }).eq("user_id", userId);
      if (error) throw error;
      toast.success("Withdrawal bank saved. Withdrawals will go to this account.");
      setSheet(null);
      // Force a refresh so the row reflects immediately
      window.dispatchEvent(new Event("vestara:profile-updated"));
    } catch (err) {
      console.error(err);
      toast.error("We couldn't save your bank. Please try again.");
    } finally { setWbSaving(false); }
  };

  const applyAutolock = (v: string) => {
    setAutolock(v);
    localStorage.setItem(AUTOLOCK_KEY, v);
    toast.success(`Auto-lock set to ${autolockLabel(v).toLowerCase()}`);
  };

  const openAutolockSheet = async () => {
    setAutolockPin("");
    setAutolockUnlocked(false);
    setSheet("autolock");
    if (hasLoginPin === null) {
      const r = await loginPinAction({ action: "get_status" });
      setHasLoginPin(!!r?.has_pin);
    }
  };

  const verifyAutolockPin = async () => {
    if (autolockPin.length !== 6) return toast.error("Enter your 6-digit login PIN.");
    setAutolockBusy(true);
    const r = await loginPinAction({ action: "verify_pin", pin: autolockPin });
    setAutolockBusy(false);
    if (!r?.success) return toast.error(r?.error || "Incorrect PIN.");
    setAutolockUnlocked(true);
    setAutolockPin("");
  };

  const signOutOtherDevices = async () => {
    if (!device) return;
    try {
      const { data } = await sandboxSupabase.functions.invoke("security-controls", {
        body: { action: "sign_out_other_devices", fingerprint: device.fingerprint },
      });
      toast.success(`Signed out ${data?.removed || 0} other device${(data?.removed || 0) === 1 ? "" : "s"}.`);
      void loadDevices();
    } catch {
      toast.error("Couldn't sign out other devices. Please try again.");
    }
  };

  const removeDevice = async (id: string, isCurrent: boolean) => {
    if (isCurrent) return;
    if (!confirm("Remove this device?")) return;
    await sandboxSupabase.functions.invoke("security-controls", { body: { action: "remove_device", device_id: id } });
    void loadDevices();
  };

  const soon = (title: string) => { setSoonTitle(title); setSheet("soon"); };
  const name = client?.full_name || email?.split("@")[0] || "Vestara user";
  const tier = client?.tier ? `Tier ${String(client.tier).replace(/\D/g, "") || client.tier}` : "Tier 1";

  const copyNuban = async () => {
    if (!client?.vfd_account_number) return;
    await navigator.clipboard.writeText(client.vfd_account_number);
    toast.success("Account number copied");
  };

  const withdrawBankRowValue = withdrawalBank
    ? `${withdrawalBank.bank_name} ••${withdrawalBank.account_number.slice(-4)}`
    : "Not set";

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-card rounded-2xl border border-border p-5 flex items-center gap-4">
        <button type="button" onClick={onChangePhoto} className="relative shrink-0 active:scale-95 transition-transform" aria-label="Change profile photo">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatarUrl || undefined} alt="Your profile photo" className="object-cover" />
            <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">{name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-card">
            <Camera className="h-3 w-3" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground truncate">{name}</p>
          <p className="text-sm text-muted-foreground truncate">{email}</p>
          <div className="mt-1.5"><Chip tone="primary">{tier}</Chip></div>
        </div>
      </div>

      <ProfileSection title="Account">
        <ProfileRow icon={Phone} label="Mobile number" value={maskPhone(client?.phone)} />
        <ProfileRow icon={ShieldCheck} label="BVN" value={<span className="flex items-center gap-2 justify-end">{mask(client?.bvn)}{client?.bvn && <Chip tone="success">Verified</Chip>}</span>} />
        <ProfileRow icon={IdCard} label="NIN" value={mask(client?.nin)} />
        <ProfileRow
          icon={Landmark}
          label="Withdrawal bank"
          helper={withdrawalBank ? withdrawalBank.account_name : "Set once — cannot be changed"}
          value={withdrawBankRowValue}
          onClick={withdrawalBank ? undefined : () => setSheet("withdrawbank")}
        />
        <ProfileRow icon={BadgeCheck} label="Account tier and limits" value={tier} onClick={() => setSheet("tier")} />
        <ProfileRow
          icon={Hash}
          label="My VFD account number"
          value={client?.vfd_account_number || "—"}
          trailing={client?.vfd_account_number ? (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyNuban} aria-label="Copy account number"><Copy className="h-4 w-4" /></Button>
          ) : null}
        />
        <ProfileRow icon={FileText} label="Statements" onClick={() => onNavigate("history")} />
      </ProfileSection>

      <ProfileSection title="Security">
        <ProfileRow icon={KeyRound} label="Login PIN (6-digit)" helper="Used to open the app" onClick={() => setSheet("loginPin")} />
        <ProfileRow icon={Lock} label="Transaction PIN (4-digit)" helper="Used to approve payments and transfers" onClick={() => setSheet("txPin")} />
        <ProfileRow icon={Shield} label="Change password" onClick={() => setSheet("password")} />
        <ProfileRow icon={Fingerprint} label="Biometric login" helper="Set up inside Login PIN" onClick={() => setSheet("loginPin")} />
        <ProfileRow icon={Fingerprint} label="Use biometrics to confirm transfers" onClick={() => soon("Biometrics for transfers")} />
        <ProfileRow icon={Timer} label="Auto-lock" value={autolockLabel(autolock)} onClick={openAutolockSheet} />
        <ProfileRow icon={Smartphone} label="Manage devices" helper="One device at a time" onClick={() => setSheet("devices")} />
        <ProfileRow icon={LogOut} label="Sign out of all other devices" onClick={signOutOtherDevices} />
      </ProfileSection>

      <ProfileSection title="Notifications">
        <ProfileRow
          icon={MessageCircle}
          label="WhatsApp alerts"
          helper={wa?.phone ? maskPhone(wa.phone) : "Not set up"}
          value={<Chip tone={wa?.opted_in ? "success" : "muted"}>{wa?.opted_in ? "On" : "Off"}</Chip>}
          onClick={() => setSheet("whatsapp")}
        />
        <ProfileRow
          icon={Bell}
          label="Push notifications"
          helper={!push.supported ? "Not supported on this device" : push.permission === "denied" ? "Blocked in browser settings — enable it there to turn on" : push.isSubscribed ? "On" : "Tap to set up"}
          onClick={!push.isSubscribed && push.supported && push.permission !== "denied" ? () => setSheet("pushsetup") : undefined}
          trailing={<Switch checked={push.isSubscribed} disabled={!push.supported || push.loading || push.permission === "denied"}
            onCheckedChange={async (v) => {
              if (v) {
                const ok = await push.subscribe();
                if (ok) toast.success("Push notifications on");
                else toast.error(push.permission === "denied" ? "Push is blocked in your browser. Enable it in site settings." : "Couldn't enable push.");
              } else { await push.unsubscribe(); toast.success("Push notifications off"); }
            }} aria-label="Push notifications" />}
        />
        <ProfileRow icon={Mail} label="Email statements" onClick={() => soon("Email statements")} />
      </ProfileSection>

      <ProfileSection title="Preferences">
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Palette size={18} /></span>
            <p className="text-sm font-medium text-foreground">Appearance</p>
          </div>
          <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {(["system", "light", "dark"] as const).map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}
                className={cn("h-9 rounded-lg text-sm font-medium capitalize transition-colors", theme === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
              >{t}</button>
            ))}
          </div>
        </div>
      </ProfileSection>

      <ProfileSection title="Privacy and data">
        <ProfileRow icon={Sparkles} label="Personalised insights" helper="Use your spending to suggest budgets and savings"
          trailing={<Switch checked={insightsOn} onCheckedChange={(v) => { setInsightsOn(v); localStorage.setItem("vestara:insights", v ? "on" : "off"); }} aria-label="Personalised insights" />} />
        <ProfileRow icon={Download} label="Download my data" onClick={() => soon("Download my data")} />
      </ProfileSection>

      <ProfileSection title="Support">
        <ProfileRow icon={AlertTriangle} label="Report fraud / Freeze my account" destructive onClick={() => setSheet("freeze")} />
        <ProfileRow icon={LifeBuoy} label="Contact us" onClick={() => setSheet("contact")} />
        <ProfileRow icon={HelpCircle} label="FAQ" onClick={() => soon("FAQ")} />
        <ProfileRow icon={ClipboardList} label="Complaints" onClick={() => setSheet("contact")} />
      </ProfileSection>

      <ProfileSection title="About">
        <ProfileRow icon={ScrollText} label="Terms of Service" onClick={() => { setDoc({ title: "Terms of Service", src: "/terms" }); setSheet("doc"); }} />
        <ProfileRow icon={Shield} label="Privacy Policy" onClick={() => { setDoc({ title: "Privacy Policy", src: "/privacy" }); setSheet("doc"); }} />
        <ProfileRow icon={Info} label="App version" value="1.0.0" />
      </ProfileSection>

      <Button variant="outline" className="w-full h-12 rounded-2xl border-destructive/40 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setSheet("signout")}>
        <LogOut className="h-4 w-4 mr-2" /> Sign out
      </Button>

      <Sheet open={sheet !== null} onOpenChange={(o) => { if (!o) { setSheet(null); loadWa(); } }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
          {sheet === "loginPin" && (<>
            <SheetHeader><SheetTitle>Login PIN (6-digit)</SheetTitle><SheetDescription>Used to open the app. Not the same as your 4-digit transaction PIN.</SheetDescription></SheetHeader>
            <div className="pt-4"><LoginPinSettings /></div>
            <p className="text-xs text-muted-foreground pt-4">Forgot login PIN? Sign in with your password, then set a new one here.</p>
          </>)}
          {sheet === "txPin" && (<>
            <SheetHeader><SheetTitle>Transaction PIN (4-digit)</SheetTitle><SheetDescription>Used to approve payments and transfers. Not the same as your 6-digit login PIN.</SheetDescription></SheetHeader>
            <TransactionPinSheet onDone={() => setSheet(null)} />
          </>)}
          {sheet === "whatsapp" && (<>
            <SheetHeader><SheetTitle>WhatsApp alerts</SheetTitle><SheetDescription>Get important alerts on WhatsApp.</SheetDescription></SheetHeader>
            <WhatsAppAlertSettings onSaved={loadWa} />
            <div className="mt-4 divide-y divide-border rounded-2xl border border-border overflow-hidden">
              <ProfileRow icon={ShieldCheck} label="Security" helper="Always on to protect you" trailing={<Switch checked disabled aria-label="Security alerts" />} />
              <ProfileRow icon={Landmark} label="Money movement" trailing={<Switch checked={cats.money} onCheckedChange={(v) => setCats({ ...cats, money: v })} aria-label="Money movement" />} />
              <ProfileRow icon={Sparkles} label="Ajo and savings" trailing={<Switch checked={cats.ajo} onCheckedChange={(v) => setCats({ ...cats, ajo: v })} aria-label="Ajo and savings" />} />
              <ProfileRow icon={FileText} label="Weekly summary" trailing={<Switch checked={cats.weekly} onCheckedChange={(v) => setCats({ ...cats, weekly: v })} aria-label="Weekly summary" />} />
            </div>
            <label className="block mt-4 text-sm font-medium text-foreground">Alert me for transfers above (optional)</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
              <Input inputMode="numeric" className="pl-7 h-11" placeholder="e.g. 50,000" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))} />
            </div>
          </>)}
          {sheet === "tier" && (<>
            <SheetHeader><SheetTitle>Account tier and limits</SheetTitle><SheetDescription>You're on {tier}. Upgrade to raise your limits.</SheetDescription></SheetHeader>
            <Button className="w-full mt-4" onClick={() => { setSheet(null); onNavigate("kyc"); }}>Upgrade my tier</Button>
          </>)}
          {sheet === "freeze" && (<>
            <SheetHeader><SheetTitle>Report fraud or freeze your account</SheetTitle>
              <SheetDescription>Freezing stops all transfers, bill payments and card use until you unfreeze. Your savings keep earning. To unfreeze, contact support and verify your identity.</SheetDescription></SheetHeader>
            <div className="flex flex-col gap-2 pt-4">
              <Button variant="destructive" onClick={() => setSheet("contact")}>Report to support now</Button>
              <Button variant="ghost" onClick={() => setSheet(null)}>Cancel</Button>
            </div>
          </>)}
          {sheet === "signout" && (<>
            <SheetHeader><SheetTitle>Sign out of Vestara?</SheetTitle><SheetDescription>You'll need your password or login PIN to get back in.</SheetDescription></SheetHeader>
            <div className="flex flex-col gap-2 pt-4">
              <Button variant="destructive" disabled={signingOut} onClick={async () => { setSigningOut(true); await onSignOut(); }}>
                {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign out"}
              </Button>
              <Button variant="ghost" onClick={() => setSheet(null)}>Cancel</Button>
            </div>
          </>)}
          {sheet === "password" && (<>
            <SheetHeader><SheetTitle>Change password</SheetTitle><SheetDescription>We'll email a secure link to {email} so you can set a new password.</SheetDescription></SheetHeader>
            <div className="flex flex-col gap-2 pt-4">
              <Button disabled={resetSending} onClick={sendReset}>{resetSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send link"}</Button>
              <Button variant="ghost" onClick={() => setSheet(null)}>Cancel</Button>
            </div>
          </>)}
          {sheet === "contact" && (<>
            <SheetHeader><SheetTitle>Contact Vestara</SheetTitle><SheetDescription>Our team will get back to you as soon as possible.</SheetDescription></SheetHeader>
            <div className="mt-4 divide-y divide-border rounded-2xl border border-border overflow-hidden">
              <ProfileRow icon={Mail} label="Email support" helper="support@vestara.ng" onClick={() => { window.location.href = "mailto:support@vestara.ng"; }} />
            </div>
          </>)}
          {sheet === "withdrawbank" && (<>
            <SheetHeader>
              <SheetTitle>Set up your withdrawal bank</SheetTitle>
              <SheetDescription>
                Every withdrawal from Vestara goes to this account. For your safety, this cannot be changed later from the app — contact support if you need to update it.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-3 pt-3">
              <div>
                <Label>Bank</Label>
                <Select value={wbBankCode} onValueChange={setWbBankCode}>
                  <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {banks.map(b => (<SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Account number</Label>
                <div className="relative">
                  <Input inputMode="numeric" placeholder="10-digit account number" maxLength={10}
                    value={wbAccount}
                    onChange={e => { setWbAccount(e.target.value.replace(/\D/g, "").slice(0, 10)); setWbVerified(false); setWbName(""); }}
                    className={wbVerified ? "pr-10 border-success" : ""}
                  />
                  {wbVerifying && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                  {wbVerified && !wbVerifying && <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />}
                </div>
              </div>
              {wbName && wbVerified && (
                <div>
                  <Label>Account name (verified)</Label>
                  <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
                    <p className="text-sm font-medium text-foreground">{wbName}</p>
                  </div>
                </div>
              )}
              {!wbName && wbBankCode && wbAccount.length === 10 && !wbVerifying && !wbVerified && (
                <p className="text-xs text-destructive">Unable to verify account. Check the bank and account number.</p>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="ghost" className="flex-1" onClick={() => setSheet(null)}>Cancel</Button>
                <Button className="flex-1" onClick={saveWithdrawalBank} disabled={!wbVerified || wbSaving}>
                  {wbSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save bank"}
                </Button>
              </div>
            </div>
          </>)}
          {sheet === "autolock" && (<>
            <SheetHeader><SheetTitle>Auto-lock</SheetTitle><SheetDescription>Automatically sign you out after you stop using the app.</SheetDescription></SheetHeader>
            {hasLoginPin && !autolockUnlocked ? (
              <div className="pt-3 space-y-3">
                <p className="text-sm text-muted-foreground">Enter your 6-digit login PIN to change this setting.</p>
                <Input type="password" inputMode="numeric" placeholder="6-digit login PIN"
                  value={autolockPin} onChange={(e) => setAutolockPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                <Button className="w-full" onClick={verifyAutolockPin} disabled={autolockBusy}>
                  {autolockBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock setting"}
                </Button>
              </div>
            ) : (
              <div className="pt-3 space-y-1">
                {AUTOLOCK_OPTIONS.map(o => (
                  <button key={o.value} onClick={() => applyAutolock(o.value)}
                    className={cn("w-full text-left rounded-xl border px-4 py-3 flex items-center justify-between",
                      autolock === o.value ? "border-primary bg-primary/5" : "border-border bg-card")}
                  >
                    <span className="text-sm font-medium text-foreground">{o.label}</span>
                    {autolock === o.value && <CheckCircle className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </>)}
          {sheet === "devices" && (<>
            <SheetHeader>
              <SheetTitle>Manage devices</SheetTitle>
              <SheetDescription>Vestara allows one active device at a time. Signing in on another device will sign you out here.</SheetDescription>
            </SheetHeader>
            <div className="pt-3 space-y-2">
              {devicesLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : devices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No devices registered yet.</p>
              ) : devices.map(d => {
                const isCurrent = device?.fingerprint === d.device_fingerprint || d.is_current;
                return (
                  <div key={d.id} className={cn("rounded-xl border p-3 flex items-start gap-3", isCurrent ? "border-primary bg-primary/5" : "border-border bg-card")}>
                    <span className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      {d.os?.toLowerCase().includes("android") || d.os?.toLowerCase().includes("ios") ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{d.device_name}</p>
                        {isCurrent && <Chip tone="primary">This device</Chip>}
                      </div>
                      <p className="text-xs text-muted-foreground">{d.browser} · {d.os}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Last used {formatDistanceToNow(new Date(d.last_used_at), { addSuffix: true })}</p>
                    </div>
                    {!isCurrent && (
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => removeDevice(d.id, isCurrent)} aria-label="Remove device">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {devices.length > 1 && (
                <Button variant="outline" className="w-full mt-2" onClick={signOutOtherDevices}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign out of all other devices
                </Button>
              )}
            </div>
          </>)}
          {sheet === "pushsetup" && (<>
            <SheetHeader>
              <SheetTitle>Turn on push notifications</SheetTitle>
              <SheetDescription>Get instant alerts for money in and out, Ajo updates and security events — even when the app is closed.</SheetDescription>
            </SheetHeader>
            <div className="pt-3 space-y-3">
              <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
                <li>You'll be asked for permission in your browser.</li>
                <li>You can switch this off any time from this screen.</li>
                <li>Push does not replace email — important alerts still go to {email}.</li>
              </ul>
              <Button className="w-full" disabled={push.loading} onClick={async () => {
                const ok = await push.subscribe();
                if (ok) { toast.success("Push notifications on"); setSheet(null); }
                else toast.error(push.permission === "denied" ? "Push is blocked. Enable it in your browser's site settings and try again." : "Couldn't enable push.");
              }}>
                {push.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable push notifications"}
              </Button>
            </div>
          </>)}
          {sheet === "doc" && (<>
            <SheetHeader><SheetTitle>{doc.title}</SheetTitle></SheetHeader>
            <iframe title={doc.title} src={doc.src} className="mt-3 w-full h-[70dvh] rounded-xl border border-border bg-background" />
          </>)}
          {sheet === "soon" && (<>
            <SheetHeader><SheetTitle>{soonTitle}</SheetTitle><SheetDescription>This is coming soon. We'll let you know when it's ready.</SheetDescription></SheetHeader>
            <Button className="w-full mt-4" onClick={() => setSheet(null)}>Got it</Button>
          </>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}
