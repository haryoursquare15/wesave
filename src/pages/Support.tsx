import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Send, MessageSquare, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottomNav } from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { supportTicketSchema, validateInput } from "@/lib/validation";

const categories = [
  { value: "payment", label: "Payment Issues" },
  { value: "group", label: "Thrift Group Issues" },
  { value: "account", label: "Account Problems" },
  { value: "withdrawal", label: "Withdrawal Issues" },
  { value: "technical", label: "Technical Problems" },
  { value: "other", label: "Other" },
];

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
}

export default function Support() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    async function fetchTickets() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("support_tickets")
          .select("id, subject, category, status, priority, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setTickets(data || []);
      } catch (err) {
        console.error("Error fetching tickets:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchTickets();
  }, [user]);

  const handleSubmit = async () => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }

    // Validate input using zod schema
    const validation = validateInput(supportTicketSchema, { subject, category, description });
    
    if (validation.success === false) {
      toast.error(validation.error);
      return;
    }

    const validatedData = validation.data;
    setValidationErrors({});
    setSubmitting(true);

    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: user.id,
          subject: validatedData.subject,
          category: validatedData.category,
          description: validatedData.description,
          status: "open",
          priority: "medium",
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Support ticket submitted successfully");
      setTickets([data, ...tickets]);
      setShowForm(false);
      setSubject("");
      setCategory("");
      setDescription("");
    } catch (err) {
      console.error("Error submitting ticket:", err);
      toast.error("Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Open</Badge>;
      case "in_progress":
        return <Badge variant="warning"><AlertCircle className="h-3 w-3 mr-1" />In Progress</Badge>;
      case "resolved":
        return <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" />Resolved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background pb-32 safe-bottom">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-bold text-foreground">Support</h1>
            </div>
            {!showForm && (
              <Button size="sm" onClick={() => setShowForm(true)}>
                <MessageSquare className="h-4 w-4 mr-2" />
                New Ticket
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {showForm ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-2xl border border-border p-6"
          >
            <h2 className="text-lg font-semibold text-foreground mb-4">Submit a Support Ticket</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  placeholder="Brief description of your issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Please describe your issue in detail..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                />
              </div>

              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setShowForm(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={submitting || !subject.trim() || !category || !description.trim()}
                  className="flex-1"
                >
                  {submitting ? (
                    <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Submit
                </Button>
              </div>
            </div>
          </motion.div>
        ) : (
          <>
            {/* Info Banner */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-primary/5 border border-primary/20"
            >
              <div className="flex items-start gap-3">
                <MessageSquare className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Need help? We're here for you!
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Submit a ticket and our support team will respond within 24 hours.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Tickets List */}
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1">Your Tickets</h2>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : tickets.length > 0 ? (
                <div className="space-y-3">
                  {tickets.map((ticket) => (
                    <motion.div
                      key={ticket.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-card rounded-xl border border-border p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-medium text-foreground">{ticket.subject}</h3>
                        {getStatusBadge(ticket.status)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="capitalize">{ticket.category}</span>
                        <span>•</span>
                        <span>{format(new Date(ticket.created_at), "MMM d, yyyy")}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No support tickets yet</p>
                  <Button className="mt-4" onClick={() => setShowForm(true)}>
                    Submit Your First Ticket
                  </Button>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
