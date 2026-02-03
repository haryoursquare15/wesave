import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Users, Send, Play, Crown, Check, Clock, 
  MessageSquare, ListOrdered, Settings, Share2, AlertCircle,
  ArrowLeftRight, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { BottomNav } from "@/components/BottomNav";
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

        // Check if user has contributed this cycle
        if (groupData.status === "active") {
          const { data: cycle } = await supabase
            .from("contribution_cycles")
            .select("id")
            .eq("group_id", groupId)
            .eq("status", "active")
            .single();

          if (cycle) {
            const { data: contrib } = await supabase
              .from("cycle_contributions")
              .select("*")
              .eq("cycle_id", cycle.id)
              .eq("user_id", user.id)
              .eq("status", "completed")
              .single();
            
            setHasContributed(!!contrib);
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
        // Fetch profiles for each unique user
        const userIds = [...new Set(messagesData.map(m => m.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, username")
          .in("id", userIds);
        
        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        
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
          // Fetch the message with profile
          const newMsg = payload.new as { id: string; user_id: string; message: string; message_type: string; created_at: string };
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url, username")
            .eq("id", newMsg.user_id)
            .single();
          
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
        
        if (data.all_contributed) {
          toast.info("All members have contributed! Admin can now process payout.");
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

      {/* Payout Action for Admin */}
      {isAdmin && group.status === "active" && hasContributed && (
        <div className="container mx-auto px-4 py-3">
          <Button
            onClick={processPayout}
            disabled={processingPayout}
            className="w-full"
            variant="hero"
          >
            {processingPayout ? (
              <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
            ) : null}
            Process Payout
          </Button>
        </div>
      )}

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
                      {msg.message_type === "system" || msg.message_type === "contribution_status" || msg.message_type === "payout_notification" ? (
                        <div className="w-full text-center">
                          <Badge variant={msg.message_type === "payout_notification" ? "success" : "secondary"} className="text-xs">
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
            {/* Swap Position Button */}
            {group.status === "active" && payoutOrder.length > 0 && user && (
              <div className="mb-4">
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
                A 2% platform service fee is deducted from each payout.
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
            />
          </div>
        </TabsContent>
      </Tabs>
      <BottomNav />
    </div>
  );
}
