import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface HealthRow {
  healthy: boolean;
  account_scoped_ok: boolean;
  token_mint_ok: boolean;
  checked_at: string;
}

/**
 * Customer-facing banking service status.
 *
 * Driven entirely by the 15-minute VFD credential health check: the banner
 * stays up until an account-scoped wallet call (enquiry/transfer path) really
 * returns success, so a partial recovery (token mints, but account calls are
 * denied) never shows a false "all clear".
 */
export function ServiceStatusBanner() {
  const [row, setRow] = useState<HealthRow | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from("vfd_credential_health")
        .select("healthy, account_scoped_ok, token_mint_ok, checked_at")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active) setRow((data as HealthRow) || null);
    };

    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!row || row.healthy) return null;

  return (
    <div
      role="status"
      className="bg-destructive/10 border-b border-destructive/30 text-destructive px-4 py-2"
    >
      <div className="max-w-lg mx-auto flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <p className="text-xs leading-relaxed">
          <span className="font-semibold">Transactions temporarily paused.</span>{" "}
          Our banking partner is restoring access, so deposits, transfers and bill
          payments may fail right now. Your balances and savings are safe — we'll
          lift this notice as soon as service is confirmed working.
        </p>
      </div>
    </div>
  );
}
