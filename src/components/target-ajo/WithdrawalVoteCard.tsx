import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import type { TargetAjoWithdrawalRequest, TargetAjoVote } from "@/hooks/useTargetAjo";

import { getUserFriendlyError } from "@/lib/errorMessages";
interface Props {
  request: TargetAjoWithdrawalRequest;
  votes: TargetAjoVote[];
  isAdmin: boolean;
  onRefresh: () => void;
}

export function WithdrawalVoteCard({ request, votes, isAdmin, onRefresh }: Props) {
  const { user } = useAuth();
  const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

  const myVote = votes.find((v) => v.user_id === user?.id);
  const approvalPct = request.required_votes > 0
    ? (request.approval_count / request.required_votes) * 100
    : 0;

  const castVote = async (vote: "approve" | "reject") => {
    if (!user) return;
    try {
      const { error } = await (supabase as any).from("target_ajo_withdrawal_votes").insert({
        withdrawal_request_id: request.id,
        user_id: user.id,
        vote,
      });
      if (error) throw error;

      // Update counts
      const updates: any = {};
      if (vote === "approve") updates.approval_count = request.approval_count + 1;
      else updates.rejection_count = request.rejection_count + 1;

      // Check if approved (2/3 threshold)
      if (vote === "approve" && request.approval_count + 1 >= request.required_votes) {
        updates.status = "approved";
        updates.resolved_at = new Date().toISOString();
      }

      await (supabase as any).from("target_ajo_withdrawal_requests")
        .update(updates)
        .eq("id", request.id);

      toast.success(`Vote recorded: ${vote}`);
      onRefresh();
    } catch (err: any) {
      if (err.code === "23505") toast.error("You already voted");
      else toast.error(getUserFriendlyError(err.message || "Failed to vote"));
    }
  };

  const statusColor = {
    pending: "default" as const,
    approved: "default" as const,
    rejected: "destructive" as const,
    disbursed: "secondary" as const,
  };

  return (
    <div className="p-4 rounded-xl bg-card border border-border space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-foreground">₦{fmt(request.amount)}</p>
          {request.reason && <p className="text-xs text-muted-foreground">{request.reason}</p>}
        </div>
        <Badge variant={statusColor[request.status as keyof typeof statusColor] || "secondary"}>
          {request.status}
        </Badge>
      </div>

      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Approvals: {request.approval_count}/{request.required_votes}</span>
          <span>{approvalPct.toFixed(0)}%</span>
        </div>
        <Progress value={Math.min(approvalPct, 100)} className="h-2" />
      </div>

      <p className="text-xs text-muted-foreground">
        Created {format(new Date(request.created_at), "MMM d, yyyy h:mm a")}
      </p>

      {request.status === "pending" && !myVote && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => castVote("approve")}>
            <CheckCircle className="h-4 w-4 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="destructive" className="flex-1" onClick={() => castVote("reject")}>
            <XCircle className="h-4 w-4 mr-1" /> Reject
          </Button>
        </div>
      )}

      {myVote && (
        <p className="text-xs text-muted-foreground">
          You voted: <span className="font-medium">{myVote.vote}</span>
        </p>
      )}
    </div>
  );
}
