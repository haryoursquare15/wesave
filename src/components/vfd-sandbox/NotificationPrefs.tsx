import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";
import { useIsAdmin } from "@/hooks/useAdmin";

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

  const sendTest = useCallback(async () => {
    if (!userId) return;
    setTesting(true);
    try {
      const { error } = await sandboxSupabase.functions.invoke("push-notification", {
        body: {
          action: "send_push",
          user_id: userId,
          title: "Vestara test",
          body: "Push notifications are working on this device.",
          url: "/app",
          tag: "vestara-test-push",
          category: "security",
        },
      });
      if (error) throw error;
      toast.success("Test notification sent");
    } catch {
      toast.error("We couldn't send the test. Please try again.");
    } finally {
      setTesting(false);
    }
  }, [userId]);

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
      {userId && (
        <div className="pt-2 pb-1">
          <Button variant="outline" size="sm" className="w-full" disabled={testing} onClick={() => void sendTest()}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send test push
          </Button>
        </div>
      )}
    </div>
  );
}
