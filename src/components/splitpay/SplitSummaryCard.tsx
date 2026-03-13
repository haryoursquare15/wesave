import { Receipt, Clock, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import type { SplitRequest, SplitParticipant } from "@/hooks/useSplitPay";

interface Props {
  request: SplitRequest;
  participants: SplitParticipant[];
  creatorName: string;
}

export function SplitSummaryCard({ request, participants, creatorName }: Props) {
  const paidCount = participants.filter((p) => p.status === "paid").length;
  const progressPct = participants.length > 0 ? (paidCount / participants.length) * 100 : 0;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Receipt className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground truncate">{request.purpose}</h2>
          <p className="text-sm text-muted-foreground">Created by {creatorName}</p>
        </div>
        <Badge
          variant={
            request.status === "active" ? "default" : request.status === "completed" ? "secondary" : "destructive"
          }
        >
          {request.status === "completed" && request.settlement_status !== "completed"
            ? "Settling"
            : request.status}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/20 rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Bill</p>
          <p className="text-lg font-bold text-foreground">₦{Number(request.total_amount).toLocaleString()}</p>
        </div>
        <div className="bg-primary/5 rounded-lg p-3 text-center border border-primary/20">
          <p className="text-xs text-muted-foreground">Your Share</p>
          <p className="text-lg font-bold text-primary">₦{Number(request.amount_per_person).toLocaleString()}</p>
          {request.platform_fee > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              + ₦{(Math.ceil((request.platform_fee / request.number_of_people) * 100) / 100).toLocaleString()} fee
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Payment Progress</span>
          <span className="font-semibold text-foreground">
            {paidCount} of {participants.length} paid
          </span>
        </div>
        <Progress value={progressPct} className="h-3" />
      </div>

      <div className="bg-muted/20 rounded-lg p-3 space-y-1 text-sm">
        <p className="font-semibold text-foreground">Merchant Details</p>
        <p className="text-muted-foreground">{request.merchant_account_name}</p>
        <p className="text-muted-foreground">
          {request.merchant_bank_name} — {request.merchant_account_number}
        </p>
      </div>

      {/* Settlement Status */}
      {request.status === "completed" && request.settlement_status && (
        <div className={`rounded-lg p-3 flex items-center gap-2 text-sm ${
          request.settlement_status === 'completed' 
            ? 'bg-success/10 text-success border border-success/20'
            : request.settlement_status === 'failed'
            ? 'bg-destructive/10 text-destructive border border-destructive/20'
            : 'bg-warning/10 text-warning border border-warning/20'
        }`}>
          {request.settlement_status === 'completed' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {request.settlement_status === 'processing' && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
          {request.settlement_status === 'failed' && <AlertTriangle className="h-4 w-4 shrink-0" />}
          {request.settlement_status === 'pending' && <Clock className="h-4 w-4 shrink-0" />}
          <span className="font-medium">
            {request.settlement_status === 'completed' && `₦${Number(request.total_amount).toLocaleString()} sent to ${request.merchant_account_name}`}
            {request.settlement_status === 'processing' && `Transferring ₦${Number(request.total_amount).toLocaleString()} to ${request.merchant_account_name}...`}
            {request.settlement_status === 'failed' && `Settlement failed: ${request.settlement_failure_reason || 'Unknown error'}`}
            {request.settlement_status === 'pending' && 'Merchant settlement pending'}
          </span>
        </div>
      )}

      {request.expiry_date && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Expires: {format(new Date(request.expiry_date), "MMM d, yyyy HH:mm")}</span>
        </div>
      )}
    </div>
  );
}
