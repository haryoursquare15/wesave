import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, ArrowLeft, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { toast } from "sonner";

import { getUserFriendlyError } from "@/lib/errorMessages";
export default function SandboxForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await sandboxSupabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/vfd-sandbox/reset-password`,
      });
      if (error) {
        toast.error(getUserFriendlyError(error.message));
        return;
      }
      setSent(true);
      toast.success("Reset link sent. Check your inbox.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Link
          to="/vfd-sandbox/auth"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sandbox sign in
        </Link>

        <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FlaskConical className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Reset sandbox password</h1>
              <p className="text-xs text-muted-foreground">Sandbox account only</p>
            </div>
          </div>

          {sent ? (
            <div className="text-center py-6">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Mail className="h-7 w-7 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                If a sandbox account exists for <strong className="text-foreground">{email}</strong>,
                we've sent a reset link.
              </p>
              <p className="text-xs text-muted-foreground mb-6">
                Didn't get it? Check spam or{" "}
                <button onClick={() => setSent(false)} className="text-primary hover:underline">
                  try a different email
                </button>
                .
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/vfd-sandbox/auth">Return to sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your sandbox email and we'll send you a link to set a new password. This is
                independent of your main WeSave account.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="test1@sandbox.local"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
