import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Mail, Send, Eye, Loader2, Users, UserX, UserCheck, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
    if (emailType === "custom" && (!customSubject.trim() || !customBody.trim())) {
      toast({ title: "Missing Fields", description: "Subject and body are required for custom emails.", variant: "destructive" });
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const payload: Record<string, string> = { audience, type: emailType };
      if (emailType === "custom") {
        payload.subject = customSubject;
        payload.body = customBody;
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

  const previewHtml = emailType === "custom"
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;">
          <tr><td align="center" style="padding:40px 20px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
              <tr><td style="background-color:#E8621A;padding:24px 30px;"><h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Vestara</h1></td></tr>
              <tr><td style="padding:30px;">
                <h2 style="margin:0 0 12px;color:#1a1a1a;font-size:18px;font-weight:600;">Hi John 👋</h2>
                <div style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">${(customBody || "Your message here...").replace(/\n/g, "<br/>")}</div>
                <a href="#" style="display:inline-block;background-color:#E8621A;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Open Vestara</a>
              </td></tr>
              <tr><td style="padding:20px 30px;border-top:1px solid #e5e7eb;"><p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">You're receiving this because you have an account on Vestara.</p></td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>`
    : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;">
          <tr><td align="center" style="padding:40px 20px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
              <tr><td style="background-color:#E8621A;padding:24px 30px;"><h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Vestara</h1></td></tr>
              <tr><td style="padding:30px;">
                <h2 style="margin:0 0 12px;color:#1a1a1a;font-size:18px;font-weight:600;">Hey John, you're missing out! 👋</h2>
                <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">You signed up for Vestara but haven't joined a savings group yet. Here's what you're missing:</p>
                <ul style="margin:0 0 20px;padding-left:20px;color:#4b5563;font-size:15px;line-height:1.8;">
                  <li><strong>Save Together</strong> — Join a group and contribute alongside trusted members</li>
                  <li><strong>Earn Payouts</strong> — Receive your lump-sum payout when it's your turn</li>
                  <li><strong>Build Credit</strong> — Boost your Vestara credit score with every on-time contribution</li>
                  <li><strong>Zero Fees to Join</strong> — Getting started is completely free</li>
                </ul>
                <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">It only takes a minute to create or join a group. Start saving smarter today!</p>
                <a href="#" style="display:inline-block;background-color:#E8621A;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Explore Groups</a>
              </td></tr>
              <tr><td style="padding:20px 30px;border-top:1px solid #e5e7eb;"><p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">You're receiving this because you have an account on Vestara.</p></td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>`;

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
                  <Textarea placeholder="Email body content..." rows={6} value={customBody} onChange={(e) => setCustomBody(e.target.value)} />
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
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Email Preview — {emailType === "custom" ? (customSubject || "Custom") : "Group Join Reminder"}</DialogTitle>
                  </DialogHeader>
                  <div className="border rounded-lg overflow-hidden">
                    <iframe srcDoc={previewHtml} className="w-full h-[500px] border-0" title="Email Preview" sandbox="" />
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
