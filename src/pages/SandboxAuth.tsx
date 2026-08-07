import { useState, FormEvent, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, FlaskConical, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSandboxAuth } from "@/contexts/SandboxAuthContext";
import { SandboxSplash } from "@/components/vfd-sandbox/SandboxSplash";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { toast } from "sonner";

import { getUserFriendlyError } from "@/lib/errorMessages";
export default function SandboxAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp } = useSandboxAuth();
  const [isSignUp, setIsSignUp] = useState(() => searchParams.get("mode") === "signup");

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === "undefined") return false;
    return !sessionStorage.getItem("vestara_splash_seen");
  });

  // Splash should never auto-log-in: when the auth page loads, drop any
  // lingering sandbox session so the user always has to sign in fresh.
  useEffect(() => {
    sessionStorage.removeItem("vestara_sandbox_signed_in");
    void sandboxSupabase.auth.signOut();
  }, []);


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isSignUp) {
        if (!form.name.trim()) {
          toast.error("Please enter your full name");
          return;
        }
        if (form.password.length < 6) {
          toast.error("Password must be at least 6 characters");
          return;
        }
        const { error } = await signUp(form.email, form.password, form.name);
        if (error) {
          toast.error(getUserFriendlyError(error.message));
          return;
        }
        // Sandbox accounts are auto-confirmed, so we can sign in immediately
        const { error: signInErr } = await signIn(form.email, form.password);
        if (signInErr) {
          toast.success("Account created. Please sign in.");
          setIsSignUp(false);
          return;
        }
        toast.success("Account ready. Welcome to Vestara!");
        sessionStorage.setItem("vestara_sandbox_signed_in", "1");
        navigate("/vfd-sandbox");
      } else {
        const { error } = await signIn(form.email, form.password);
        if (error) {
          toast.error(getUserFriendlyError(error.message));
          return;
        }
        toast.success("Welcome back to Vestara");
        sessionStorage.setItem("vestara_sandbox_signed_in", "1");
        navigate("/vfd-sandbox");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Link
          to="/vfd-sandbox"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Vestara
        </Link>

        <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FlaskConical className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Vestara</h1>
              <p className="text-xs text-muted-foreground">Grow your money smarter</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-6">
            {isSignUp
              ? "Create your Vestara account to save, split bills, and grow your money."
              : "Welcome back. Sign in to continue banking with Vestara."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your full name"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@example.com"
                  className="pl-10"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!isSignUp && (
              <div className="flex justify-end -mt-2">
                <Link
                  to="/vfd-sandbox/forgot-password"
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center">
            <button
              type="button"
              onClick={() => setIsSignUp((v) => !v)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {isSignUp ? (
                <>Already have an account? <span className="text-primary font-medium">Sign in</span></>
              ) : (
                <>New to Vestara? <span className="text-primary font-medium">Create an account</span></>
              )}
            </button>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
