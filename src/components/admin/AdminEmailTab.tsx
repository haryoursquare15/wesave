import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Mail, Send, Eye, Loader2, Users, UserX, UserCheck, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { buildEmailPreviewHtml, EMAIL_APP_URL, GROUP_REMINDER_PREVIEW } from "@/lib/emailPreview";
import { RichEmailEditor } from "./RichEmailEditor";

/** Strip tags so we always ship a readable plain-text fallback alongside the HTML. */
const htmlToText = (html: string) =>
  html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-4]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

type Audience = "pending" | "no_group" | "active" | "all";
type EmailType = "reminder" | "custom";

const audienceOptions: { value: Audience; label: string; description: string; icon: React.ReactNode }[] = [
  { value: "pending", label: "Pending Users", description: "Signed up 3+ days ago, no group, not reminded in 7 days", icon: <UserX className="h-4 w-4" /> },
  { value: "no_group", label: "No Group (All)", description: "All users who haven't joined any group", icon: <UserX className="h-4 w-4" /> },
  { value: "active", label: "Active Users", description: "Users who are currently in at least one group", icon: <UserCheck className="h-4 w-4" /> },
  { value: "all", label: "All Users", description: "Every registered user with an email", icon: <Globe className="h-4 w-4" /> },
];

export function AdminEmailTab() {
  const [audience, setAudience] = useState<Audience>("pending");
  const [emailType, setEmailType] = useState<EmailType>("reminder");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; eligible: number; errors?: string[] } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    const plainBody = htmlToText(customBody);
    if (emailType === "custom" && (!customSubject.trim() || !plainBody)) {
      toast({ title: "Missing Fields", description: "Subject and body are required for custom emails.", variant: "destructive" });
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const payload: Record<string, string> = { audience, type: emailType };
      if (emailType === "custom") {
        payload.subject = customSubject;
        payload.body = plainBody;
        payload.bodyHtml = customBody;
      }

      const { data, error } = await supabase.functions.invoke("group-join-reminder", { body: payload });
      if (error) throw error;
      setResult(data);
      toast({
        title: "Emails Sent",
        description: `${data.sent} of ${data.eligible} eligible users emailed.`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const previewHtml = buildEmailPreviewHtml(
    emailType === "custom"
      ? {
          title: customSubject.trim() || "Subject line",
          message: "",
          messageHtml: customBody.trim() || "<p>Your message here...</p>",
          actionUrl: EMAIL_APP_URL,
          actionLabel: "Open Vestara",
        }
      : GROUP_REMINDER_PREVIEW
  );

  const selectedAudience = audienceOptions.find(a => a.value === audience);

  return (
    <div className="space-y-6">
      {/* Email Type & Audience */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Mail className="h-5 w-5" /> Email Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={emailType} onValueChange={(v) => setEmailType(v as EmailType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reminder">Group Join Reminder</SelectItem>
                  <SelectItem value="custom">Custom Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {emailType === "custom" && (
              <>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input placeholder="Email subject line..." value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Body</Label>
                  <RichEmailEditor
                    value={customBody}
                    onChange={setCustomBody}
                    placeholder="Write your message, add images, links and formatting..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Use the toolbar to format text or add an image. Images are hosted automatically so they show up in inboxes.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" /> Audience</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {audienceOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAudience(opt.value)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    audience === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {opt.icon}
                    <span className="font-medium text-sm">{opt.label}</span>
                    {audience === opt.value && <Badge variant="default" className="ml-auto text-xs">Selected</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Send Campaign</CardTitle>
            <div className="flex gap-2">
              <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm"><Eye className="h-4 w-4 mr-1" /> Preview</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Email Preview — {emailType === "custom" ? (customSubject || "Custom") : "Group Join Reminder"}</DialogTitle>
                  </DialogHeader>
                  <div className="border rounded-lg overflow-hidden">
                    <iframe srcDoc={previewHtml} className="w-full h-[640px] border-0 bg-white rounded-md" title="Email Preview" sandbox="" />
                  </div>
                </DialogContent>
              </Dialog>
              <Button size="sm" onClick={handleSend} disabled={sending}>
                {sending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending...</> : <><Send className="h-4 w-4 mr-1" /> Send Now</>}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="outline">{selectedAudience?.label}</Badge>
            <span className="text-sm text-muted-foreground">•</span>
            <Badge variant="secondary">{emailType === "custom" ? "Custom Email" : "Join Reminder"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {emailType === "reminder"
              ? "Sends the branded group-join reminder email to the selected audience."
              : "Sends your custom email to the selected audience. Use the preview to check formatting."}
          </p>

          {result && (
            <div className="space-y-2 mt-4 p-4 rounded-lg bg-muted/50">
              <div className="flex gap-4">
                <Badge variant="outline">{result.eligible} eligible</Badge>
                <Badge variant="default">{result.sent} sent</Badge>
                {result.errors && result.errors.length > 0 && (
                  <Badge variant="destructive">{result.errors.length} failed</Badge>
                )}
              </div>
              {result.errors && result.errors.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto text-xs text-destructive bg-destructive/5 p-3 rounded-lg space-y-1">
                  {result.errors.map((err, i) => <p key={i}>{err}</p>)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
