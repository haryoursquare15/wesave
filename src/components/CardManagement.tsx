import { useState, useEffect } from "react";
import { CreditCard, RefreshCw, Shield, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface CardInfo {
  id: string;
  card_last4: string | null;
  card_type: string | null;
  first_6digits: string | null;
  card_expiry: string | null;
  card_status: string;
  last_tokenized_at: string | null;
  created_at: string;
  needs_recovery?: boolean;
}

export function CardManagement() {
  const { user } = useAuth();
  const [card, setCard] = useState<CardInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [retokenizing, setRetokenizing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const fetchCard = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("card-tokenization", {
        body: { action: "get_card" },
      });
      if (!error && data?.success) {
        setCard(data.card);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCard();
  }, [user]);

  const getHoursUntilRetokenize = (): number | null => {
    if (!card?.last_tokenized_at) return null;
    const lastTokenized = new Date(card.last_tokenized_at).getTime();
    const hoursSince = (Date.now() - lastTokenized) / (1000 * 60 * 60);
    if (hoursSince >= 24) return null;
    return Math.ceil(24 - hoursSince);
  };

  const loadFlutterwaveScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.FlutterwaveCheckout) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.flutterwave.com/v3.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load payment script"));
      document.head.appendChild(script);
    });
  };

  const handleRetokenize = async () => {
    setRetokenizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("card-tokenization", {
        body: { action: "retokenize" },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to initiate card update");

      await loadFlutterwaveScript();
      const config = data.payment_config;

      window.FlutterwaveCheckout?.({
        ...config,
        callback: async (response: { transaction_id?: string; tx_ref?: string; status?: string }) => {
          if (response.status === "successful" || response.status === "completed") {
            setVerifying(true);
            try {
              const { data: verifyData, error: verifyError } = await supabase.functions.invoke("card-tokenization", {
                body: {
                  action: "verify_retokenize",
                  transactionId: response.transaction_id,
                  txRef: response.tx_ref,
                },
              });

              if (verifyError) throw verifyError;
              if (!verifyData?.success) throw new Error(verifyData?.error || "Verification failed");

              toast.success(
                `Card updated! ₦${verifyData.amount_credited?.toLocaleString() || "50"} credited to your wallet.`
              );
              await fetchCard();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Verification failed");
            } finally {
              setVerifying(false);
            }
          } else {
            toast.error("Payment was not successful. Please try again.");
          }
          setRetokenizing(false);
        },
        onclose: () => {
          setRetokenizing(false);
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start card update");
      setRetokenizing(false);
    }
  };

  const handleRecoverToken = async () => {
    setRecovering(true);
    try {
      const { data, error } = await supabase.functions.invoke("card-tokenization", {
        body: { action: "recover_token_user" },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Recovery failed");

      toast.success(`Card token recovered! Card ending ${data.card_last4 || "****"} is now active.`);
      await fetchCard();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to recover card token");
    } finally {
      setRecovering(false);
    }
  };

  const getMaskedPan = () => {
    if (!card) return null;
    const first6 = card.first_6digits || "••••••";
    const last4 = card.card_last4 || "••••";
    return `${first6}•••••• ${last4}`;
  };

  const hoursLeft = getHoursUntilRetokenize();

  if (loading) {
    return (
      <Card className="bg-card border border-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              <div className="h-3 w-48 bg-muted animate-pulse rounded mt-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!card) {
    return (
      <Card className="bg-card border border-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">No Card on File</h3>
              <p className="text-xs text-muted-foreground">
                Join an auto-debit group to authorize a card
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border border-border overflow-hidden">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Payment Card</h3>
              <p className="text-xs text-muted-foreground">Used for auto-debit contributions</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs capitalize">
            {card.card_type || "Card"}
          </Badge>
        </div>

        {/* Masked PAN */}
        <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl p-4 font-mono">
          <p className="text-xs text-muted-foreground mb-1">Card Number</p>
          <p className="text-lg tracking-widest text-foreground font-medium">
            {getMaskedPan()}
          </p>
          {card.card_expiry && (
            <div className="flex justify-between mt-3">
              <div>
                <p className="text-xs text-muted-foreground">Expires</p>
                <p className="text-sm text-foreground">{card.card_expiry}</p>
              </div>
              <div className="flex items-center gap-1 text-success">
                <Shield className="h-3 w-3" />
                <span className="text-xs">Secured</span>
              </div>
            </div>
          )}
        </div>

        {/* Recovery Warning */}
        {card.needs_recovery && (
          <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-warning">Card token needs recovery</p>
              <p className="text-xs text-muted-foreground">
                Your card authorization wasn't fully completed. Tap below to recover it.
              </p>
            </div>
          </div>
        )}

        {/* Recover Token Button */}
        {card.needs_recovery && (
          <Button
            variant="gold"
            className="w-full"
            onClick={handleRecoverToken}
            disabled={recovering}
          >
            {recovering ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Recovering...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Recover Token
              </>
            )}
          </Button>
        )}

        {/* Change Card Button */}
        {verifying ? (
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Verifying new card...</span>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleRetokenize}
            disabled={retokenizing || hoursLeft !== null}
          >
            {retokenizing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : hoursLeft !== null ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Change Card (available in {hoursLeft}h)
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Change Card
              </>
            )}
          </Button>
        )}

        <p className="text-xs text-muted-foreground text-center">
          A ₦50 authorization charge will be credited to your wallet. Card changes are limited to once every 24 hours.
        </p>
      </CardContent>
    </Card>
  );
}
