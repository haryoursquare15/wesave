import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Trash2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { getUserFriendlyError } from "@/lib/errorMessages";
export default function DeleteAccount() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirmation === "DELETE";

  const handleDelete = async () => {
    if (!canDelete || !user) return;
    setDeleting(true);

    try {
      // Call edge function to handle account deletion server-side
      const { data, error } = await supabase.functions.invoke("security-controls", {
        body: { action: "delete_account" },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Deletion failed");

      toast.success("Your account has been scheduled for deletion.");
      await signOut();
      navigate("/");
    } catch (e) {
      toast.error(getUserFriendlyError(e instanceof Error ? e.message : "Failed to delete account. Please contact support."));
    } finally {
      setDeleting(false);
    }
  };

  // If not logged in, show a message directing them to sign in first
  if (!authLoading && !user) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-4 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-xl font-bold text-foreground mb-2">Delete Your Account</h1>
        <p className="text-muted-foreground mb-6 max-w-sm">
          To delete your Vestara account, you need to sign in first so we can verify your identity.
        </p>
        <Button onClick={() => navigate("/auth")}>Sign In</Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-32 safe-bottom">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-foreground">Delete Account</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-md space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-destructive/10 border border-destructive/20 rounded-xl p-5"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-foreground mb-2">This action is permanent</h2>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• Your profile and all personal data will be erased</li>
                <li>• Your wallet balance will be forfeited</li>
                <li>• Active group memberships will be removed</li>
                <li>• You will lose access to all savings history</li>
                <li>• This cannot be undone</li>
              </ul>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Type <span className="font-bold text-destructive">DELETE</span> to confirm
            </label>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="Type DELETE here"
              className="text-center font-mono tracking-widest"
            />
          </div>

          <Button
            variant="destructive"
            className="w-full min-h-[48px]"
            disabled={!canDelete || deleting}
            onClick={handleDelete}
          >
            {deleting ? (
              <div className="h-5 w-5 border-2 border-destructive-foreground/30 border-t-destructive-foreground rounded-full animate-spin" />
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Permanently Delete My Account
              </>
            )}
          </Button>
        </motion.div>

        <p className="text-xs text-muted-foreground text-center">
          If you have any issues, please{" "}
          <button onClick={() => navigate("/support/new")} className="text-primary underline">
            contact support
          </button>{" "}
          before deleting your account.
        </p>
      </main>
    </div>
  );
}
