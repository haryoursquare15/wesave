import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { sandboxSupabase } from "@/integrations/supabase/sandboxClient";

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
    </div>
  );
}
