import { FluidLoader } from "@/components/FluidLoader";
import { motion } from "framer-motion";
import { Copy, Gift, Users, Clock, CheckCircle, Lock, Share2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useReferrals } from "@/hooks/useReferrals";
import { toast } from "sonner";
import { useEffect } from "react";

export default function Referrals() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { stats, history, referralLink, referralCode, loading } = useReferrals();

  useEffect(() => {
    if (!authLoading && !user) navigate("/signin");
  }, [user, authLoading, navigate]);

  const copyLink = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      toast.success("Referral link copied!");
    }
  };

  const shareLink = async () => {
    if (navigator.share && referralLink) {
      try {
        await navigator.share({
          title: "Join Vestara",
          text: "Save together, grow together! Join Vestara with my referral link and we both earn rewards.",
          url: referralLink,
        });
      } catch {
        copyLink();
      }
    } else {
      copyLink();
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "completed":
        return <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case "rewarded":
        return <Badge variant="outline" className="text-accent-foreground border-accent bg-accent"><Gift className="h-3 w-3 mr-1" />Rewarded</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (authLoading || loading) {
    return <FluidLoader />;
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-32 safe-bottom">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Referrals</h1>
              <p className="text-sm text-muted-foreground">Earn ₦1,000 per successful referral</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Referral Link Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Gift className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Your Referral Link</h3>
                  <p className="text-sm text-muted-foreground">Share and earn ₦1,000 per referral</p>
                </div>
              </div>

              <div className="bg-card rounded-lg p-3 mb-4 border border-border">
                <p className="text-sm text-muted-foreground break-all font-mono">
                  {referralLink || "Loading..."}
                </p>
              </div>

              <div className="flex gap-3">
                <Button onClick={copyLink} variant="outline" className="flex-1">
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
                <Button onClick={shareLink} className="flex-1">
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{stats?.total_referrals || 0}</p>
                <p className="text-xs text-muted-foreground">Total Referrals</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card>
              <CardContent className="p-4 text-center">
                <CheckCircle className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{stats?.completed_referrals || 0}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card>
              <CardContent className="p-4 text-center">
                <Gift className="h-5 w-5 text-gold mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">
                  ₦{(stats?.total_earned || 0).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Total Earned</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card>
              <CardContent className="p-4 text-center">
                <Lock className="h-5 w-5 text-destructive mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">
                  ₦{(stats?.liened_amount || 0).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Liened (Locked)</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* How It Works */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { step: "1", text: "Share your referral link with friends" },
              { step: "2", text: "They sign up and join a thrift group" },
              { step: "3", text: "When they complete a cycle, you earn ₦1,000" },
              { step: "4", text: "Complete your own cycle to unlock the bonus" },
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0">
                  {item.step}
                </div>
                <p className="text-sm text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Referral History */}
        <section>
          <h3 className="text-lg font-semibold text-foreground mb-4">Referral History</h3>
          {history.length > 0 ? (
            <div className="space-y-3">
              {history.map((ref) => (
                <Card key={ref.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">
                          {ref.referred_user_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(ref.created_at).toLocaleDateString("en-NG", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {ref.status === "rewarded" && (
                          <span className="text-sm font-semibold text-primary">
                            +₦{Number(ref.reward_amount).toLocaleString()}
                          </span>
                        )}
                        {statusBadge(ref.status)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No referrals yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Share your link to start earning
                </p>
              </CardContent>
            </Card>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
