import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Filter, Users, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { ThriftGroupCard } from "@/components/ThriftGroupCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BottomNav } from "@/components/BottomNav";
import { Badge } from "@/components/ui/badge";

// Mock data
const myGroups = [
  {
    id: "1",
    name: "Family Savings Circle",
    rating: 4.5,
    memberCount: 5,
    maxMembers: 6,
    contributionAmount: 50000,
    period: "weekly" as const,
    isMember: true,
    isActive: true,
    pendingRequests: 2,
  },
  {
    id: "2",
    name: "Office Thrift Club",
    rating: 4.8,
    memberCount: 10,
    maxMembers: 10,
    contributionAmount: 25000,
    period: "monthly" as const,
    isMember: true,
    isActive: true,
    pendingRequests: 0,
  },
];

const poolGroups = [
  {
    id: "3",
    name: "Lagos Savers Network",
    rating: 4.9,
    memberCount: 15,
    maxMembers: 15,
    contributionAmount: 100000,
    period: "monthly" as const,
    isMember: false,
    isActive: false,
  },
  {
    id: "4",
    name: "Tech Bros Thrift",
    rating: 4.2,
    memberCount: 8,
    maxMembers: 8,
    contributionAmount: 75000,
    period: "weekly" as const,
    isMember: false,
    isActive: true,
  },
  {
    id: "5",
    name: "Hustlers Fund",
    rating: 3.8,
    memberCount: 12,
    maxMembers: 12,
    contributionAmount: 30000,
    period: "daily" as const,
    isMember: false,
    isActive: false,
  },
];

export default function Groups() {
  const [searchQuery, setSearchQuery] = useState("");

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
                {poolGroups.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-groups" className="space-y-4">
            {myGroups.length > 0 ? (
              myGroups.map((group) => (
                <Link key={group.id} to={`/groups/${group.id}`}>
                  <ThriftGroupCard {...group} onClick={() => {}} />
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
                    Gold members can request to join groups
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Complete 2 successful thrift cycles to earn your Gold badge
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Pool Groups */}
            <div className="space-y-4">
              {poolGroups.map((group) => (
                <ThriftGroupCard key={group.id} {...group} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <BottomNav />
    </div>
  );
}
