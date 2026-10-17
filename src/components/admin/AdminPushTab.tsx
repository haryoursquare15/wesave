import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Loader2, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Category = "transactions" | "security" | "marketing";
type Target = "all" | "user";

const categoryOptions: { value: Category; label: string; description: string }[] = [
  { value: "marketing", label: "Offers & updates", description: "Only reaches users who opted in to offers" },
  { value: "transactions", label: "Transactions", description: "Reaches users with transaction alerts on" },
  { value: "security", label: "Security", description: "Always delivered — use only for account security" },
];

export function AdminPushTab() {
  const [target, setTarget] = useState<Target>("all");
  const [userId, setUserId] = useState("");
  const [category, setCategory] = useState<Category>("marketing");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/app");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: "Missing content", description: "Enter a title and message.", variant: "destructive" });
      return;
    }
    if (target === "user" && !userId.trim()) {
      toast({ title: "Missing user", description: "Enter the user ID to send to.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("push-notification", {
        body: {
          action: "admin_send",
          broadcast: target === "all",
          user_id: target === "user" ? userId.trim() : undefined,
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || "/app",
          tag: "vestara-admin",
          category,
        },
      });
      if (error) throw error;
      toast({
        title: "Push sent",
        description: `${data.users} user(s) targeted — ${data.sent} delivered, ${data.failed} failed, ${data.skipped} skipped by preferences.`,
      });
    } catch (err) {
      toast({ title: "Send failed", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" /> Send push notification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Audience</Label>
          <Select value={target} onValueChange={(v) => setTarget(v as Target)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All registered devices</SelectItem>
              <SelectItem value="user">One user (by user ID)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {target === "user" && (
          <div className="space-y-1.5">
            <Label>User ID</Label>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="UUID of the user" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label} — {c.description}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. New: LockMax rates up to 21%" />
        </div>
        <div className="space-y-1.5">
          <Label>Message</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={3} placeholder="Keep it short — no balances or account numbers." />
        </div>
        <div className="space-y-1.5">
          <Label>Open screen (optional)</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/app" />
        </div>
        <Button onClick={() => void send()} disabled={sending} className="w-full sm:w-auto">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? "Sending…" : "Send push"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Android devices always show a privacy-safe generic message; details appear inside the app. User notification preferences are respected except for security alerts.
        </p>
      </CardContent>
    </Card>
  );
}
