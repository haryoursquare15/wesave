import { useState, FormEvent, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ArrowLeft, Loader2, Users, PiggyBank, Send, Delete, Fingerprint } from "lucide-react";
import { useSandboxAuth } from "@/contexts/SandboxAuthContext";
import {
  requestSignupOtp, verifySignupAndSignIn, unlockWithPin, unlockWithBiometricToken, loginPinAction,
} from "@/lib/loginPinApi";
import {
  readQuickUnlock, saveQuickUnlock, clearQuickUnlock, clearBiometric, hasBiometricSetup,
  biometricSupported, biometricAssert, type QuickUnlockState,
} from "@/lib/quickUnlock";
import { SandboxSplash } from "@/components/vfd-sandbox/SandboxSplash";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errorMessages";
import { cn } from "@/lib/utils";

import logoAsset from "@/assets/vestara-v.png.asset.json";
const logo = logoAsset.url;
const ONBOARD_KEY = "vestara_onboarding_seen";

function FloatField({
  id, label, type = "text", value, onChange, autoComplete, right, inputMode,
}: {
  id: string; label: string; type?: string; value: string; onChange: (v: string) => void;
  autoComplete?: string; right?: React.ReactNode; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        className="peer h-14 w-full rounded-[14px] border border-input bg-background px-4 pt-5 pb-1 pr-12 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-4 top-1.5 text-xs text-muted-foreground transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-focus:top-1.5 peer-focus:text-xs peer-focus:text-primary"
      >
        {label}
      </label>
      {right && <div className="absolute right-3 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
  );
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

const slides = [
  { icon: Users, title: "Save together with Ajo", body: "Join a Thrift circle with friends and take turns getting paid." },
  { icon: PiggyBank, title: "Earn with Vault and GoalSave", body: "Put money aside, hit your goals and earn daily interest." },
  { icon: Send, title: "Pay bills and send money", body: "Airtime, electricity and transfers — fast, from one wallet." },
];

function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const S = slides[i];
  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-ink text-ink-foreground pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),16px)]">
      <div className="flex justify-end p-4">
        <button onClick={onDone} className="min-h-11 px-3 text-sm text-ink-foreground/70 select-none">Skip</button>
      </div>
      <motion.div
        key={i}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -60 && i < slides.length - 1) setI(i + 1);
          if (info.offset.x > 60 && i > 0) setI(i - 1);
        }}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="flex flex-1 flex-col items-center justify-center px-8 text-center"
      >
        <div className="mb-8 flex h-40 w-40 items-center justify-center rounded-full border-2 border-primary/60">
          <S.icon className="h-16 w-16 text-primary" strokeWidth={1.25} />
        </div>
        <h2 className="text-2xl font-semibold">{S.title}</h2>
        <p className="mt-3 text-ink-foreground/70">{S.body}</p>
      </motion.div>
      <div className="flex justify-center gap-2 pb-6">
        {slides.map((_, k) => (
          <span key={k} className={cn("h-2 rounded-full transition-all", k === i ? "w-6 bg-primary" : "w-2 bg-ink-foreground/30")} />
        ))}
      </div>
      <div className="px-4">
        <button
          onClick={() => (i < slides.length - 1 ? setI(i + 1) : onDone())}
          className="h-14 w-full rounded-[14px] bg-primary font-semibold text-primary-foreground select-none"
        >
          {i < slides.length - 1 ? "Next" : "Get started"}
        </button>
      </div>
    </div>
  );
}

