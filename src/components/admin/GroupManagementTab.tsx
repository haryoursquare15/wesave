import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminGroups } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Search, ChevronDown, ChevronRight, Users, Wallet, Calendar, ExternalLink } from "lucide-react";

interface GroupDetailsRowProps {
  groupId: string;
}

function GroupDetailsRow({ groupId }: GroupDetailsRowProps) {
  const [data, setData] = useState<{ members: any[]; wallet: any; currentCycle: any } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [membersRes, walletRes, cycleRes] = await Promise.all([
          supabase.from("group_memberships")
            .select("*, profiles:user_id(full_name, email)")
            .eq("group_id", groupId),
          supabase.from("group_wallets")
            .select("*")
            .eq("group_id", groupId)
            .maybeSingle(),
          supabase.from("contribution_cycles")
            .select("*")
            .eq("group_id", groupId)
            .eq("status", "active")
            .maybeSingle()
        ]);
        
        setData({
          members: membersRes.data || [],
          wallet: walletRes.data,
          currentCycle: cycleRes.data
        });
      } catch (err) {
        console.error("Error fetching group details:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [groupId]);

  if (loading) {
    return (
      <TableRow>
        <TableCell colSpan={9} className="p-4 bg-muted/30">
          <Skeleton className="h-16 w-full" />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={9} className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Members Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Members ({data?.members.length || 0})
            </h4>
            {data?.members && data.members.length > 0 ? (
              <div className="text-sm space-y-1 max-h-32 overflow-y-auto">
                {data.members.map((membership: any) => (
                  <div key={membership.id} className="flex justify-between items-center">
                    <span className="truncate">{membership.profiles?.full_name || membership.profiles?.email || "Unknown"}</span>
                    <Badge variant="outline" className="text-xs">
                      Pos {membership.payout_position || "—"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No members</p>
            )}
          </div>

          {/* Wallet Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Group Wallet
            </h4>
            {data?.wallet ? (
              <div className="text-sm space-y-1">
                <p>Balance: <span className="font-medium">₦{(data.wallet.contribution_balance || 0).toLocaleString()}</span></p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No wallet data</p>
            )}
          </div>

          {/* Current Cycle Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Current Cycle
            </h4>
            {data?.currentCycle ? (
              <div className="text-sm space-y-1">
                <p>Cycle: <span className="font-medium">#{data.currentCycle.cycle_number}</span></p>
                <p>Status: <Badge variant="outline" className="text-xs capitalize">{data.currentCycle.status}</Badge></p>
                {data.currentCycle.contribution_deadline && (
                  <p>Deadline: <span className="font-medium">{format(new Date(data.currentCycle.contribution_deadline), "MMM d, yyyy")}</span></p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active cycle</p>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function GroupManagementTab() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { groups, loading } = useAdminGroups();

  const filteredGroups = groups.filter(group => {
    const searchLower = search.toLowerCase();
    return (
      group.name?.toLowerCase().includes(searchLower) ||
      group.admin_name?.toLowerCase().includes(searchLower) ||
      group.id.toLowerCase().includes(searchLower)
    );
  });

  const toggleExpanded = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Group Management</CardTitle>
            <CardDescription>View and manage all thrift groups. Click a row to expand details.</CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or admin..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No groups found</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Group Name</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Contribution</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((group) => (
                  <>
                    <TableRow 
                      key={group.id} 
                      className="cursor-pointer hover:bg-muted/50" 
                      onClick={() => toggleExpanded(group.id)}
                    >
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {expandedGroups.has(group.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{group.name}</TableCell>
                      <TableCell>{group.admin_name || "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            group.status === "active"
                              ? "default"
                              : group.status === "completed"
                              ? "secondary"
                              : "outline"
                          }
                          className="capitalize"
                        >
                          {group.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{group.member_count}</TableCell>
                      <TableCell>₦{group.contribution_amount.toLocaleString()}</TableCell>
                      <TableCell className="capitalize">{group.period}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {group.created_at
                          ? format(new Date(group.created_at), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/groups/${group.id}`)}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedGroups.has(group.id) && (
                      <GroupDetailsRow key={`${group.id}-details`} groupId={group.id} />
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
