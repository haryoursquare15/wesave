import { Card, CardContent } from "@/components/ui/card";

/**
 * Group-wide e-mandate readiness — visible to EVERY member, not just the admin.
 * Shows who has approved their direct-debit mandate and who is holding up
 * commencement. Never renders bank details, credentials or raw VFD payloads.
 */
export interface MandateGateMember {
  user_id: string;
  name: string;
  mandate_status: string; // approved | pending | failed | expired | not_setup | not_required
  mandate_expires_at?: string | null;
}

export interface MandateGate {
  ok: boolean;
  funding_mode: string;
  approved_count: number;
  total_members: number;
  blocking_members: MandateGateMember[];
  members: MandateGateMember[];
}

const STATUS_META: Record<string, { icon: string; label: string; className: string }> = {
  approved: { icon: "🟢", label: "Approved", className: "text-green-600" },
  pending: { icon: "🟡", label: "Pending bank approval", className: "text-warning" },
  failed: { icon: "🔴", label: "Failed", className: "text-destructive" },
  expired: { icon: "🔴", label: "Expired", className: "text-destructive" },
  not_setup: { icon: "⚪", label: "Not yet set up", className: "text-muted-foreground" },
  not_required: { icon: "⚪", label: "Not required", className: "text-muted-foreground" },
};

export function ThriftMandateReadiness({
  gate,
  groupStatus,
  currentUserId,
  isAdmin,
}: {
  gate?: MandateGate | null;
  groupStatus: string;
  currentUserId?: string | null;
  isAdmin?: boolean;
}) {
  if (!gate || gate.funding_mode !== "ddm") return null;

  const { approved_count: approved, total_members: total, blocking_members: blocking, members } = gate;
  const isActive = groupStatus === "active";

  return (
    <Card className={
      isActive && gate.ok ? "border-green-500/40"
        : gate.ok ? "border-green-500/40"
        : "border-warning/50"
    }>
      <CardContent className="p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-bold">
            {isActive && gate.ok ? "🟢 E-MANDATE ACTIVE" : gate.ok ? "✅ THRIFT READY" : "⏳ THRIFT NOT READY"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isActive && gate.ok
              ? `All ${total} members are funding this thrift through approved e-mandates.`
              : gate.ok
                ? `All ${total} members have approved their e-mandates. Your thrift is ready to commence.`
                : `${approved} of ${total} members have approved their e-mandates. The thrift will automatically commence once all members complete e-mandate approval.`}
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            E-Mandate status · {approved} of {total} approved
          </p>
          {members.map((m) => {
            const meta = STATUS_META[m.mandate_status] || STATUS_META.not_setup;
            const isMe = m.user_id === currentUserId;
            return (
              <div key={m.user_id} className="flex items-center justify-between text-xs">
                <span className="font-medium">{isMe ? "You" : m.name}</span>
                <span className={`flex items-center gap-1 ${meta.className}`}>
                  <span aria-hidden>{meta.icon}</span> {meta.label}
                </span>
              </div>
            );
          })}
        </div>

        {!gate.ok && blocking.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Waiting for: {blocking.map((b) => b.name).join(", ")}
          </p>
        )}

        {isAdmin && !isActive && (
          <p className="text-[11px] font-medium">
            Group commencement: {gate.ok ? <span className="text-green-600">READY</span> : <span className="text-destructive">BLOCKED</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
