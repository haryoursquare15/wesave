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
  { value: "1", label: "After 1 minute" },
  { value: "2", label: "After 2 minutes" },
  { value: "5", label: "After 5 minutes" },
  { value: "10", label: "After 10 minutes" },
  { value: "15", label: "After 15 minutes (default)" },
  { value: "never", label: "Never (not recommended)" },
];
const autolockLabel = (v: string) => AUTOLOCK_OPTIONS.find(o => o.value === v)?.label.replace(" (default)", "") || "After 15 minutes";

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

export function SandboxProfile({ userId, email, client, avatarUrl, onChangePhoto, onNavigate, onSignOut }: SandboxProfileProps) {
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
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [soonTitle, setSoonTitle] = useState("");
  const [wa, setWa] = useState<{ phone: string; opted_in: boolean } | null>(null);
  const [cats, setCats] = useState({ money: true, ajo: true, weekly: false });
  const [threshold, setThreshold] = useState("");
  const [insightsOn, setInsightsOn] = useState(() => localStorage.getItem("vestara:insights") !== "off");
  const [signingOut, setSigningOut] = useState(false);

  const loadWa = () => {
    if (!userId) return;
    void sandboxSupabase.from("whatsapp_preferences" as never).select("phone, opted_in").eq("user_id", userId).maybeSingle()
      .then(({ data }) => setWa((data as { phone: string; opted_in: boolean } | null) ?? null));
  };
  useEffect(loadWa, [userId]);

  const soon = (title: string) => { setSoonTitle(title); setSheet("soon"); };
  const name = client?.full_name || email?.split("@")[0] || "Vestara user";
  const tier = client?.tier ? `Tier ${String(client.tier).replace(/\D/g, "") || client.tier}` : "Tier 1";

  const copyNuban = async () => {
    if (!client?.vfd_account_number) return;
    await navigator.clipboard.writeText(client.vfd_account_number);
    toast.success("Account number copied");
  };

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
        <ProfileRow icon={Landmark} label="Withdrawal bank" onClick={() => soon("Withdrawal bank")} />
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
        <ProfileRow icon={Timer} label="Auto-lock" value="After 2 min" onClick={() => soon("Auto-lock")} />
        <ProfileRow icon={Smartphone} label="Manage devices" onClick={() => soon("Manage devices")} />
        <ProfileRow icon={History} label="Login activity" onClick={() => soon("Login activity")} />
        <ProfileRow icon={LogOut} label="Sign out of all devices" onClick={() => soon("Sign out of all devices")} />
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
          helper={push.permission === "denied" ? "Blocked in browser settings" : undefined}
          trailing={<Switch checked={push.isSubscribed} disabled={!push.supported || push.loading || push.permission === "denied"}
            onCheckedChange={async (v) => { if (v) { if (await push.subscribe()) toast.success("Push notifications on"); } else { await push.unsubscribe(); toast.success("Push notifications off"); } }} aria-label="Push notifications" />}
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
        <ProfileRow icon={Trash2} label="Delete my account" onClick={() => soon("Delete my account")} />
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
      <p className="text-xs text-center text-muted-foreground">Banking services provided by VFD Microfinance Bank</p>

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
