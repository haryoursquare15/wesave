import { motion } from "framer-motion";
import { Plus, Receipt, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useSplitRequests } from "@/hooks/useSplitPay";
import { SplitRequestCard } from "@/components/splitpay/SplitRequestCard";
import { useEffect } from "react";

export default function SplitPay() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { requests, loading } = useSplitRequests();

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-24 safe-bottom">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">SplitPay</h1>
                <p className="text-sm text-muted-foreground">Split bills & pay merchants together</p>
              </div>
            </div>
            <Link to="/split-pay/create">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> New Split
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
            <Receipt className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Split Requests Yet</h3>
            <p className="text-muted-foreground mb-4">Create your first split to pay a bill together.</p>
            <Link to="/split-pay/create">
              <Button><Plus className="h-4 w-4 mr-1" /> Create Split</Button>
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <SplitRequestCard key={req.id} request={req} />
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
