import { FluidLoader } from "@/components/FluidLoader";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Share2, Heart, Target, Users, Clock, AlertTriangle } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BottomNav } from "@/components/BottomNav";
import { ContributeDialog } from "@/components/goal/ContributeDialog";
import { ContributionLedger } from "@/components/goal/ContributionLedger";
import { CampaignActivityFeed } from "@/components/goal/CampaignActivityFeed";
import { CampaignOwnerPanel } from "@/components/goal/CampaignOwnerPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useGoalCampaignDetail } from "@/hooks/useGoalCampaigns";
import { format } from "date-fns";
import { toast } from "sonner";

export default function GoalCampaignDetail() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { campaign, contributions, updates, loading, isOwner, refetch } = useGoalCampaignDetail(campaignId);
  const [contributeOpen, setContributeOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/signin");
  }, [user, authLoading, navigate]);

  const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

  const handleShare = () => {
    const url = campaign?.campaign_slug
      ? `${window.location.origin}/goal/${campaign.campaign_slug}`
      : window.location.href;
    navigator.clipboard.writeText(url);
    toast.success("Campaign link copied!");
  };

  if (authLoading || loading) {
    return <FluidLoader />;
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Target className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Campaign not found</p>
        <Button onClick={() => navigate("/goal-funding")}>Back to Campaigns</Button>
      </div>
    );
  }

  const progress = campaign.goal_amount > 0
    ? (campaign.amount_raised / campaign.goal_amount) * 100
    : 0;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-32 safe-bottom">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold text-foreground line-clamp-1">
              {campaign.campaign_title}
            </h1>
          </div>
          <Button variant="ghost" size="icon" onClick={handleShare}>
            <Share2 className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Campaign hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {campaign.campaign_image ? (
            <div className="h-48 rounded-xl overflow-hidden mb-4">
              <img src={campaign.campaign_image} alt={campaign.campaign_title} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="h-36 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mb-4">
              <Target className="h-12 w-12 text-primary/30" />
            </div>
          )}

          <div className="flex items-center gap-2 mb-2">
            <Badge variant={campaign.campaign_status === "active" ? "default" : "secondary"}>
              {campaign.campaign_status}
            </Badge>
            {isOwner && <Badge variant="outline">Your Campaign</Badge>}
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">{campaign.campaign_title}</h2>

          {campaign.description && (
            <p className="text-sm text-muted-foreground mb-4">{campaign.description}</p>
          )}

          {/* Progress */}
          <div className="p-4 rounded-xl bg-card border border-border mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-bold text-primary">{progress.toFixed(0)}%</span>
            </div>
            <Progress value={Math.min(progress, 100)} className="h-3 mb-3" />
            <div className="flex justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Raised</p>
                <p className="text-lg font-bold text-foreground">₦{fmt(campaign.amount_raised)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Goal</p>
                <p className="text-lg font-bold text-foreground">₦{fmt(campaign.goal_amount)}</p>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {campaign.contributor_count} contributors
            </span>
            {campaign.campaign_deadline && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Deadline: {format(new Date(campaign.campaign_deadline), "MMM d, yyyy")}
              </span>
            )}
          </div>

          {/* Contribute button */}
          {campaign.campaign_status === "active" && !isOwner && (
            <Button className="w-full mb-4" size="lg" onClick={() => setContributeOpen(true)}>
              <Heart className="h-5 w-5 mr-2" />
              Contribute Now
            </Button>
          )}

          {/* Legal disclaimer */}
          <div className="p-3 rounded-lg bg-muted/30 border border-border mb-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Vestara provides a platform for coordinating contributions. Payments are made directly to the campaign beneficiary. Vestara does not hold or manage contributed funds.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue="activity" className="space-y-4">
          <TabsList className={`grid w-full ${isOwner ? "grid-cols-3" : "grid-cols-2"}`}>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="ledger">Contribution History</TabsTrigger>
            {isOwner && <TabsTrigger value="manage">Manage</TabsTrigger>}
          </TabsList>

          <TabsContent value="activity">
            <CampaignActivityFeed
              contributions={contributions}
              updates={updates}
              visibility={campaign.contribution_visibility}
            />
          </TabsContent>

          <TabsContent value="ledger">
            <ContributionLedger
              contributions={contributions}
              campaign={campaign}
              isOwner={isOwner}
            />
          </TabsContent>

          {isOwner && (
            <TabsContent value="manage">
              <CampaignOwnerPanel
                campaign={campaign}
                contributions={contributions}
                onRefresh={refetch}
              />
            </TabsContent>
          )}
        </Tabs>
      </main>

      {campaign && (
        <ContributeDialog
          open={contributeOpen}
          onOpenChange={setContributeOpen}
          campaign={campaign}
          onSuccess={refetch}
        />
      )}

      <BottomNav />
    </div>
  );
}
