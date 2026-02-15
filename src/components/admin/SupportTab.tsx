import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { MessageSquare, Clock, CheckCircle, AlertCircle, Send, ChevronDown, ChevronUp, User } from "lucide-react";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
}

interface Comment {
  id: string;
  comment: string;
  author_id: string;
  is_internal: boolean;
  created_at: string;
  author_name?: string;
}

export function SupportTab() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch user profiles for tickets
      const userIds = [...new Set((data || []).map(t => t.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      setTickets((data || []).map(t => ({
        ...t,
        user_email: profileMap.get(t.user_id)?.email || "Unknown",
        user_name: profileMap.get(t.user_id)?.full_name || "Unknown User",
      })));
    } catch (err) {
      console.error("Error fetching tickets:", err);
      toast.error("Failed to load support tickets");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const fetchComments = async (ticketId: string) => {
    try {
      const { data, error } = await supabase
        .from("support_ticket_comments")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const authorIds = [...new Set((data || []).map(c => c.author_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", authorIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      setComments(prev => ({
        ...prev,
        [ticketId]: (data || []).map(c => ({
          ...c,
          author_name: profileMap.get(c.author_id)?.full_name || "Admin",
        })),
      }));
    } catch (err) {
      console.error("Error fetching comments:", err);
    }
  };

  const toggleTicket = (ticketId: string) => {
    if (expandedTicket === ticketId) {
      setExpandedTicket(null);
    } else {
      setExpandedTicket(ticketId);
      if (!comments[ticketId]) {
        fetchComments(ticketId);
      }
    }
  };

  const handleReply = async (ticketId: string) => {
    if (!user || !replyText[ticketId]?.trim()) return;
    setSubmitting(ticketId);

    try {
      const { error } = await supabase
        .from("support_ticket_comments")
        .insert({
          ticket_id: ticketId,
          author_id: user.id,
          comment: replyText[ticketId].trim(),
          is_internal: false,
        });

      if (error) throw error;

      toast.success("Reply sent");
      setReplyText(prev => ({ ...prev, [ticketId]: "" }));
      fetchComments(ticketId);
    } catch (err) {
      console.error("Error sending reply:", err);
      toast.error("Failed to send reply");
    } finally {
      setSubmitting(null);
    }
  };

  const updateStatus = async (ticketId: string, newStatus: string) => {
    try {
      const updateData: Record<string, string> = { status: newStatus };
      if (newStatus === "resolved") {
        updateData.resolved_at = new Date().toISOString();
      }
      if (newStatus === "in_progress" && user) {
        updateData.assigned_to = user.id;
      }

      const { error } = await supabase
        .from("support_tickets")
        .update(updateData)
        .eq("id", ticketId);

      if (error) throw error;

      toast.success(`Ticket marked as ${newStatus.replace("_", " ")}`);
      fetchTickets();
    } catch (err) {
      console.error("Error updating ticket:", err);
      toast.error("Failed to update ticket status");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Open</Badge>;
      case "in_progress":
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><AlertCircle className="h-3 w-3 mr-1" />In Progress</Badge>;
      case "resolved":
        return <Badge variant="outline" className="border-green-500 text-green-600"><CheckCircle className="h-3 w-3 mr-1" />Resolved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-muted text-muted-foreground",
      medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
      high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
      urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    };
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[priority] || colors.medium}`}>{priority}</span>;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Support Tickets ({tickets.length})
        </h2>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tickets</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {tickets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No tickets found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => (
            <div key={ticket.id} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Ticket Header */}
              <button
                onClick={() => toggleTicket(ticket.id)}
                className="w-full p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-foreground truncate">{ticket.subject}</h3>
                      {getPriorityBadge(ticket.priority)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{ticket.user_name}</span>
                      <span>•</span>
                      <span className="capitalize">{ticket.category}</span>
                      <span>•</span>
                      <span>{format(new Date(ticket.created_at), "MMM d, yyyy h:mm a")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(ticket.status)}
                    {expandedTicket === ticket.id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded Content */}
              {expandedTicket === ticket.id && (
                <div className="border-t border-border p-4 space-y-4">
                  {/* Description */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description}</p>
                  </div>

                  {/* Status Actions */}
                  <div className="flex gap-2">
                    {ticket.status === "open" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(ticket.id, "in_progress")}>
                        Mark In Progress
                      </Button>
                    )}
                    {ticket.status !== "resolved" && (
                      <Button size="sm" variant="outline" className="border-green-500 text-green-600 hover:bg-green-50" onClick={() => updateStatus(ticket.id, "resolved")}>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Resolve
                      </Button>
                    )}
                    {ticket.status === "resolved" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(ticket.id, "open")}>
                        Reopen
                      </Button>
                    )}
                  </div>

                  {/* Comments */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Conversation ({comments[ticket.id]?.length || 0})
                    </p>
                    {(comments[ticket.id] || []).length > 0 ? (
                      <div className="space-y-2 mb-3">
                        {comments[ticket.id].map(comment => (
                          <div key={comment.id} className={`p-3 rounded-lg text-sm ${
                            comment.author_id === ticket.user_id
                              ? "bg-muted"
                              : "bg-primary/10 border border-primary/20"
                          }`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-xs">
                                {comment.author_id === ticket.user_id ? ticket.user_name : `Admin: ${comment.author_name}`}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(comment.created_at), "MMM d, h:mm a")}
                              </span>
                            </div>
                            <p className="text-foreground">{comment.comment}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mb-3">No replies yet</p>
                    )}

                    {/* Reply Box */}
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Type your reply..."
                        value={replyText[ticket.id] || ""}
                        onChange={(e) => setReplyText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                        rows={2}
                        className="flex-1"
                      />
                      <Button
                        size="icon"
                        onClick={() => handleReply(ticket.id)}
                        disabled={!replyText[ticket.id]?.trim() || submitting === ticket.id}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
