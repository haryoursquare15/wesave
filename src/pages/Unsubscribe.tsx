import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Mail } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type State = "validating" | "ready" | "submitting" | "success" | "already" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<State>("validating");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Missing unsubscribe token.");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON } }
        );
        const data = await res.json();
        if (res.ok && data.valid) setState("ready");
        else if (data.reason === "already_unsubscribed") setState("already");
        else {
          setState("error");
          setMessage(data.error || "This link is invalid or has expired.");
        }
      } catch {
        setState("error");
        setMessage("We couldn't verify this link. Please try again.");
      }
    })();
  }, [token]);

  const confirm = async () => {
    setState("submitting");
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON },
          body: JSON.stringify({ token }),
        }
      );
      const data = await res.json();
      if (data.success) setState("success");
      else if (data.reason === "already_unsubscribed") setState("already");
      else {
        setState("error");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setState("error");
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 text-center">
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Mail className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Email Preferences</h1>

        {state === "validating" && (
          <div className="py-6 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p>Verifying your request…</p>
          </div>
        )}

        {state === "ready" && (
          <>
            <p className="text-muted-foreground mb-6">
              Click below to unsubscribe from WeSave emails. You can still receive critical account and transaction emails.
            </p>
            <Button className="w-full" onClick={confirm}>Confirm Unsubscribe</Button>
          </>
        )}

        {state === "submitting" && (
          <div className="py-6 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p>Processing…</p>
          </div>
        )}

        {state === "success" && (
          <div className="py-6 flex flex-col items-center gap-3">
            <CheckCircle2 className="h-10 w-10 text-primary" />
            <p className="text-foreground font-medium">You've been unsubscribed.</p>
            <p className="text-sm text-muted-foreground">We're sorry to see you go.</p>
          </div>
        )}

        {state === "already" && (
          <div className="py-6 flex flex-col items-center gap-3">
            <CheckCircle2 className="h-10 w-10 text-primary" />
            <p className="text-foreground font-medium">You're already unsubscribed.</p>
          </div>
        )}

        {state === "error" && (
          <div className="py-6 flex flex-col items-center gap-3">
            <XCircle className="h-10 w-10 text-destructive" />
            <p className="text-foreground font-medium">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
