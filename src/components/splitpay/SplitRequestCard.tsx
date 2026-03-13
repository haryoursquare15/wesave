import { motion } from "framer-motion";
import { Receipt, Clock, Users, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import type { SplitRequest } from "@/hooks/useSplitPay";
import { useAuth } from "@/contexts/AuthContext";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  completed: { label: "Completed", variant: "secondary" },
  settling: { label: "Settling", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  expired: { label: "Expired", variant: "outline" },
};

export function SplitRequestCard({ request }: { request: SplitRequest }) {
  const { user } = useAuth();
  const config = statusConfig[request.status] || statusConfig.active;
  const isCreator = user?.id === request.creator_user_id;

  return (
    <Link to={`/split-pay/${request.id}`}>
      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="bg-card border border-border rounded-xl p-4 space-y-3 hover:border-primary/30 transition-colors"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">{request.purpose}</h3>
              <p className="text-xs text-muted-foreground">
                {format(new Date(request.created_at), "MMM d, yyyy")}
                {!isCreator && " · Invited"}
              </p>
            </div>
          </div>
          <Badge variant={config.variant} className="shrink-0">{config.label}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-muted/20 rounded-lg p-2">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-semibold text-foreground text-sm">₦{Number(request.total_amount).toLocaleString()}</p>
          </div>
          <div className="bg-muted/20 rounded-lg p-2">
            <p className="text-xs text-muted-foreground">Per Person</p>
            <p className="font-semibold text-primary text-sm">₦{Number(request.amount_per_person).toLocaleString()}</p>
          </div>
          <div className="bg-muted/20 rounded-lg p-2">
            <p className="text-xs text-muted-foreground">People</p>
            <p className="font-semibold text-foreground text-sm flex items-center justify-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {request.number_of_people}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">Merchant: {request.merchant_account_name}</span>
          {request.expiry_date && (
            <span className="flex items-center gap-1 shrink-0 ml-2">
              <Clock className="h-3 w-3" />
              {format(new Date(request.expiry_date), "MMM d")}
            </span>
          )}
        </div>
      </motion.div>
    </Link>
  );
}
