import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { Button } from "@/components/ui/button";

type Category = "transactions" | "security" | "marketing";
type Prefs = Record<Category, boolean>;

const LABELS: Record<Category, { label: string; helper: string }> = {
  transactions: { label: "Transactions", helper: "Credits, debits and payment alerts" },
  security: { label: "Security", helper: "Sign-ins and account changes (always on)" },
  marketing: { label: "Offers & updates", helper: "New features and promotions" },
};

export function NotificationPrefs({ userId }: { userId: string | null }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<Category | null>(null);
  const [testing, setTesting] = useState(false);

  const sendTestPush = useCallback(async () => {
    if (!userId) return;
    setTesting(true);
    try {
      const { data, error } = await sandboxSupabase.functions.invoke("push-notification", {
        body: {
          action: "send_push",
          user_id: userId,
          title: "Vestara",
          body: "This is a test notification. You're all set!",
          url: "/app",
          tag: "vestara-test-push",
          category: "security",
        },
      });
      if (error) throw error;
      const fcm = data?.fcm ?? { sent: 0, failed: 0 };
      const web = data?.web ?? { sent: 0, failed: 0 };
      const totalSent = (fcm.sent ?? 0) + (web.sent ?? 0);
      const totalFailed = (fcm.failed ?? 0) + (web.failed ?? 0);
      if (totalSent > 0) {
        toast.success("Test notification sent — check your device.");
      } else if (totalFailed > 0) {
        toast.error("Delivery failed. Make sure notifications are allowed on this device, then try again.");
      } else {
        toast.error("No registered device found. Enable notifications on this device first.");
      }
    } catch {
      toast.error("We couldn't send the test. Please try again.");
    } finally {
      setTesting(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // Auto-creates the row on first read.
    void sandboxSupabase.rpc("get_my_notification_preferences").then(({ data, error }) => {
      if (error || !data) return;
      const row = data as unknown as Prefs;
      setPrefs({ transactions: row.transactions, security: true, marketing: row.marketing });
    });
  }, [userId]);

  const toggle = useCallback(async (category: Category, value: boolean) => {
    if (!userId || !prefs || category === "security") return;
    setSaving(category);
    setPrefs({ ...prefs, [category]: value });
    const { error } = await sandboxSupabase
      .from("notification_preferences" as never)
      .upsert({ user_id: userId, [category]: value } as never, { onConflict: "user_id" });
    if (error) {
      setPrefs({ ...prefs });
      toast.error("We couldn't save that. Please try again.");
    }
    setSaving(null);
  }, [userId, prefs]);

  if (!userId || !prefs) return null;

  return (
    <div className="px-4 py-2 space-y-1 border-t border-border">
      {(Object.keys(LABELS) as Category[]).map((cat) => (
        <div key={cat} className="flex items-center justify-between py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{LABELS[cat].label}</p>
            <p className="text-xs text-muted-foreground">{LABELS[cat].helper}</p>
          </div>
          <Switch
            checked={prefs[cat]}
            disabled={cat === "security" || saving === cat}
            onCheckedChange={(v) => void toggle(cat, v)}
            aria-label={LABELS[cat].label}
          />
        </div>
      ))}
      <div className="py-2">
        <Button variant="outline" size="sm" className="w-full" onClick={() => void sendTestPush()} disabled={testing}>
          {testing ? "Sending…" : "Send test push to this device"}
        </Button>
      </div>
    </div>
  );
}
