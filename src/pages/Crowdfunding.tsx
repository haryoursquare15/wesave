import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  ArrowLeft, Plus, Target, Users, Clock, TrendingUp, 
  Heart, Share2, ChevronRight 
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  target_amount: number;
  raised_amount: number;
  contributor_count: number;
  deadline: string | null;
  status: string;
  category: string | null;
  image_url: string | null;
  creator_id: string;
  created_at: string;
}

export default function Crowdfunding() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [myCampaigns, setMyCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    async function fetchCampaigns() {
      try {
        // Fetch all active campaigns
        const { data: allCampaigns, error } = await supabase
          .from("crowdfunding_campaigns")
          .select("*")
          .in("status", ["active", "completed"])
          .order("created_at", { ascending: false });

        if (error) throw error;
        setCampaigns(allCampaigns || []);

        // Fetch user's campaigns
        if (user) {
          const { data: userCampaigns } = await supabase
            .from("crowdfunding_campaigns")
            .select("*")
            .eq("creator_id", user.id)
            .order("created_at", { ascending: false });

          setMyCampaigns(userCampaigns || []);
        }
      } catch (err) {
        console.error("Error fetching campaigns:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchCampaigns();
  }, [user]);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-NG").format(amount);
  };

  const filteredCampaigns = campaigns.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-24 safe-bottom">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-bold text-foreground">Crowdfunding</h1>
            </div>
            <Link to="/crowdfunding/create">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </Link>
          </div>

          {/* Search */}
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
            {/* Info Banner */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-gold/10 border border-primary/20"
            >
              <div className="flex items-start gap-3">
                <Heart className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Support causes that matter
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Contribute to campaigns and help others achieve their goals.
                  </p>
                </div>
              </div>
            </motion.div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : filteredCampaigns.length > 0 ? (
              <div className="grid gap-4">
                {filteredCampaigns.map((campaign) => {
                  const progress = (campaign.raised_amount / campaign.target_amount) * 100;
                  return (
                    <motion.div
                      key={campaign.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-card rounded-xl border border-border overflow-hidden"
                    >
                      {campaign.image_url && (
                        <div className="h-40 bg-muted">
                          <img 
                            src={campaign.image_url} 
                            alt={campaign.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-foreground">{campaign.title}</h3>
                          <Badge variant={campaign.status === "active" ? "success" : "secondary"}>
                            {campaign.status}
                          </Badge>
                        </div>
                        
                        {campaign.description && (
                          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                            {campaign.description}
                          </p>
                        )}

                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Raised</span>
                            <span className="font-semibold text-foreground">
                              ₦{formatAmount(campaign.raised_amount)} of ₦{formatAmount(campaign.target_amount)}
                            </span>
                          </div>
                          <Progress value={Math.min(progress, 100)} className="h-2" />
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {campaign.contributor_count} backers
                            </span>
                            {campaign.deadline && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(new Date(campaign.deadline), "MMM d")}
                              </span>
                            )}
                          </div>
                          <Link to={`/crowdfunding/${campaign.id}`}>
                            <Button size="sm" variant="outline">
                              View
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
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
                {myCampaigns.map((campaign) => {
                  const progress = (campaign.raised_amount / campaign.target_amount) * 100;
                  return (
                    <motion.div
                      key={campaign.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-card rounded-xl border border-border p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-foreground">{campaign.title}</h3>
                        <Badge variant={campaign.status === "active" ? "success" : "secondary"}>
                          {campaign.status}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2 mb-3">
                        <Progress value={Math.min(progress, 100)} className="h-2" />
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            ₦{formatAmount(campaign.raised_amount)} raised
                          </span>
                          <span className="font-medium text-foreground">
                            {progress.toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      <Link to={`/crowdfunding/${campaign.id}`}>
                        <Button size="sm" variant="outline" className="w-full">
                          Manage Campaign
                        </Button>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Target className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-4">You haven't created any campaigns yet</p>
                <Link to="/crowdfunding/create">
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
