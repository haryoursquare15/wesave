import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ExternalLink, FileText, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { getUserFriendlyError } from "@/lib/errorMessages";

interface KycDocument {
  id: string;
  document_type: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  tier_level: number | null;
  uploaded_at: string;
  verification_status: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
  signed_url: string | null;
}

interface KycCustomer {
  user_id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  bvn: string | null;
  nin: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  tier: string | null;
  requested_tier: number | null;
  vfd_account_number: string | null;
  account_status: string | null;
  kyc_review_status: string;
  kyc_review_reason: string | null;
  kyc_reviewed_at: string | null;
  reviewed_by_name: string | null;
}

const REJECTION_REASONS = [
  "Document is unreadable or blurry",
  "Name on document does not match the account",
  "Document has expired",
  "Wrong document type submitted",
  "Suspected altered or fraudulent document",
];

const DOC_LABELS: Record<string, string> = {
  government_id: "Government-issued ID",
  utility_bill: "Utility Bill",
  passport_photograph: "Passport Photograph",
};

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right break-all">{value || "—"}</span>
    </div>
  );
}

interface Props {
  userId: string | null;
  canDecide: boolean;
  onOpenChange: (open: boolean) => void;
  onReviewed: () => void;
}

export function KycReviewDetail({ userId, canDecide, onOpenChange, onReviewed }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<KycCustomer | null>(null);
  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [reasonPreset, setReasonPreset] = useState<string>("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-kyc-review", {
      body: { action: "get_detail", user_id: userId },
    });
    setLoading(false);

    if (error || (data as { error?: string })?.error) {
      toast({
        title: "Could not load submission",
        description: getUserFriendlyError((data as { error?: string })?.error || error?.message),
        variant: "destructive",
      });
      return;
    }

    setCustomer((data as { customer: KycCustomer }).customer);
    setDocuments((data as { documents: KycDocument[] }).documents || []);
  }, [userId, toast]);

  useEffect(() => {
    setCustomer(null);
    setDocuments([]);
    setReason("");
    setReasonPreset("");
    setNote("");
    void load();
  }, [load]);

  const decide = async (action: "approve" | "reject") => {
    if (!userId) return;
    const finalReason = [reasonPreset, reason].filter(Boolean).join(" — ").trim();

    if (action === "reject" && finalReason.length < 5) {
      toast({
        title: "Reason required",
        description: "Pick a reason or write one so the customer knows what to fix.",
        variant: "destructive",
      });
      return;
    }

    setActing(action);
    const { data, error } = await supabase.functions.invoke("admin-kyc-review", {
      body: { action, user_id: userId, reason: finalReason, note: note || null },
    });
    setActing(null);

    if (error || (data as { error?: string })?.error) {
      toast({
        title: action === "approve" ? "Approval failed" : "Rejection failed",
        description: getUserFriendlyError((data as { error?: string })?.error || error?.message),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: action === "approve" ? "KYC approved" : "KYC rejected",
      description:
        action === "approve"
          ? "Full access unlocked and the customer has been notified."
          : "The customer has been notified with your reason.",
    });
    onReviewed();
    onOpenChange(false);
  };

  return (
    <Dialog open={!!userId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            KYC review
          </DialogTitle>
          <DialogDescription>
            Compare the submitted documents against the details the customer entered.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && customer && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Documents */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Submitted documents ({documents.length})</h3>
              {documents.length === 0 && (
                <p className="text-sm text-muted-foreground">No documents uploaded.</p>
              )}
              {documents.map((doc) => {
                const isImage = (doc.mime_type || "").startsWith("image/");
                return (
                  <div key={doc.id} className="rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/50">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {DOC_LABELS[doc.document_type] || doc.document_type}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {doc.file_name || "file"} ·{" "}
                          {new Date(doc.uploaded_at).toLocaleDateString("en-NG")}
                        </p>
                      </div>
                      {doc.signed_url && (
                        <a href={doc.signed_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm" className="gap-1">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open
                          </Button>
                        </a>
                      )}
                    </div>
                    {doc.signed_url && isImage && (
                      <img
                        src={doc.signed_url}
                        alt={`${DOC_LABELS[doc.document_type] || doc.document_type} submitted by customer`}
                        className="w-full max-h-72 object-contain bg-background"
                        loading="lazy"
                      />
                    )}
                    {doc.signed_url && !isImage && (
                      <object
                        data={doc.signed_url}
                        type={doc.mime_type || "application/pdf"}
                        className="w-full h-72 bg-background"
                      >
                        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                          <FileText className="h-4 w-4" />
                          Preview unavailable — use Open.
                        </div>
                      </object>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Entered details + actions */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Entered KYC details</h3>
                <div className="rounded-lg border border-border p-3 divide-y divide-border">
                  <DetailRow label="Full name" value={customer.full_name} />
                  <DetailRow label="Username" value={customer.username ? `@${customer.username}` : null} />
                  <DetailRow label="Email" value={customer.email} />
                  <DetailRow label="Phone" value={customer.phone} />
                  <DetailRow label="BVN" value={customer.bvn} />
                  <DetailRow label="NIN" value={customer.nin} />
                  <DetailRow label="Date of birth" value={customer.date_of_birth} />
                  <DetailRow label="Gender" value={customer.gender} />
                  <DetailRow label="Address" value={customer.address} />
                  <DetailRow label="Current tier" value={customer.tier} />
                  <DetailRow
                    label="Requested tier"
                    value={customer.requested_tier ? `Tier ${customer.requested_tier}` : null}
                  />
                  <DetailRow label="Account number" value={customer.vfd_account_number} />
                  <DetailRow label="Account status" value={customer.account_status} />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Review history</h3>
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <Badge
                      variant={
                        customer.kyc_review_status === "approved"
                          ? "default"
                          : customer.kyc_review_status === "rejected"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {customer.kyc_review_status}
                    </Badge>
                  </div>
                  <DetailRow label="Reviewed by" value={customer.reviewed_by_name} />
                  <DetailRow
                    label="Reviewed at"
                    value={
                      customer.kyc_reviewed_at
                        ? new Date(customer.kyc_reviewed_at).toLocaleString("en-NG")
                        : null
                    }
                  />
                  <DetailRow label="Reason / note" value={customer.kyc_review_reason} />
                </div>
              </div>

              {canDecide && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Rejection reason (required to reject)</Label>
                      <Select value={reasonPreset} onValueChange={setReasonPreset}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a common reason" />
                        </SelectTrigger>
                        <SelectContent>
                          {REJECTION_REASONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value.slice(0, 500))}
                        placeholder="Add detail the customer should act on…"
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Internal note (optional, approvals)</Label>
                      <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 500))}
                        placeholder="Recorded on the approval for audit"
                        rows={2}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        className="flex-1 min-h-11 gap-2"
                        disabled={!!acting}
                        onClick={() => decide("approve")}
                      >
                        {acting === "approve" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1 min-h-11 gap-2"
                        disabled={!!acting}
                        onClick={() => decide("reject")}
                      >
                        {acting === "reject" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        Reject
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
