import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Target, Heart } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BottomNav } from "@/components/BottomNav";
import { GoalCampaignCard } from "@/components/goal/GoalCampaignCard";
import { useAuth } from "@/contexts/AuthContext";
import { useGoalCampaigns } from "@/hooks/useGoalCampaigns";

export default function GoalFunding() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { campaigns, myCampaigns, loading } = useGoalCampaigns();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const filtered = campaigns.filter(c =>
    c.campaign_title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-32 safe-bottom">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-bold text-foreground">Goal Funding</h1>
            </div>
            <Link to="/goal-funding/create">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </Link>
          </div>
          <Input
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="explore" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="explore">Explore</TabsTrigger>
            <TabsTrigger value="my-campaigns">My Campaigns</TabsTrigger>
          </TabsList>

          <TabsContent value="explore" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20"
            >
              <div className="flex items-start gap-3">
                <Heart className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Support causes that matter</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Contribute to campaigns and help others achieve their goals. Payments go directly to beneficiaries.
                  </p>
                </div>
              </div>
            </motion.div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : filtered.length > 0 ? (
              <div className="grid gap-4">
                {filtered.map((c) => <GoalCampaignCard key={c.id} campaign={c} />)}
              </div>
            ) : (
              <div className="text-center py-12">
                <Target className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No campaigns found</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="my-campaigns" className="space-y-4">
            {myCampaigns.length > 0 ? (
              <div className="grid gap-4">
                {myCampaigns.map((c) => <GoalCampaignCard key={c.id} campaign={c} showManage />)}
              </div>
            ) : (
              <div className="text-center py-12">
                <Target className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-4">You haven't created any campaigns yet</p>
                <Link to="/goal-funding/create">
                  <Button>Create Your First Campaign</Button>
                </Link>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <BottomNav />
    </div>
  );
}
