import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  ArrowLeft, Plus, Building2, Users, Wallet, 
  ChevronRight, Search, Shield 
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Association {
  id: string;
  name: string;
  description: string | null;
  max_members: number;
  member_count: number;
  status: string;
  admin_id: string;
  created_at: string;
}

export default function Associations() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [associations, setAssociations] = useState<Association[]>([]);
  const [myAssociations, setMyAssociations] = useState<Association[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    async function fetchAssociations() {
      try {
        // Fetch all associations
        const { data: allAssociations, error } = await supabase
          .from("associations")
          .select("*")
          .eq("status", "active")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setAssociations(allAssociations || []);

        // Fetch user's associations through memberships
        if (user) {
          const { data: memberships } = await supabase
            .from("association_memberships")
            .select("association_id")
            .eq("user_id", user.id);

          if (memberships && memberships.length > 0) {
            const assocIds = memberships.map(m => m.association_id);
            const { data: userAssociations } = await supabase
              .from("associations")
              .select("*")
              .in("id", assocIds);

            setMyAssociations(userAssociations || []);
          }
        }
      } catch (err) {
        console.error("Error fetching associations:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchAssociations();
  }, [user]);

  const filteredAssociations = associations.filter(a => 
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-bold text-foreground">Associations</h1>
            </div>
            <Link to="/associations/create">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New
              </Button>
            </Link>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search associations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="explore" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="explore">Explore</TabsTrigger>
            <TabsTrigger value="my-associations">My Associations</TabsTrigger>
          </TabsList>

          <TabsContent value="explore" className="space-y-4">
            {/* Info Banner */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-gradient-to-r from-gold/10 to-primary/10 border border-gold/20"
            >
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-gold mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Cooperative Associations
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Join or create associations to pool resources and manage collective funds.
                  </p>
                </div>
              </div>
            </motion.div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : filteredAssociations.length > 0 ? (
              <div className="grid gap-4">
                {filteredAssociations.map((association) => (
                  <motion.div
                    key={association.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card rounded-xl border border-border p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{association.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            Created {format(new Date(association.created_at), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                      <Badge variant="success">{association.status}</Badge>
                    </div>
                    
                    {association.description && (
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                        {association.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {association.member_count}/{association.max_members}
                        </span>
                      </div>
                      <Link to={`/associations/${association.id}`}>
                        <Button size="sm" variant="outline">
                          View
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No associations found</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="my-associations" className="space-y-4">
            {myAssociations.length > 0 ? (
              <div className="grid gap-4">
                {myAssociations.map((association) => (
                  <motion.div
                    key={association.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card rounded-xl border border-border p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-gold/10 flex items-center justify-center">
                          <Building2 className="h-6 w-6 text-gold" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{association.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {association.member_count} members
                          </p>
                        </div>
                      </div>
                      {association.admin_id === user?.id && (
                        <Badge variant="gold">Admin</Badge>
                      )}
                    </div>
                    
                    <Link to={`/associations/${association.id}`}>
                      <Button size="sm" variant="outline" className="w-full">
                        View Association
                      </Button>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-4">You're not a member of any associations yet</p>
                <Link to="/associations/create">
                  <Button>Create an Association</Button>
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
