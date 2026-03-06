import { motion } from "framer-motion";
import { Receipt, Clock, CheckCircle, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import type { SplitRequest } from "@/hooks/useSplitPay";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  completed: { label: "Completed", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  expired: { label: "Expired", variant: "outline" },
};

export function SplitRequestCard({ request }: { request: SplitRequest }) {
  const config = statusConfig[request.status] || statusConfig.active;

  return (
    <Link to={`/split-pay/${request.id}`}>
      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="bg-card border border-border rounded-xl p-4 space-y-3"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{request.purpose}</h3>
              <p className="text-xs text-muted-foreground">
                {format(new Date(request.created_at), "MMM d, yyyy")}
              </p>
            </div>
          </div>
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-muted/20 rounded-lg p-2">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-semibold text-foreground text-sm">₦{Number(request.total_amount).toLocaleString()}</p>
          </div>
          <div className="bg-muted/20 rounded-lg p-2">
            <p className="text-xs text-muted-foreground">Per Person</p>
            <p className="font-semibold text-foreground text-sm">₦{Number(request.amount_per_person).toLocaleString()}</p>
          </div>
          <div className="bg-muted/20 rounded-lg p-2">
            <p className="text-xs text-muted-foreground">Participants</p>
            <p className="font-semibold text-foreground text-sm">{request.number_of_people}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Merchant: {request.merchant_account_name}</span>
          {request.expiry_date && (
            <>
              <span>•</span>
              <Clock className="h-3 w-3" />
              <span>Expires {format(new Date(request.expiry_date), "MMM d, HH:mm")}</span>
            </>
          )}
        </div>
      </motion.div>
    </Link>
  );
}
