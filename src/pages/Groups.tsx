import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Filter, Users, TrendingUp } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ThriftGroupCard } from "@/components/ThriftGroupCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BottomNav } from "@/components/BottomNav";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useMyGroups, usePoolGroups } from "@/hooks/useThriftGroups";

export default function Groups() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { groups: myGroups, loading: myGroupsLoading } = useMyGroups();
  const { groups: poolGroups, loading: poolGroupsLoading } = usePoolGroups();
  const [searchQuery, setSearchQuery] = useState("");

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const filteredMyGroups = myGroups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPoolGroups = poolGroups
    .filter(group => !group.isMember)
    .filter(group => group.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-foreground">Thrift Groups</h1>
            <Link to="/create-group">
              <Button size="sm">
                <Users className="h-4 w-4 mr-2" />
                New Group
              </Button>
            </Link>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search groups..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="my-groups" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="my-groups">My Groups</TabsTrigger>
            <TabsTrigger value="pool" className="flex items-center gap-2">
              Pool
              <Badge variant="secondary" className="text-xs">
                {filteredPoolGroups.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-groups" className="space-y-4">
            {myGroupsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : filteredMyGroups.length > 0 ? (
              filteredMyGroups.map((group) => (
                <Link key={group.id} to={`/groups/${group.id}`}>
                  <ThriftGroupCard
                    id={group.id}
                    name={group.name}
                    rating={Number(group.rating) || 0}
                    memberCount={group.memberCount}
                    maxMembers={group.max_members}
                    contributionAmount={Number(group.contribution_amount)}
                    period={group.period}
                    isMember={true}
                    isActive={group.status === "active"}
                    isCompleted={group.status === "completed"}
                    pendingRequests={group.pendingRequests}
                    onClick={() => {}}
                  />
                </Link>
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-12"
              >
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">
                  No Groups Yet
                </h3>
                <p className="text-muted-foreground mb-4">
                  Create your first thrift group or join one from the pool
                </p>
                <Link to="/create-group">
                  <Button>Create Group</Button>
                </Link>
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="pool" className="space-y-6">
            {/* Info Banner */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-primary/5 border border-primary/20"
            >
              <div className="flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Gold &amp; Silver members can request to join groups
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Earn an excellent badge (credit score ≥750) to join groups from the pool
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Pool Groups */}
            {poolGroupsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : filteredPoolGroups.length > 0 ? (
              <div className="space-y-4">
                {filteredPoolGroups.map((group) => (
                  <ThriftGroupCard
                    key={group.id}
                    id={group.id}
                    name={group.name}
                    rating={Number(group.rating) || 0}
                    memberCount={group.memberCount}
                    maxMembers={group.max_members}
                    contributionAmount={Number(group.contribution_amount)}
                    period={group.period}
                    isMember={false}
                    isActive={group.status === "active"}
                    isCompleted={group.status === "completed"}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  No groups available in the pool yet
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <BottomNav />
    </div>
  );
}
