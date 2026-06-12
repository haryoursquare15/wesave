import { useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Copy, Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export interface TransactionSuccessDetail {
  label: string;
  value: string;
  highlight?: boolean;
}

export interface TransactionSuccessPayload {
  /** Heading shown under the check icon */
  title: string;
  /** Sub-line under title */
  description?: string;
  /** Optional structured receipt-style details */
  details?: TransactionSuccessDetail[];
  /** Optional reference / receipt id (rendered with copy action) */
  reference?: string;
  /** Primary CTA label (default: "Done") */
  primaryLabel?: string;
  /** Secondary CTA label (e.g. "View Receipt") */
  secondaryLabel?: string;
  /** Auto-dismiss after N ms (e.g. 4000). Omit to require manual close. */
  autoCloseMs?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: TransactionSuccessPayload | null;
  onPrimary?: () => void;
  onSecondary?: () => void;
  /** Optional extra content (e.g. "Save as beneficiary" prompt) rendered above CTAs */
  extraContent?: React.ReactNode;
}

/**
 * Reusable success confirmation modal for ALL completed transactions
 * (savings, locks, transfers, withdrawals, contributions, splitpay, goal funding…).
 *
 * Shows an animated success check, transaction details, optional reference, and CTAs.
 */
export function TransactionSuccessModal({
  open,
  onOpenChange,
  payload,
  onPrimary,
  onSecondary,
  extraContent,
}: Props) {
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !payload?.autoCloseMs) return;
    const id = setTimeout(() => onOpenChange(false), payload.autoCloseMs);
    return () => clearTimeout(id);
  }, [open, payload?.autoCloseMs, onOpenChange]);

  const handlePrimary = () => {
    onPrimary?.();
    onOpenChange(false);
  };

  const handleCopyRef = async () => {
    if (!payload?.reference) return;
    try {
      await navigator.clipboard.writeText(payload.reference);
      toast({ title: "Reference copied" });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="mx-auto h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mb-2 ring-4 ring-success/5"
          >
            <CheckCircle2 className="h-9 w-9 text-success" />
          </motion.div>
          <DialogTitle className="text-center text-lg">
            {payload?.title || "Successful"}
          </DialogTitle>
          {payload?.description && (
            <DialogDescription className="text-center">
              {payload.description}
            </DialogDescription>
          )}
        </DialogHeader>

        {payload?.details && payload.details.length > 0 && (
          <div className="rounded-2xl bg-muted/40 border border-border/50 p-4 space-y-2.5">
            {payload.details.map((d, i) => (
              <div
                key={`${d.label}-${i}`}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span className="text-muted-foreground text-xs">{d.label}</span>
                <span
                  className={`text-right ${
                    d.highlight ? "font-bold text-foreground" : "font-medium"
                  }`}
                >
                  {d.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {payload?.reference && (
          <button
            onClick={handleCopyRef}
            className="w-full flex items-center justify-between gap-2 rounded-xl border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-xs hover:border-primary/40 transition-colors"
          >
            <span className="text-muted-foreground">Reference</span>
            <span className="font-mono font-medium truncate max-w-[60%]">
              {payload.reference}
            </span>
            <Copy className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        )}

        {extraContent}

        <div className="flex gap-2 pt-1">
          {payload?.secondaryLabel && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                onSecondary?.();
                onOpenChange(false);
              }}
            >
              <Share2 className="h-4 w-4 mr-1.5" />
              {payload.secondaryLabel}
            </Button>
          )}
          <Button
            variant="hero"
            className="flex-1"
            onClick={handlePrimary}
          >
            {payload?.primaryLabel || "Done"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
