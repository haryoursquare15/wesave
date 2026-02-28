import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Users, Send, Play, Crown, Check, Clock, 
  MessageSquare, ListOrdered, Settings, Share2, AlertCircle,
  ArrowLeftRight, Info, LogOut, RefreshCw, ThumbsUp, Trophy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

import { BottomNav } from "@/components/BottomNav";
import { TermsGate } from "@/components/TermsGate";
import { AddMembersDialog } from "@/components/AddMembersDialog";
import { SwapPositionDialog, SwapRequestNotification } from "@/components/SwapPositionDialog";
import { GroupProfile } from "@/components/GroupProfile";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  message_type: string;
  created_at: string;
  profiles?: {
    full_name: string | null;
    avatar_url: string | null;
    username: string | null;
  };
}

interface PayoutMember {
  payout_position: number;
  member_user_id: string;
  member_full_name: string;
  member_username: string;
  member_avatar_url: string;
  member_has_received_payout: boolean;
}

interface GroupData {
  id: string;
  name: string;
  description: string | null;
  max_members: number;
  contribution_amount: number;
  period: string;
  status: string;
  admin_id: string;
  current_cycle: number;
  payout_order: string[];
  current_payout_position: number;
  next_contribution_date: string | null;
  created_at: string | null;
  contribution_day_of_month: number | null;
  contribution_day_of_week: number | null;
  contribution_hour: number | null;
  contribution_minute: number | null;
}

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [group, setGroup] = useState<GroupData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [payoutOrder, setPayoutOrder] = useState<PayoutMember[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [commencing, setCommencing] = useState(false);
  const [hasContributed, setHasContributed] = useState(false);
  const [contributing, setContributing] = useState(false);
  const [processingPayout, setProcessingPayout] = useState(false);
  const [cycleHasContributions, setCycleHasContributions] = useState(false);
  const [exitingGroup, setExitingGroup] = useState(false);
  const [restartingGroup, setRestartingGroup] = useState(false);
  const [confirmingContinue, setConfirmingContinue] = useState(false);
  const [showRestartTerms, setShowRestartTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [needsTermsAcceptance, setNeedsTermsAcceptance] = useState(false);

  const isAdmin = group?.admin_id === user?.id;

  // Fetch group data
  useEffect(() => {
    async function fetchGroup() {
      if (!groupId || !user) return;

      try {
        // Fetch group
        const { data: groupData, error: groupError } = await supabase
          .from("thrift_groups")
          .select("*")
          .eq("id", groupId)
          .single();

        if (groupError) throw groupError;
        setGroup(groupData);

        // Fetch member count
        const { count } = await supabase
          .from("group_memberships")
          .select("*", { count: "exact", head: true })
          .eq("group_id", groupId)
          .eq("status", "active");
        
        setMemberCount(count || 0);

        // Check if user needs to accept terms
        const { data: membership } = await supabase
          .from("group_memberships")
          .select("tokenization_completed")
          .eq("group_id", groupId)
          .eq("user_id", user.id)
          .eq("status", "active")
          .single();

        if (membership && !membership.tokenization_completed) {
          setNeedsTermsAcceptance(true);
        }

        // Check if user has contributed this cycle and if any contributions exist
        if (groupData.status === "active") {
          const { data: cycle } = await supabase
            .from("contribution_cycles")
            .select("id")
            .eq("group_id", groupId)
            .eq("status", "active")
            .single();

          if (cycle) {
            // Check user's contribution
            const { data: contrib } = await supabase
              .from("cycle_contributions")
              .select("*")
              .eq("cycle_id", cycle.id)
              .eq("user_id", user.id)
              .eq("status", "completed")
              .single();
            
            setHasContributed(!!contrib);
            
            // Check if any member has contributed (to disable swap)
            const { count: contribCount } = await supabase
              .from("cycle_contributions")
              .select("*", { count: "exact", head: true })
              .eq("cycle_id", cycle.id)
              .eq("status", "completed");
            
            setCycleHasContributions((contribCount || 0) > 0);
          }
        }

        // Fetch payout order
        const { data: orderData } = await supabase.rpc("get_payout_order", {
          target_group_id: groupId,
        });
        
        if (orderData) {
          setPayoutOrder(orderData);
        }

      } catch (err) {
        console.error("Error fetching group:", err);
        toast.error("Failed to load group");
      } finally {
        setLoading(false);
      }
    }

    fetchGroup();
  }, [groupId, user]);

  // Fetch and subscribe to chat messages
  useEffect(() => {
    if (!groupId) return;

    async function fetchMessages() {
      // First fetch messages
      const { data: messagesData } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(100);
      
      if (messagesData) {
        // Fetch profiles for each unique user using secure RPC function
        const userIds = [...new Set(messagesData.map(m => m.user_id))];
        const { data: profiles } = await supabase.rpc("get_public_profiles", { user_ids: userIds });
        
        const profileMap = new Map(profiles?.map((p: { id: string; full_name: string | null; avatar_url: string | null; username: string | null }) => [p.id, p]) || []);
        
        const messagesWithProfiles = messagesData.map(msg => ({
          ...msg,
          profiles: profileMap.get(msg.user_id) || { full_name: null, avatar_url: null, username: null },
        }));
        
        setMessages(messagesWithProfiles);
        // Scroll to bottom
        setTimeout(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        }, 100);
      }
    }

    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `group_id=eq.${groupId}`,
        },
        async (payload) => {
          // Fetch the message with profile using secure RPC function
          const newMsg = payload.new as { id: string; user_id: string; message: string; message_type: string; created_at: string };
          const { data: profiles } = await supabase.rpc("get_public_profile", { target_user_id: newMsg.user_id });
          const profile = profiles?.[0] || null;
          
          const messageWithProfile: ChatMessage = {
            ...newMsg,
            profiles: profile || { full_name: null, avatar_url: null, username: null },
          };
          
          setMessages((prev) => [...prev, messageWithProfile]);
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !groupId) return;

    setSendingMessage(true);
    try {
      const { error } = await supabase.from("chat_messages").insert({
        group_id: groupId,
        user_id: user.id,
        message: newMessage.trim(),
        message_type: "text",
      });

      if (error) throw error;
      setNewMessage("");
    } catch (err) {
      toast.error("Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  };

  const commenceThrift = async () => {
    if (!groupId) return;

    setCommencing(true);
    try {
      const { data, error } = await supabase.rpc("commence_thrift", {
        target_group_id: groupId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; payout_order?: string[] };

      if (result.success) {
        toast.success("Thrift commenced! Payout order has been randomized.");
        // Refresh group data
        const { data: updatedGroup } = await supabase
          .from("thrift_groups")
          .select("*")
          .eq("id", groupId)
          .single();
        
        if (updatedGroup) setGroup(updatedGroup);

        // Refresh payout order
        const { data: orderData } = await supabase.rpc("get_payout_order", {
          target_group_id: groupId,
        });
        if (orderData) setPayoutOrder(orderData as PayoutMember[]);
      } else {
        toast.error(result.error || "Failed to commence thrift");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to commence thrift";
      toast.error(errorMessage);
    } finally {
      setCommencing(false);
    }
  };

  const makeContribution = async () => {
    if (!groupId || !group) return;

    setContributing(true);
    try {
      const { data, error } = await supabase.functions.invoke("flutterwave-payments", {
        body: {
          action: "initiate_contribution",
          groupId,
          amount: group.contribution_amount,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Contribution recorded successfully!");
        setHasContributed(true);
        setCycleHasContributions(true);
        
        // Check if auto-payout was triggered
        if (data.all_contributed && data.auto_payout?.success) {
          toast.success(`🎉 All members contributed! Payout of ₦${data.auto_payout.net_amount?.toLocaleString()} credited to recipient's wallet.`);
          
          // Refresh group data after payout
          const { data: updatedGroup } = await supabase
            .from("thrift_groups")
            .select("*")
            .eq("id", groupId)
            .single();
          
          if (updatedGroup) setGroup(updatedGroup);

          // Refresh payout order
          const { data: orderData } = await supabase.rpc("get_payout_order", {
            target_group_id: groupId,
          });
          if (orderData) setPayoutOrder(orderData as PayoutMember[]);
          
          // Reset contribution status for new cycle
          setHasContributed(false);
          setCycleHasContributions(false);
        } else if (data.all_contributed) {
          toast.info("All members have contributed! Payout processing...");
        }
      } else {
        toast.error(data.error || "Failed to make contribution");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to make contribution";
      toast.error(errorMessage);
    } finally {
      setContributing(false);
    }
  };

  const processPayout = async () => {
    if (!groupId) return;

    setProcessingPayout(true);
    try {
      const { data, error } = await supabase.functions.invoke("flutterwave-payments", {
        body: {
          action: "process_payout",
          groupId,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        
        // Refresh group data
        const { data: updatedGroup } = await supabase
          .from("thrift_groups")
          .select("*")
          .eq("id", groupId)
          .single();
        
        if (updatedGroup) setGroup(updatedGroup);

        // Refresh payout order
        const { data: orderData } = await supabase.rpc("get_payout_order", {
          target_group_id: groupId,
        });
        if (orderData) setPayoutOrder(orderData);
      } else {
        toast.error(data.error || "Failed to process payout");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to process payout";
      toast.error(errorMessage);
    } finally {
      setProcessingPayout(false);
    }
  };

  // Exit a completed group
  const exitGroup = async () => {
    if (!groupId) return;

    setExitingGroup(true);
    try {
      const { data, error } = await supabase.functions.invoke("flutterwave-payments", {
        body: {
          action: "exit_group",
          groupId,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success("You have left the group");
        navigate("/groups");
      } else {
        toast.error(data.error || "Failed to exit group");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to exit group";
      toast.error(errorMessage);
    } finally {
      setExitingGroup(false);
    }
  };

  // Confirm continuing in a completed group
  const confirmContinue = async () => {
    if (!groupId) return;

    setConfirmingContinue(true);
    try {
      const { data, error } = await supabase.functions.invoke("flutterwave-payments", {
        body: {
          action: "confirm_continue",
          groupId,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Your decision to continue has been recorded");
      } else {
        toast.error(data.error || "Failed to confirm");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to confirm";
      toast.error(errorMessage);
    } finally {
      setConfirmingContinue(false);
    }
  };

  // Show restart terms dialog
  const handleRestartClick = () => {
    setShowRestartTerms(true);
    setTermsAccepted(false);
  };

  // Admin restart a completed group
  const restartGroup = async () => {
    if (!groupId || !termsAccepted) return;

    setRestartingGroup(true);
    try {
      const { data, error } = await supabase.functions.invoke("flutterwave-payments", {
        body: {
          action: "restart_group",
          groupId,
          termsAccepted: true,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success("Group restarted! New cycle has begun.");
        setShowRestartTerms(false);
        
        // Refresh group data
        const { data: updatedGroup } = await supabase
          .from("thrift_groups")
          .select("*")
          .eq("id", groupId)
          .single();
        
        if (updatedGroup) setGroup(updatedGroup);

        // Refresh payout order
        const { data: orderData } = await supabase.rpc("get_payout_order", {
          target_group_id: groupId,
        });
        if (orderData) setPayoutOrder(orderData as PayoutMember[]);

        // Refresh member count
        const { count } = await supabase
          .from("group_memberships")
          .select("*", { count: "exact", head: true })
          .eq("group_id", groupId)
          .eq("status", "active");
        setMemberCount(count || 0);
      } else {
        toast.error(data.error || "Failed to restart group");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to restart group";
      toast.error(errorMessage);
    } finally {
      setRestartingGroup(false);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold mb-2">Group Not Found</h1>
        <p className="text-muted-foreground mb-4">This group doesn't exist or you don't have access.</p>
        <Button onClick={() => navigate("/groups")}>Back to Groups</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="font-semibold text-foreground">{group.name}</h1>
              <p className="text-xs text-muted-foreground">
                {memberCount}/{group.max_members} members • ₦{group.contribution_amount.toLocaleString()}/{group.period}
              </p>
            </div>
            <Badge variant={group.status === "active" ? "success" : group.status === "pending" ? "secondary" : "outline"}>
              {group.status}
            </Badge>
            {isAdmin && (
              <AddMembersDialog
                groupId={group.id}
                groupName={group.name}
                onMemberAdded={() => {
                  supabase
                    .from("group_memberships")
                    .select("*", { count: "exact", head: true })
                    .eq("group_id", group.id)
                    .eq("status", "active")
                    .then(({ count }) => setMemberCount(count || 0));
                }}
              >
                <Button variant="ghost" size="icon">
                  <Share2 className="h-5 w-5" />
                </Button>
              </AddMembersDialog>
            )}
          </div>
        </div>
      </header>

      {/* Terms Gate — blocks group content until terms accepted */}
      {needsTermsAcceptance ? (
        <>
          <TermsGate
            groupId={group.id}
            groupName={group.name}
            contributionAmount={group.contribution_amount}
            period={group.period}
            onComplete={async () => {
              setNeedsTermsAcceptance(false);
              const [{ data: updatedGroup }, { count }, { data: orderData }] = await Promise.all([
                supabase.from("thrift_groups").select("*").eq("id", groupId!).single(),
                supabase.from("group_memberships").select("*", { count: "exact", head: true }).eq("group_id", groupId!).eq("status", "active").then(r => ({ count: r.count })),
                supabase.rpc("get_payout_order", { target_group_id: groupId! }),
              ]);
              if (updatedGroup) setGroup(updatedGroup);
              setMemberCount(count || 0);
              if (orderData) setPayoutOrder(orderData as PayoutMember[]);
            }}
          />
          <BottomNav />
        </>
      ) : (
      <>

      {/* Admin Actions - Only show if group is full */}
      {isAdmin && group.status === "pending" && memberCount === group.max_members && (
        <div className="container mx-auto px-4 py-3">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-primary/10 rounded-xl p-4 flex items-center justify-between"
          >
            <div>
              <h3 className="font-medium text-foreground">Ready to start!</h3>
              <p className="text-sm text-muted-foreground">
                Group is full ({memberCount}/{group.max_members}). Click to commence thrift.
              </p>
            </div>
            <Button onClick={commenceThrift} disabled={commencing} variant="hero">
              {commencing ? (
                <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Commence
                </>
              )}
            </Button>
          </motion.div>
        </div>
      )}

      {/* Waiting for more members */}
      {isAdmin && group.status === "pending" && memberCount < group.max_members && (
        <div className="container mx-auto px-4 py-3">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-muted rounded-xl p-4"
          >
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <h3 className="font-medium text-foreground">Waiting for members</h3>
                <p className="text-sm text-muted-foreground">
                  {memberCount}/{group.max_members} members joined. Group must be full to commence.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Group Completed - Continue or Exit Decision */}
      {group.status === "completed" && (
        <div className="container mx-auto px-4 py-3">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-success/10 to-gold/10 rounded-xl p-4 border border-success/30"
          >
            <div className="flex items-center gap-3 mb-4">
              <Trophy className="h-6 w-6 text-gold" />
              <div>
                <h3 className="font-semibold text-foreground">🎉 All Cycles Complete!</h3>
                <p className="text-sm text-muted-foreground">
                  Everyone has received their payout. What would you like to do next?
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Admin can restart if group has enough members */}
              {isAdmin && memberCount >= group.max_members && (
                <Button 
                  onClick={handleRestartClick} 
                  variant="hero"
                  className="flex-1"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Restart Group
                </Button>
              )}
              
              {isAdmin && memberCount < group.max_members && (
                <div className="flex-1 text-center p-2 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Waiting for {group.max_members - memberCount} more member(s) to restart
                  </p>
                </div>
              )}

              {!isAdmin && (
                <Button 
                  onClick={confirmContinue} 
                  disabled={confirmingContinue}
                  variant="default"
                  className="flex-1"
                >
                  {confirmingContinue ? (
                    <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <>
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      Continue
                    </>
                  )}
                </Button>
              )}

              <Button 
                onClick={exitGroup} 
                disabled={exitingGroup}
                variant="outline"
                className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
              >
                {exitingGroup ? (
                  <div className="h-4 w-4 border-2 border-destructive/30 border-t-destructive rounded-full animate-spin" />
                ) : (
                  <>
                    <LogOut className="h-4 w-4 mr-2" />
                    Exit Group
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Swap Request Notifications */}
      {group.status === "active" && (
        <div className="container mx-auto px-4">
          <SwapRequestNotification groupId={group.id} />
        </div>
      )}

      {/* Contribution Action */}
      {group.status === "active" && !hasContributed && (
        <div className="container mx-auto px-4 py-3">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gold/10 rounded-xl p-4 flex items-center justify-between"
          >
            <div>
              <h3 className="font-medium text-foreground">Contribution Due</h3>
              <p className="text-sm text-muted-foreground">
                Cycle {group.current_cycle} • ₦{group.contribution_amount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">Card payments may include processor charges. A platform fee may apply to group payouts.</p>
            </div>
            <Button onClick={makeContribution} disabled={contributing} variant="gold">
              {contributing ? (
                <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                "Contribute"
              )}
            </Button>
          </motion.div>
        </div>
      )}

      {/* Remove manual payout button - payouts are now automatic */}

      {/* Tabs */}
      <Tabs defaultValue="chat" className="flex-1">
        <div className="container mx-auto px-4">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="chat" className="flex-1">
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="order" className="flex-1">
              <ListOrdered className="h-4 w-4 mr-2" />
              Order
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex-1">
              <Info className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chat" className="mt-0">
          <div className="container mx-auto px-4 flex flex-col" style={{ height: "calc(100vh - 320px)" }}>
            {/* Messages */}
            <ScrollArea ref={scrollRef} className="flex-1 py-4">
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${msg.user_id === user?.id ? "flex-row-reverse" : ""}`}
                    >
                      {msg.message_type === "system" || msg.message_type === "contribution_status" || msg.message_type === "payout_notification" || msg.message_type === "card_fallback_success" || msg.message_type === "contribution_defaulted" ? (
                        <div className="w-full text-center">
                          <Badge 
                            variant={
                              msg.message_type === "payout_notification" || msg.message_type === "card_fallback_success" 
                                ? "success" 
                                : msg.message_type === "contribution_defaulted" 
                                  ? "destructive" 
                                  : "secondary"
                            } 
                            className={`text-xs ${msg.message_type === "contribution_defaulted" ? "bg-destructive/10 text-destructive border-destructive/20" : ""}`}
                          >
                            {msg.message}
                          </Badge>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {format(new Date(msg.created_at), "MMM d, h:mm a")}
                          </p>
                        </div>
                      ) : (
                        <>
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={msg.profiles?.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {getInitials(msg.profiles?.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`max-w-[75%] ${msg.user_id === user?.id ? "text-right" : ""}`}>
                            <p className="text-xs text-muted-foreground mb-1">
                              {msg.profiles?.username ? `@${msg.profiles.username}` : msg.profiles?.full_name || "Unknown"}
                            </p>
                            <div
                              className={`rounded-2xl px-4 py-2 ${
                                msg.user_id === user?.id
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <p className="text-sm">{msg.message}</p>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {format(new Date(msg.created_at), "h:mm a")}
                            </p>
                          </div>
                        </>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="py-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={sendingMessage}
                />
                <Button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || sendingMessage}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="order" className="mt-0">
          <div className="container mx-auto px-4 py-4">
            {/* Swap Position Button - disabled once contributions start */}
            {group.status === "active" && payoutOrder.length > 0 && user && (
              <div className="mb-4">
                {cycleHasContributions ? (
                  <Button variant="outline" className="w-full" disabled>
                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                    Swap Disabled (Contributions Started)
                  </Button>
                ) : (
                  <SwapPositionDialog
                    groupId={group.id}
                    currentUserId={user.id}
                    payoutOrder={payoutOrder}
                  >
                    <Button variant="outline" className="w-full">
                      <ArrowLeftRight className="h-4 w-4 mr-2" />
                      Swap Position
                    </Button>
                  </SwapPositionDialog>
                )}
              </div>
            )}

            {payoutOrder.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <ListOrdered className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Payout order will be shown once thrift commences.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {payoutOrder.map((member, index) => {
                  const isCurrentRecipient = index + 1 === group?.current_payout_position;
                  const hasPaidOut = member.member_has_received_payout;
                  
                  return (
                    <motion.div
                      key={member.member_user_id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`flex items-center gap-3 p-4 rounded-xl border ${
                        isCurrentRecipient
                          ? "border-primary bg-primary/5"
                          : hasPaidOut
                          ? "border-success/30 bg-success/5"
                          : "border-border bg-card"
                      }`}
                    >
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        isCurrentRecipient
                          ? "bg-primary text-primary-foreground"
                          : hasPaidOut
                          ? "bg-success/20 text-success"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {index + 1}
                      </div>
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.member_avatar_url || undefined} />
                        <AvatarFallback>
                          {getInitials(member.member_full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">
                            {member.member_full_name || member.member_username || "Unknown"}
                          </p>
                          {member.member_user_id === group?.admin_id && (
                            <Crown className="h-4 w-4 text-gold" />
                          )}
                        </div>
                        {member.member_username && (
                          <p className="text-xs text-muted-foreground">@{member.member_username}</p>
                        )}
                      </div>
                      {hasPaidOut ? (
                        <Badge variant="success" className="gap-1">
                          <Check className="h-3 w-3" />
                          Paid
                        </Badge>
                      ) : isCurrentRecipient ? (
                        <Badge variant="default" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Next
                        </Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Service Fee Notice */}
            <div className="mt-6 p-4 rounded-xl bg-muted/50 text-center">
              <p className="text-xs text-muted-foreground">
                A platform fee applies to each payout: ₦100 flat for payouts under ₦20,000, or 1% (capped at ₦500) for payouts of ₦20,000 and above.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Group Profile Tab */}
        <TabsContent value="profile" className="mt-0">
          <div className="container mx-auto px-4 py-4">
            <GroupProfile
              groupId={group.id}
              group={group}
              memberCount={memberCount}
              onGroupUpdated={async () => {
                const { data: updatedGroup } = await supabase
                  .from("thrift_groups")
                  .select("*")
                  .eq("id", group.id)
                  .single();
                if (updatedGroup) setGroup(updatedGroup);
              }}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Restart Terms Dialog */}
      <Dialog open={showRestartTerms} onOpenChange={setShowRestartTerms}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart Group - Terms & Conditions</DialogTitle>
            <DialogDescription>
              Please review and accept the terms before restarting the group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-4 rounded-lg bg-muted/50 space-y-3 text-sm">
              <p>By restarting this thrift group, you agree to:</p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li>A new payout order will be randomized for all members</li>
                <li>All members must contribute according to the schedule</li>
                <li>No platform fee is charged on internal rotation payouts</li>
                <li>Members who fail to contribute may be penalized</li>
                <li>The group admin is responsible for managing disputes</li>
              </ul>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="terms" 
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              />
              <label
                htmlFor="terms"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I accept the terms and conditions
              </label>
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setShowRestartTerms(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={restartGroup}
                disabled={!termsAccepted || restartingGroup}
                className="flex-1"
              >
                {restartingGroup ? (
                  <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Restart Group
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
      </>
      )}
    </div>
  );
}
