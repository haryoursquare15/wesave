import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { sandboxSupabase as supabase } from "@/integrations/supabase/sandboxClient";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Normalise Nigerian numbers to E.164 digits (no "+"), e.g. 08031234567 -> 2348031234567
function normalise(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0") && d.length === 11) d = "234" + d.slice(1);
  return /^[0-9]{10,15}$/.test(d) ? d : null;
}

export function WhatsAppAlertSettings() {
  const [user, setUser] = useState<{ id: string } | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUser(data.user)); }, []);
  const [phone, setPhone] = useState("");
  const [optedIn, setOptedIn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("whatsapp_preferences" as never).select("phone, opted_in").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        const row = data as { phone: string; opted_in: boolean } | null;
        if (row) { setPhone(row.phone); setOptedIn(row.opted_in); }
      });
  }, [user]);

  const save = async (nextOptIn: boolean) => {
    if (!user) return;
    const p = normalise(phone);
    if (!p) { toast.error("Enter a valid WhatsApp number, e.g. 08031234567"); return; }
    setBusy(true);
    const { error } = await supabase.from("whatsapp_preferences" as never)
      .upsert({ user_id: user.id, phone: p, opted_in: nextOptIn, updated_at: new Date().toISOString() } as never);
    setBusy(false);
    if (error) { toast.error("Couldn't save your WhatsApp setting. Please try again."); return; }
    setPhone(p); setOptedIn(nextOptIn);
    toast.success(nextOptIn ? "WhatsApp alerts turned on" : "WhatsApp alerts turned off");
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-4 mt-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground">WhatsApp Alerts</p>
            <p className="text-xs text-muted-foreground">Money in/out, bills, thrift and savings updates</p>
          </div>
        </div>
        <Switch checked={optedIn} disabled={busy} onCheckedChange={(v) => save(v)} />
      </div>
      <div className="flex gap-2">
        <Input inputMode="tel" placeholder="WhatsApp number" value={phone}
          onChange={(e) => setPhone(e.target.value)} className="h-11" />
        <Button variant="outline" className="h-11" disabled={busy} onClick={() => save(optedIn)}>Save</Button>
      </div>
    </div>
  );
}
