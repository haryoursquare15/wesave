import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, FlaskConical, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSandboxAuth } from "@/contexts/SandboxAuthContext";
import { toast } from "sonner";

export default function SandboxAuth() {
  const navigate = useNavigate();
  const { signIn, signUp } = useSandboxAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

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
          toast.error(error.message);
          return;
        }
        // Sandbox accounts are auto-confirmed, so we can sign in immediately
        const { error: signInErr } = await signIn(form.email, form.password);
        if (signInErr) {
          toast.success("Sandbox account created. Please sign in.");
          setIsSignUp(false);
          return;
        }
        toast.success("Sandbox account ready. Welcome!");
        navigate("/vfd-sandbox");
      } else {
        const { error } = await signIn(form.email, form.password);
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Welcome to the VFD Sandbox");
        navigate("/vfd-sandbox");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
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
              <h1 className="text-xl font-bold text-foreground">VFD Sandbox</h1>
              <p className="text-xs text-muted-foreground">Isolated test environment</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-6">
            {isSignUp
              ? "Create a separate test account to validate KYC and onboarding flows without touching your WeSave account."
              : "Sign in with a sandbox account. This session is independent from your main WeSave login."}
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
                    placeholder="Test User One"
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
                  placeholder="test1@sandbox.local"
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

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Please wait..." : isSignUp ? "Create sandbox account" : "Sign in to sandbox"}
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
                <>Already have a sandbox account? <span className="text-primary font-medium">Sign in</span></>
              ) : (
                <>Need a fresh test account? <span className="text-primary font-medium">Create one</span></>
              )}
            </button>
          </div>

          <div className="mt-6 p-3 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-xs text-muted-foreground">
              💡 <strong>Tip:</strong> Use any email like <code className="text-foreground">test1@sandbox.local</code>.
              You can stay logged into WeSave in another tab while you test here.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