export default function SandboxAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn } = useSandboxAuth();
  const [isSignUp, setIsSignUp] = useState(() => searchParams.get("mode") === "signup");
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [quick, setQuick] = useState<QuickUnlockState | null>(() => readQuickUnlock());
  const [usePassword, setUsePassword] = useState(false);
  const [qpin, setQpin] = useState("");
  const [bioReady, setBioReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === "undefined") return false;
    return !sessionStorage.getItem("vestara_splash_seen");
  });

  // Splash should never auto-log-in: drop any lingering session on the auth page.
  useEffect(() => {
    sessionStorage.removeItem("vestara_sandbox_signed_in");
    void sandboxSupabase.auth.signOut();
    void biometricSupported().then((ok) => setBioReady(ok && hasBiometricSetup()));
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const set = (k: keyof typeof form) => (v: string) => { setError(null); setForm((f) => ({ ...f, [k]: v })); };

  const finish = () => {
    sessionStorage.setItem("vestara_sandbox_signed_in", "1");
    navigate("/app");
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) return setError("Enter your email and password to continue.");
    setIsLoading(true);
    try {
      const { error } = await signIn(form.email.trim(), form.password);
      if (error) return setError(getUserFriendlyError(error.message));
      const st = await loginPinAction({ action: "get_status" });
      if (st?.has_pin) saveQuickUnlock(form.email.trim(), true);
      else clearQuickUnlock();
      toast.success("Welcome back to Vestara");
      finish();
    } finally {
      setIsLoading(false);
    }
  };

  const resetQuick = () => {
    clearQuickUnlock();
    setQuick(null);
    setBioReady(false);
    setQpin("");
  };

  const forgotPin = () => {
    resetQuick();
    setError(null);
    toast.message("Sign in with your password. You can set a new login PIN in the menu.");
  };

  const pressQuick = async (k: string) => {
    if (isLoading || !quick) return;
    setError(null);
    if (k === "del") return setQpin((p) => p.slice(0, -1));
    if (qpin.length >= 6) return;
    const next = qpin + k;
    setQpin(next);
    if (next.length < 6) return;
    setIsLoading(true);
    try {
      const r = await unlockWithPin(quick.email, next);
      if (r.error) {
        setQpin("");
        if (r.reset) resetQuick();
        if (r.locked) setUsePassword(true);
        return setError(r.error);
      }
      finish();
    } finally {
      setIsLoading(false);
    }
  };

  const bioUnlock = async () => {
    if (isLoading) return;
    setError(null);
    const token = await biometricAssert();
    if (!token) return setError("Biometric check didn't complete. Use your PIN instead.");
    setIsLoading(true);
    try {
      const r = await unlockWithBiometricToken(token);
      if (r.error) {
        if (r.reset) { clearBiometric(); setBioReady(false); }
        return setError(r.error);
      }
      finish();
    } finally {
      setIsLoading(false);
    }
  };

  const sendCode = async () => {
    setIsLoading(true);
    try {
      const { error } = await requestSignupOtp(form.email.trim());
      if (error) { setError(error); return false; }
      setResendIn(30);
      setOtp("");
      toast.success("Code sent. Check your inbox.");
      return true;
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async () => {
    if (otp.length !== 6) return setError("Enter the 6-digit code from the email.");
    setIsLoading(true);
    try {
      const { error } = await verifySignupAndSignIn({
        email: form.email.trim(), code: otp, password: form.password,
        fullName: form.name.trim(), phone: form.phone.trim(),
      });
      if (error) return setError(error);
      setStep(4);
    } finally {
      setIsLoading(false);
    }
  };

  const savePin = async (value: string) => {
    setIsLoading(true);
    try {
      const { data: s } = await sandboxSupabase.auth.getSession();
      const token = s.session?.access_token;
      const { data, error } = await sandboxSupabase.functions.invoke("transaction-pin", {
        body: { action: "set_pin", pin: value },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error || !data?.success) {
        setPin("");
        return setError("We couldn't save your PIN. You can set it later in Settings.");
      }
      toast.success("Account ready. Welcome to Vestara!");
      if (!localStorage.getItem(ONBOARD_KEY)) setShowOnboarding(true);
      else finish();
    } finally {
      setIsLoading(false);
    }
  };

  const pressKey = (k: string) => {
    if (isLoading) return;
    setError(null);
    if (k === "del") return setPin((p) => p.slice(0, -1));
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) void savePin(next);
  };

  const continueSignUp = async (e: FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      if (!form.name.trim()) return setError("Please enter your full name.");
      if (!/^0?\d{10}$|^\+?234\d{10}$/.test(form.phone.replace(/\s/g, ""))) return setError("Enter a valid Nigerian phone number.");
      setStep(2);
    } else if (step === 2) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError("Enter a valid email address.");
      if (form.password.length < 6) return setError("Password must be at least 6 characters.");
      if (await sendCode()) setStep(3);
    }
  };

  const pw = strength(form.password);
  const pwLabel = ["Too weak", "Weak", "Fair", "Good", "Strong"][pw];

  const Primary = ({ children }: { children: React.ReactNode }) => (
    <button
      type="submit"
      disabled={isLoading}
      className="flex h-14 w-full items-center justify-center rounded-[14px] bg-primary font-semibold text-primary-foreground transition disabled:opacity-60 select-none"
    >
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );

  const ErrorLine = () =>
    error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null;

  return (
    <div className="min-h-[100dvh] bg-background overscroll-none">
      <AnimatePresence>
        {showSplash && (
          <SandboxSplash
            onDone={() => {
              sessionStorage.setItem("vestara_splash_seen", "1");
              setShowSplash(false);
            }}
          />
        )}
      </AnimatePresence>
      {showOnboarding && (
        <Onboarding onDone={() => { localStorage.setItem(ONBOARD_KEY, "1"); finish(); }} />
      )}

      {!isSignUp && quick?.hasPin && !usePassword ? (
        <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center px-4 pt-[max(env(safe-area-inset-top),32px)] pb-[max(env(safe-area-inset-bottom),16px)]">
          <img src={logo} alt="Vestara" className="h-16 w-16 rounded-2xl object-contain" />
          <h2 className="mt-4 text-xl font-semibold text-foreground">Welcome back</h2>
          <p className="mt-1 text-center text-sm text-muted-foreground">Enter your 6-digit login PIN for {quick.email}</p>
          <div className="my-8 flex gap-3">
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <span key={k} className={cn("h-4 w-4 rounded-full border-2", k < qpin.length ? "border-primary bg-primary" : "border-muted-foreground/40")} />
            ))}
          </div>
          <ErrorLine />
          {isLoading && <Loader2 className="mt-2 h-5 w-5 animate-spin text-primary" />}
          <div className="mt-auto grid w-full max-w-xs grid-cols-3 gap-4">
            {[ "1", "2", "3", "4", "5", "6", "7", "8", "9", bioReady ? "bio" : "", "0", "del" ].map((k, idx) =>
              k === "" ? <span key={idx} /> : (
                <button
                  key={idx}
                  type="button"
                  aria-label={k === "del" ? "Delete" : k === "bio" ? "Use Face ID or fingerprint" : k}
                  onClick={() => (k === "bio" ? void bioUnlock() : pressQuick(k))}
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-medium text-foreground active:bg-primary/20 select-none"
                >
                  {k === "del" ? <Delete className="h-6 w-6" /> : k === "bio" ? <Fingerprint className="h-7 w-7 text-primary" /> : k}
                </button>
              ),
            )}
          </div>
          <div className="mt-4 flex w-full max-w-xs justify-between">
            <button type="button" onClick={() => { setUsePassword(true); setError(null); }} className="min-h-11 text-sm font-medium text-primary">
              Use password instead
            </button>
            <button type="button" onClick={forgotPin} className="min-h-11 text-sm text-muted-foreground">
              Forgot PIN?
            </button>
          </div>
        </div>
      ) : !isSignUp ? (
        <div className="flex min-h-[100dvh] flex-col">
          <div className="relative flex h-[40dvh] min-h-[240px] flex-col items-center justify-center bg-ink pt-[env(safe-area-inset-top)]">
            <div className="absolute h-40 w-40 rounded-full bg-primary/30 blur-3xl" />
            <img src={logo} alt="Vestara" className="relative h-20 w-20 rounded-2xl object-contain" />
            <h1 className="relative mt-3 text-2xl font-semibold text-ink-foreground">Vestara</h1>
            <p className="relative text-sm text-ink-foreground/70">Grow your money smarter</p>
          </div>
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="-mt-7 flex-1 rounded-t-[28px] bg-background px-4 pt-8 pb-[max(env(safe-area-inset-bottom),24px)]"
          >
            <div className="mx-auto w-full max-w-md">
              <h2 className="text-xl font-semibold text-foreground">Sign in</h2>
              <p className="mb-6 text-sm text-muted-foreground">Welcome back. Let's pick up where you left off.</p>
              <form onSubmit={handleSignIn} className="space-y-4">
                <FloatField id="email" label="Email" type="email" value={form.email} onChange={set("email")} autoComplete="email" />
                <FloatField
                  id="password"
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  autoComplete="current-password"
                  right={
                    <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)} className="flex h-11 w-11 items-center justify-center text-muted-foreground">
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  }
                />
                <div className="flex justify-end">
                  <Link to="/password/forgot" className="text-sm font-medium text-primary">Forgot password?</Link>
                </div>
                <ErrorLine />
                <Primary>Sign in</Primary>
              </form>
              <p className="mt-8 text-center text-sm text-muted-foreground">
                New to Vestara?{" "}
                <button type="button" onClick={() => { setIsSignUp(true); setStep(1); setError(null); }} className="font-semibold text-primary">
                  Create account
                </button>
              </p>
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-4 pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),16px)]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Back"
              disabled={step === 4}
              onClick={() => { setError(null); if (step === 1) setIsSignUp(false); else setStep(step - 1); }}
              className="flex h-11 w-11 items-center justify-center rounded-full text-foreground disabled:opacity-30"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${(step / 4) * 100}%` }} />
            </div>
            <span className="w-10 text-right text-xs text-muted-foreground">{step}/4</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.2 }}
              className="flex flex-1 flex-col pt-8"
            >
              {step === 3 ? (
                <form onSubmit={(e) => { e.preventDefault(); void verifyCode(); }} className="flex flex-1 flex-col">
                  <h2 className="text-2xl font-semibold text-foreground">Check your email</h2>
                  <p className="mb-6 mt-1 text-sm text-muted-foreground">
                    We sent a 6-digit code to <span className="font-medium text-foreground">{form.email.trim()}</span>.
                  </p>
                  <input
                    aria-label="6-digit code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    value={otp}
                    onChange={(e) => { setError(null); setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); }}
                    className="h-16 w-full rounded-[14px] border border-input bg-background text-center text-3xl tracking-[0.5em] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="mt-3"><ErrorLine /></div>
                  <button
                    type="button"
                    disabled={resendIn > 0 || isLoading}
                    onClick={() => void sendCode()}
                    className="mt-4 min-h-11 self-start text-sm font-medium text-primary disabled:text-muted-foreground"
                  >
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                  </button>
                  <div className="sticky bottom-0 mt-auto bg-background pt-6">
                    <Primary>Verify and create account</Primary>
                  </div>
                </form>
              ) : step < 3 ? (
                <form onSubmit={continueSignUp} className="flex flex-1 flex-col">
                  <h2 className="text-2xl font-semibold text-foreground">
                    {step === 1 ? "Let's get to know you" : "Secure your account"}
                  </h2>
                  <p className="mb-6 mt-1 text-sm text-muted-foreground">
                    {step === 1 ? "Your name and phone number." : "Your email and a strong password. We'll send a code to confirm the email."}
                  </p>
                  <div className="space-y-4">
                    {step === 1 ? (
                      <>
                        <FloatField id="name" label="Full name" value={form.name} onChange={set("name")} autoComplete="name" />
                        <FloatField id="phone" label="Phone number" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
                      </>
                    ) : (
                      <>
                        <FloatField id="email" label="Email" type="email" value={form.email} onChange={set("email")} autoComplete="email" />
                        <FloatField
                          id="password"
                          label="Password"
                          type={showPassword ? "text" : "password"}
                          value={form.password}
                          onChange={set("password")}
                          autoComplete="new-password"
                          right={
                            <button type="button" aria-label="Toggle password" onClick={() => setShowPassword((v) => !v)} className="flex h-11 w-11 items-center justify-center text-muted-foreground">
                              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                          }
                        />
                        {form.password && (
                          <div>
                            <div className="flex gap-1">
                              {[0, 1, 2, 3].map((k) => (
                                <span key={k} className={cn("h-1.5 flex-1 rounded-full", k < pw ? (pw <= 1 ? "bg-destructive" : pw === 2 ? "bg-amber-500" : "bg-primary") : "bg-muted")} />
                              ))}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{pwLabel}</p>
                          </div>
                        )}
                      </>
                    )}
                    <ErrorLine />
                  </div>
                  <div className="sticky bottom-0 mt-auto bg-background pt-6">
                    <Primary>{step === 2 ? "Send code" : "Continue"}</Primary>
                  </div>
                </form>
              ) : (
                <div className="flex flex-1 flex-col items-center">
                  <h2 className="text-2xl font-semibold text-foreground">Create your PIN</h2>
                  <p className="mt-1 text-center text-sm text-muted-foreground">You'll use this 4-digit PIN to approve payments.</p>
                  <div className="my-8 flex gap-4">
                    {[0, 1, 2, 3].map((k) => (
                      <span key={k} className={cn("h-4 w-4 rounded-full border-2", k < pin.length ? "border-primary bg-primary" : "border-muted-foreground/40")} />
                    ))}
                  </div>
                  <ErrorLine />
                  {isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                  <div className="mt-auto grid w-full max-w-xs grid-cols-3 gap-4">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, idx) =>
                      k === "" ? <span key={idx} /> : (
                        <button
                          key={idx}
                          type="button"
                          aria-label={k === "del" ? "Delete" : k}
                          onClick={() => pressKey(k)}
                          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-medium text-foreground active:bg-primary/20 select-none"
                        >
                          {k === "del" ? <Delete className="h-6 w-6" /> : k}
                        </button>
                      ),
                    )}
                  </div>
                  <button type="button" onClick={() => (localStorage.getItem(ONBOARD_KEY) ? finish() : setShowOnboarding(true))} className="mt-4 min-h-11 text-sm text-muted-foreground">
                    I'll do this later
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
