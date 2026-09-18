import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useVfdSandboxProducts } from "@/hooks/useVfdSandboxProducts";
import { useSandboxAwareAuth } from "@/hooks/useSandboxAwareAuth";
import {
  Users, Plus, RefreshCw, ArrowRight, ArrowLeft, Play, Crown,
  ListOrdered, Coins, Calendar, Info, LogOut, AlertCircle, ArrowLeftRight, Share2,
} from "lucide-react";
import { SandboxGroupInviteDialog } from "./SandboxGroupInviteDialog";
import { SandboxGroupChat } from "./SandboxGroupChat";
import { MandateAuthorizationDialog } from "./MandateAuthorizationDialog";
import { MandateStatusCard } from "./MandateStatusCard";
import { useMandates } from "@/hooks/useMandates";
import { ThriftMandateReadiness } from "./ThriftMandateReadiness";
import { Settings as SettingsIcon, MessageSquare, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import { getUserFriendlyError } from "@/lib/errorMessages";
interface Group {
  id: string; name: string; contribution_amount: number; period: string;
  max_members: number; member_count: number; current_cycle: number;
  total_cycles: number; status: string; admin_id: string;
  auto_debit?: boolean;
  funding_mode?: "wallet" | "ddm";
  mandate_status?: string;
  mandate_reference?: string | null;
  contribution_hour?: number; contribution_minute?: number;
  contribution_day_of_week?: number; contribution_day_of_month?: number;
  commenced_at?: string;
  swap_window_ends_at?: string | null;
  is_full_at?: string | null;
  vfd_sandbox_group_members?: { user_id: string; payout_position?: number; has_contributed_current?: boolean; has_received_payout?: boolean; mandate_status?: string; mandate_reference?: string | null }[];
}

const daysOfWeek = [
  { value: 0, label: "Sunday" }, { value: 1, label: "Monday" }, { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" }, { value: 4, label: "Thursday" }, { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const timeSlots = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = (i % 2) * 30;
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const amPm = hour < 12 ? "AM" : "PM";
  return { value: i, hour, minute, label: `${displayHour}:${minute === 0 ? "00" : "30"} ${amPm}` };
});

const daysOfMonth = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1, label: `${i + 1}${["st", "nd", "rd"][i] || "th"}`,
}));

function calculatePlatformFee(pool: number) {
  if (pool < 20000) return 100;
  return Math.min(pool * 0.01, 500);
}

const fmt = (n: number) => new Intl.NumberFormat("en-NG").format(n);

/** Live 3-minute countdown shown while the group is in `swap_window`.
 * When the countdown reaches zero the parent's `onElapsed` is called once
 * (idempotent) so the backend can promote the group to `active`. */
function SwapWindowBanner({ endsAt, onElapsed }: { endsAt?: string | null; onElapsed: () => void | Promise<void> }) {
  const [remaining, setRemaining] = useState<number>(() => {
    if (!endsAt) return 0;
    return Math.max(0, new Date(endsAt).getTime() - Date.now());
  });
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!endsAt) return;
    const tick = () => {
      const ms = Math.max(0, new Date(endsAt).getTime() - Date.now());
      setRemaining(ms);
      if (ms === 0 && !triggeredRef.current) {
        triggeredRef.current = true;
        void onElapsed();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt, onElapsed]);

  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const pct = endsAt ? Math.max(0, Math.min(100, (remaining / (3 * 60 * 1000)) * 100)) : 0;

  return (
    <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-warning-foreground">
          🎲 Group is full — payout positions randomized
        </p>
        <span className="text-sm font-mono font-bold tabular-nums">
          {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <p className="text-[11px] text-muted-foreground">
        You have until the timer ends to request a position swap. Each member can swap once.
        The thrift will start automatically when this window closes.
      </p>
    </div>
  );
}


export function SandboxAjoTab() {
  const { toast } = useToast();
  const products = useVfdSandboxProducts();
  const { session } = useSandboxAwareAuth();
  const currentUserId = session?.user?.id;
  const [groups, setGroups] = useState<Group[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [detailGroup, setDetailGroup] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [inviteGate, setInviteGate] = useState<{ invite: any; group: Group } | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [mandateGroup, setMandateGroup] = useState<Group | null>(null);
  const { findFor: findMandate, refresh: refreshMandates } = useMandates();
  const [mandateBusy, setMandateBusy] = useState(false);

  const AJO_DDM_FEE = 100;

  const acceptMandate = async () => {
    if (!mandateGroup) return;
    setMandateBusy(true);
    const res = await products.acceptGroupMandate(mandateGroup.id);
    setMandateBusy(false);
    if (res?.data?.success) {
      toast({
        title: "E-Mandate Authorized",
        description: `₦${AJO_DDM_FEE} setup fee charged. ${mandateGroup.name} can now run automatic bank debits.`,
      });
      setMandateGroup(null);
      await loadGroups();
      if (detailGroup === mandateGroup.id) await loadDetail(mandateGroup.id);
    }
  };

  const [form, setForm] = useState({
    name: "",
    maxMembers: 5,
    contributionAmount: 10000,
    period: "weekly" as string,
    autoDebit: true,
    fundingMode: "wallet" as "wallet" | "ddm",
    timeSlot: 18,
    dayOfWeek: 1,
    dayOfMonth: 1,
  });

  const loadGroups = async () => {
    // Promote any swap-window groups whose 3-min timer elapsed before refreshing
    await products.autoStartPendingGroups();
    const [groupsRes, invitesRes] = await Promise.all([
      products.listGroups(),
      products.listGroupInvites(),
    ]);
    if (groupsRes?.data) setGroups(groupsRes.data);
    if (invitesRes?.data) setPendingInvites(invitesRes.data as any[]);
  };

  useEffect(() => { loadGroups(); }, []); // eslint-disable-line

  // Keep the list fresh while a group is filling up or inside its 3-minute
  // swap window, so the admin sees the window open without a manual refresh.
  const hasLiveWindow = groups.some((g) => g.status === "swap_window" || g.status === "pending");
  useEffect(() => {
    if (detailGroup || !hasLiveWindow) return;
    const id = setInterval(() => { loadGroups(); }, 8000);
    return () => clearInterval(id);
  }, [detailGroup, hasLiveWindow]); // eslint-disable-line

  const pool = form.contributionAmount * form.maxMembers;
  const fee = calculatePlatformFee(pool);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    const slot = timeSlots[form.timeSlot];
    const result = await products.createGroup({
      name: form.name,
      contribution_amount: form.contributionAmount,
      max_members: form.maxMembers,
      period: form.period,
      auto_debit: form.autoDebit,
      funding_mode: form.fundingMode,
      contribution_hour: slot?.hour ?? 9,
      contribution_minute: slot?.minute ?? 0,
      contribution_day_of_week: form.dayOfWeek,
      contribution_day_of_month: form.dayOfMonth,
    });
    if (result?.data) {
      toast({ title: "Group Created!", description: form.name });
      const wasDdm = form.fundingMode === "ddm";
      const createdGroup = result.data as Group;
      setForm({ name: "", maxMembers: 5, contributionAmount: 10000, period: "weekly", autoDebit: true, fundingMode: "wallet", timeSlot: 18, dayOfWeek: 1, dayOfMonth: 1 });
      setShowCreate(false);
      await loadGroups();
      // DDM: prompt the admin to authorize their own mandate immediately.
      if (wasDdm) setMandateGroup(createdGroup);
    }
  };


  const loadDetail = async (groupId: string) => {
    // If this group's swap window has already elapsed in the background,
    // promote it to active before fetching detail so the UI shows the
    // correct cycle/state on first paint.
    await products.autoStartPendingGroups(groupId);
    const result = await products.getGroupDetail(groupId);
    if (result?.data) {
      setDetailData(result.data);
      setDetailGroup(groupId);
    }
  };

  // While the open group is filling up or inside its swap window, refresh the
  // detail view so the countdown and swap buttons appear as soon as it opens.
  const detailStatus: string | undefined = detailData?.group?.status ?? detailData?.status;
  useEffect(() => {
    if (!detailGroup) return;
    if (detailStatus !== "swap_window" && detailStatus !== "pending") return;
    const id = setInterval(() => { loadDetail(detailGroup); }, 5000);
    return () => clearInterval(id);
  }, [detailGroup, detailStatus]); // eslint-disable-line

  // Gate non-members: if the user has a pending invite to this group, force
  // an Accept/Decline modal before letting them open the group detail. If they
  // are neither a member nor invited, deny entry.
  const handleCardClick = (g: Group) => {
    const isMember = !!currentUserId && (g.vfd_sandbox_group_members || [])
      .some((m: any) => m.user_id === currentUserId && (m.status ?? "active") === "active");
    if (isMember) {
      loadDetail(g.id);
      return;
    }
    const invite = pendingInvites.find((i: any) => i.group_id === g.id);
    if (invite) {
      setInviteGate({ invite, group: g });
      return;
    }
    toast({
      title: "Members only",
      description: "You're not a member of this group.",
      variant: "destructive",
    });
  };

  const respondGate = async (accept: boolean) => {
    if (!inviteGate) return;
    setInviteBusy(true);
    const res = await products.respondGroupInvite(inviteGate.invite.id, accept);
    setInviteBusy(false);
    if (res?.error) {
      toast({ title: "Action failed", description: getUserFriendlyError(res.error), variant: "destructive" });
      return;
    }
    if (accept) {
      toast({ title: "Invite accepted", description: `You joined "${inviteGate.group.name}".` });
      const gid = inviteGate.group.id;
      const joinedGroup = inviteGate.group;
      setInviteGate(null);
      await loadGroups();
      await loadDetail(gid);
      // DDM groups: immediately prompt the new member to authorize their mandate.
      if (joinedGroup.funding_mode === "ddm") setMandateGroup(joinedGroup);
    } else {
      toast({ title: "Invite declined" });
      setInviteGate(null);
      await loadGroups();
    }
  };

  // Detail view
  if (detailGroup && detailData) {
    const g = detailData.group || detailData;
    const members = detailData.members || g.vfd_sandbox_group_members || [];
    const payoutOrder = detailData.payout_order || g.payout_order || [];
    const payoutOrderNames: string[] = detailData.payout_order_names || [];
    const memberNameMap: Record<string, string> = {};
    members.forEach((m: any) => { if (m.user_id && m.display_name) memberNameMap[m.user_id] = m.display_name; });
    const isAdmin = !!currentUserId && g.admin_id === currentUserId;
    const progress = g.status === "completed"
      ? 100
      : g.total_cycles > 0
        ? Math.min(100, ((g.current_cycle - 1) / g.total_cycles) * 100)
        : 0;


    return (
      <div className="space-y-4">
        <button onClick={() => { setDetailGroup(null); setDetailData(null); }} className="text-sm text-primary flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Back to Groups
        </button>

        <ThriftMandateReadiness
          gate={detailData.mandate_gate}
          groupStatus={String(g.status)}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />



        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">{g.name}</h3>
                <p className="text-xs text-muted-foreground">
                  ₦{fmt(Number(g.contribution_amount))} / {g.period} • {g.member_count}/{g.max_members} members
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={
                  g.status === "active" ? "text-green-600 border-green-500"
                  : g.status === "completed" ? "text-primary border-primary"
                  : g.status === "swap_window" ? "text-warning border-warning"
                  : "text-muted-foreground"
                }>
                  {g.status === "swap_window" ? "swap window" : g.status}
                </Badge>
                {isAdmin && g.status === "pending" && g.member_count < g.max_members && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowInviteDialog(true)} title="Invite members">
                    <Share2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {g.status === "active" && (
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Cycle {g.current_cycle} of {g.total_cycles}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {/* Cycle summary: contribution meter + recipient + payouts so far */}
            {g.status === "active" && (() => {
              const contributedCount = members.filter((m: any) => m.has_contributed_current).length;
              const totalMembers = members.length || g.member_count || 0;
              const meterPct = totalMembers > 0 ? (contributedCount / totalMembers) * 100 : 0;
              const currentRecipientId = (payoutOrder || [])[g.current_cycle - 1];
              const currentRecipientName = payoutOrderNames[g.current_cycle - 1] || memberNameMap[currentRecipientId] || (currentRecipientId ? `User ${currentRecipientId.slice(0, 6)}` : "—");
              const paidMembers = members.filter((m: any) => m.has_received_payout);
              return (
                <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">Cycle {g.current_cycle} contribution meter</span>
                    <span className="text-muted-foreground">{contributedCount}/{totalMembers}</span>
                  </div>
                  <Progress value={meterPct} className="h-2" />
                  <div className="flex justify-between text-[11px] pt-1">
                    <span className="text-muted-foreground">This cycle's recipient</span>
                    <span className="font-medium truncate max-w-[180px]">{currentRecipientName}</span>
                  </div>
                  <div className="text-[11px]">
                    <span className="text-muted-foreground">Paid out so far: </span>
                    {paidMembers.length === 0 ? (
                      <span className="text-muted-foreground">None yet</span>
                    ) : (
                      <span className="font-medium">{paidMembers.map((m: any) => m.display_name || `User ${m.user_id?.slice(0,6)}`).join(", ")}</span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Swap window banner with countdown + auto-start trigger */}
            {g.status === "swap_window" && (
              <SwapWindowBanner
                endsAt={g.swap_window_ends_at}
                onElapsed={async () => {
                  await products.autoStartPendingGroups(g.id);
                  await loadDetail(g.id);
                }}
              />
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {g.status === "active" && (() => {
                const myM = members.find((m: any) => m.user_id === currentUserId);
                const contributed = !!myM?.has_contributed_current;
                return (
                  <Button size="sm" onClick={async () => {
                    const r = await products.contributeGroup(g.id);
                    if (r?.data) {
                      toast({ title: "Contributed!", description: `₦${fmt(Number(g.contribution_amount))} for cycle ${g.current_cycle}` });
                      loadDetail(g.id);
                    }
                  }} disabled={products.loading || contributed} variant={contributed ? "secondary" : "default"}>
                    <ArrowRight className="h-3 w-3 mr-1" />
                    {contributed ? `Contributed for cycle ${g.current_cycle}` : `Contribute ₦${fmt(Number(g.contribution_amount))}`}
                  </Button>
                );
              })()}
              {g.status === "completed" && (
                <>
                  <Button size="sm" variant="outline" onClick={async () => {
                    await products.confirmContinue(g.id);
                    toast({ title: "Continuation confirmed" });
                  }} disabled={products.loading}>
                    Continue
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    await products.exitGroup(g.id);
                    toast({ title: "Exited group" });
                    setDetailGroup(null); setDetailData(null); loadGroups();
                  }} disabled={products.loading}>
                    <LogOut className="h-3 w-3 mr-1" /> Exit
                  </Button>
                  {isAdmin && (
                    <Button size="sm" onClick={async () => {
                      await products.restartGroup(g.id, true);
                      toast({ title: "Group restarted!" });
                      loadDetail(g.id);
                    }} disabled={products.loading}>
                      Restart Group
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="chat">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="chat"><MessageSquare className="h-3 w-3 mr-1" /> Chat</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="payout"><ListOrdered className="h-3 w-3 mr-1" /> Payout</TabsTrigger>
            <TabsTrigger value="settings"><SettingsIcon className="h-3 w-3 mr-1" /> Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="mt-3">
            <SandboxGroupChat groupId={g.id} currentUserId={currentUserId} />
          </TabsContent>
          <TabsContent value="members" className="space-y-2 mt-3">
            {/* Pending incoming swap requests for the current user */}
            {(detailData.swaps || []).filter((s: any) => s.status === "pending" && s.target_id === currentUserId).map((s: any) => (
              <div key={s.id} className="p-3 rounded-xl bg-card border-2 border-warning/40 space-y-2">
                <p className="text-xs font-semibold">Swap request</p>
                <p className="text-[11px] text-muted-foreground">
                  A member wants to swap their position #{s.requester_position} with your position #{s.target_position}.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" disabled={products.loading}
                    onClick={async () => {
                      const r = await products.respondSwap(s.id, false);
                      if (r?.data) { toast({ title: "Swap declined" }); loadDetail(g.id); }
                    }}>Decline</Button>
                  <Button size="sm" className="flex-1" disabled={products.loading}
                    onClick={async () => {
                      const r = await products.respondSwap(s.id, true);
                      if (r?.data) { toast({ title: "Swap accepted! Positions updated." }); loadDetail(g.id); }
                    }}>Accept</Button>
                </div>
              </div>
            ))}

            {(() => {
              const me = members.find((mm: any) => mm.user_id === currentUserId);
              const owed = Number(me?.outstanding_owed || 0);
              if (owed <= 0) return null;
              return (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs space-y-1">
                  <p className="font-semibold text-destructive">Payouts on hold — you owe ₦{owed.toLocaleString()}</p>
                  <p className="text-muted-foreground">
                    This covers missed contributions and penalties. Your payout stays withheld until it's cleared —
                    it is recovered automatically from your payout, or you can fund your wallet and ask your group admin to apply it.
                  </p>
                </div>
              );
            })()}

            {members.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">No members yet</p>

            ) : members.map((m: any, i: number) => {
              const isMe = m.user_id === currentUserId;
              const myMembership = members.find((mm: any) => mm.user_id === currentUserId);
              const canRequestSwap =
                !isMe &&
                (g.status === "swap_window" || g.status === "active") &&
                myMembership &&
                !myMembership.has_used_swap &&
                !myMembership.has_received_payout &&
                !m.has_received_payout &&
                (g.status === "swap_window" ||
                  !(detailData.contributions || []).some((c: any) => c.cycle_number === g.current_cycle));
              return (
                <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate max-w-[140px]">{m.display_name || `User ${m.user_id?.slice(0, 6)}`}{isMe ? " (you)" : ""}</span>
                    {m.user_id === g.admin_id && <Crown className="h-3 w-3 text-warning" />}
                  </div>
                  <div className="flex items-center gap-2">
                    {m.has_contributed_current && <Badge variant="secondary" className="text-[10px]">Contributed</Badge>}
                    {Number(m.outstanding_owed || 0) > 0 && (
                      <Badge variant="destructive" className="text-[10px]">Owes ₦{Number(m.outstanding_owed).toLocaleString()}</Badge>
                    )}
                    {m.has_received_payout && <Badge className="text-[10px]">Received</Badge>}
                    {m.payout_position != null && <span className="text-muted-foreground">#{m.payout_position}</span>}

                    {canRequestSwap && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                        disabled={products.loading}
                        onClick={async () => {
                          const r = await products.requestSwap(g.id, m.user_id);
                          if (r?.data) { toast({ title: "Swap requested", description: `Waiting for ${m.display_name || "member"} to respond.` }); loadDetail(g.id); }
                        }}>
                        <ArrowLeftRight className="h-3 w-3 mr-1" /> Swap
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </TabsContent>
          <TabsContent value="payout" className="space-y-2 mt-3">
            {payoutOrder.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">Payout order is assigned when the thrift commences (Fisher-Yates shuffle).</p>
            ) : payoutOrder.map((userId: string, i: number) => {
              const cycleNum = i + 1;
              const isPaid = cycleNum < g.current_cycle;
              const isNext = cycleNum === g.current_cycle && g.status === "active";
              const isFuture = cycleNum > g.current_cycle;
              const name = payoutOrderNames[i] || memberNameMap[userId] || `User ${userId.slice(0, 6)}`;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between text-xs p-2 rounded-lg border ${
                    isNext ? "bg-primary/10 border-primary/40" : isPaid ? "bg-success/5 border-success/20" : "bg-muted/50 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">#{cycleNum}</span>
                    <span className="font-medium truncate max-w-[140px]">{name}</span>
                  </div>
                  {isPaid && <Badge variant="outline" className="text-[10px] text-success border-success/40">Paid</Badge>}
                  {isNext && <Badge className="text-[10px]">Next</Badge>}
                  {isFuture && <span className="text-[10px] text-muted-foreground">Upcoming</span>}
                </div>
              );
            })}
          </TabsContent>
          <TabsContent value="settings" className="space-y-3 mt-3 text-xs">
            <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Contribution amount</span><span className="font-medium">₦{fmt(Number(g.contribution_amount))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Frequency</span><span className="font-medium capitalize">{g.period}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Members</span><span className="font-medium">{g.member_count} / {g.max_members}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cycles</span><span className="font-medium">{g.current_cycle} / {g.total_cycles}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Charge time (WAT)</span><span className="font-medium">{String(g.contribution_hour ?? 16).padStart(2,"0")}:{String(g.contribution_minute ?? 0).padStart(2,"0")}</span></div>
              {g.period === "weekly" && (
                <div className="flex justify-between"><span className="text-muted-foreground">Day of week</span><span className="font-medium">{daysOfWeek.find(d => d.value === g.contribution_day_of_week)?.label || "—"}</span></div>
              )}
              {g.period === "monthly" && (
                <div className="flex justify-between"><span className="text-muted-foreground">Day of month</span><span className="font-medium">{g.contribution_day_of_month ?? "—"}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Auto-debit (wallet)</span><span className="font-medium">{g.auto_debit ? "On" : "Off"}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Funding mode</span>
                <span className="font-medium uppercase">{g.funding_mode === "ddm" ? "E-Mandate (bank)" : "Wallet"}</span>
              </div>
              {g.funding_mode === "ddm" && (
                <div className="flex justify-between"><span className="text-muted-foreground">Mandate ref</span><span className="font-mono text-[10px]">{g.mandate_reference || "—"}</span></div>
              )}
            </div>
            {g.funding_mode === "ddm" && (
              <MandateStatusCard mandate={findMandate("thrift", g.id)} />
            )}
            {isAdmin && g.status === "active" && (
              <div className="rounded-xl border bg-card p-3 space-y-2">
                <p className="font-semibold text-foreground">Admin actions</p>
                <Button size="sm" variant="outline" disabled={products.loading} onClick={async () => {
                  const r = await products.updateGroupSettings({ group_id: g.id, auto_debit: !g.auto_debit });
                  if (r?.data) { toast({ title: `Auto-debit ${!g.auto_debit ? "enabled" : "disabled"}` }); loadDetail(g.id); }
                }}>Toggle auto-debit</Button>
                <Button size="sm" variant="outline" disabled={products.loading} onClick={async () => {
                  const next = g.funding_mode === "ddm" ? "wallet" : "ddm";
                  const r = await products.updateGroupSettings({ group_id: g.id, funding_mode: next });
                  if (r?.data) { toast({ title: `Funding mode set to ${next.toUpperCase()}` }); loadDetail(g.id); }
                }}>Switch to {g.funding_mode === "ddm" ? "Wallet" : "E-Mandate"} funding</Button>
                <Button size="sm" variant="outline" disabled={products.loading} onClick={async () => {
                  const r = await products.sandboxAutoContribute(g.id);
                  if (r?.data) { toast({ title: "Auto-sweep triggered", description: `Processed ${r.data.processed_count} group(s)` }); loadDetail(g.id); }
                }}>Run auto-sweep now</Button>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              Auto-sweep runs every 30 minutes (WAT) and debits each member's sandbox wallet at the scheduled time. No card retries — if a wallet is short, the member is notified to fund and contribute manually.
            </p>
          </TabsContent>
        </Tabs>

        {/* Fee info */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border">
          <p className="text-xs text-muted-foreground">
            Platform fee per payout: {Number(g.contribution_amount) * Number(g.max_members) < 20000
              ? "₦100 (flat)"
              : `₦${fmt(calculatePlatformFee(Number(g.contribution_amount) * Number(g.max_members)))} (1%, max ₦500)`}
          </p>
        </div>

        <SandboxGroupInviteDialog
          open={showInviteDialog}
          onOpenChange={setShowInviteDialog}
          groupId={g.id}
          groupName={g.name}
          onMemberAdded={() => loadDetail(g.id)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Thrift Groups (Ajo)
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadGroups}><RefreshCw className="h-3 w-3" /></Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-3 w-3 mr-1" /> New Group
          </Button>
        </div>
      </div>

      {/* Group limit notice */}
      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
          <p className="text-xs text-muted-foreground">
            You can be a member of up to 2 active groups at a time. Contribution: ₦5,000 – ₦500,000. Members: 3 – 20.
          </p>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Create Thrift Group</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Group Name</Label>
              <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Family Savings Circle" className="h-12" />
            </div>

            {/* Max Members Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Maximum Members</Label>
                <span className="text-lg font-semibold text-primary">{form.maxMembers}</span>
              </div>
              <Slider value={[form.maxMembers]} onValueChange={([v]) => setForm(p => ({ ...p, maxMembers: v }))} min={2} max={20} step={1} className="py-2" />
              <div className="flex justify-between text-xs text-muted-foreground"><span>2</span><span>20</span></div>
            </div>

            {/* Contribution Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Contribution Amount</Label>
                <span className="text-lg font-semibold text-primary">₦{fmt(form.contributionAmount)}</span>
              </div>
              <Slider value={[form.contributionAmount]} onValueChange={([v]) => setForm(p => ({ ...p, contributionAmount: v }))} min={500} max={500000} step={500} className="py-2" />
              <div className="flex justify-between text-xs text-muted-foreground"><span>₦500</span><span>₦500,000</span></div>
            </div>

            {/* Period */}
            <div>
              <Label>Contribution Period</Label>
              <Select value={form.period} onValueChange={(v) => setForm(p => ({ ...p, period: v }))}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Funding Mode (admin choice) */}
            <div className="p-3 rounded-xl bg-card border border-border space-y-2">
              <Label>Funding Mode</Label>
              <Select value={form.fundingMode} onValueChange={(v) => setForm(p => ({ ...p, fundingMode: v as "wallet" | "ddm" }))}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wallet">Wallet debit — pull from each member's Vestara wallet</SelectItem>
                  <SelectItem value="ddm">E-Mandate — auto-debit each member's bank (VFD e-mandate)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {form.fundingMode === "ddm"
                  ? "Contributions are collected straight from members' linked bank accounts. No wallet balance required."
                  : "Members must have enough in their Vestara wallet on contribution day."}
              </p>
            </div>

            {/* Auto-Debit */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Coins className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Enable Auto-Debit</p>
                  <p className="text-[10px] text-muted-foreground">Auto-collect on schedule</p>
                </div>
              </div>
              <Switch checked={form.autoDebit} onCheckedChange={(v) => setForm(p => ({ ...p, autoDebit: v }))} />
            </div>

            {/* Schedule */}
            {form.autoDebit && (
              <div className="space-y-3 p-3 rounded-xl bg-card border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Auto-Contribution Schedule</span>
                </div>

                {form.period === "weekly" && (
                  <div>
                    <Label>Day of Week</Label>
                    <Select value={String(form.dayOfWeek)} onValueChange={(v) => setForm(p => ({ ...p, dayOfWeek: Number(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {daysOfWeek.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {form.period === "monthly" && (
                  <div>
                    <Label>Day of Month</Label>
                    <Select value={String(form.dayOfMonth)} onValueChange={(v) => setForm(p => ({ ...p, dayOfMonth: Number(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {daysOfMonth.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>Contribution Time</Label>
                  <Select value={String(form.timeSlot)} onValueChange={(v) => setForm(p => ({ ...p, timeSlot: Number(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {timeSlots.map(s => <SelectItem key={s.value} value={String(s.value)}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="p-3 rounded-xl bg-muted/50 space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2"><Info className="h-3 w-3" /> Group Summary</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Pool per Cycle</span>
                  <span className="font-medium">₦{fmt(pool)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated Payout</span>
                  <span className="font-medium">₦{fmt(pool - fee)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Platform Fee</span>
                  <span className="text-muted-foreground">
                    {pool < 20000 ? "₦100 (flat)" : `₦${fmt(fee)} (1%, max ₦500)`}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              By creating this group, you agree to our Terms. Platform fee: ₦100 flat under ₦20,000 or 1% (max ₦500) for ₦20,000+.
            </p>

            <Button onClick={handleCreate} disabled={products.loading || !form.name} className="w-full h-12">
              {products.loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Group
            </Button>
          </CardContent>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No thrift groups yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const progress = g.status === "completed"
              ? 100
              : g.total_cycles > 0
                ? Math.min(100, ((g.current_cycle - 1) / g.total_cycles) * 100)
                : 0;

            const isMember = !!currentUserId && (g.vfd_sandbox_group_members || [])
              .some((m: any) => m.user_id === currentUserId && (m.status ?? "active") === "active");
            const hasInvite = !isMember && pendingInvites.some((i: any) => i.group_id === g.id);
            const myMember = (g.vfd_sandbox_group_members || []).find((m: any) => m.user_id === currentUserId);
            const isDdm = g.funding_mode === "ddm";
            const myMandate = (myMember?.mandate_status as string) || "not_required";
            const mandatePending = isMember && isDdm && myMandate !== "authorized";
            return (
              <Card key={g.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => handleCardClick(g)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ₦{fmt(Number(g.contribution_amount))} / {g.period} • {g.member_count}/{g.max_members} members
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {hasInvite && (
                        <Badge className="bg-primary/15 text-primary border-primary/30">Invite pending</Badge>
                      )}
                      {isMember && isDdm && (
                        myMandate === "authorized" ? (
                          <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/40">E-Mandate authorized</Badge>
                        ) : myMandate === "awaiting_approval" ? (
                          <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-500/40">Awaiting bank approval</Badge>
                        ) : myMandate === "failed" ? (
                          <Badge variant="outline" className="text-[10px] text-red-600 border-red-500/40">E-Mandate failed</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/40">E-Mandate pending</Badge>
                        )
                      )}
                      <Badge variant="outline" className={g.status === "active" ? "text-green-600 border-green-500" : g.status === "completed" ? "text-primary border-primary" : "text-muted-foreground"}>
                        {g.status}
                      </Badge>
                    </div>
                  </div>



                  {g.total_cycles > 0 && (
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Cycle {g.current_cycle} of {g.total_cycles}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {mandatePending && myMandate !== "awaiting_approval" && (
                      <Button size="sm" variant="default" className="bg-amber-600 hover:bg-amber-700" onClick={(e) => {
                        e.stopPropagation();
                        setMandateGroup(g);
                      }}>
                        Authorize E-Mandate (₦{AJO_DDM_FEE})
                      </Button>
                    )}
                    {myMandate === "awaiting_approval" && (
                      <Button size="sm" variant="outline" onClick={async (e) => {
                        e.stopPropagation();
                        const r = await products.checkGroupMandateStatus(g.id);
                        if ((r as any)?.data?.bank_approved) {
                          toast({ title: "Mandate approved", description: "The bank has approved your E-Mandate." });
                        } else {
                          toast({ title: "Still awaiting bank approval", description: `Current status: ${(r as any)?.data?.bank_approval_status || "Pending"}` });
                        }
                        await loadGroups();
                      }}>
                        Check bank approval
                      </Button>
                    )}
                    {/* Joining is invite-only — admins invite via the group detail page,
                        invitees accept from the notification bell. No open "Join" button. */}
                    {g.status === "active" && isMember && !mandatePending && (() => {
                      const contributed = !!myMember?.has_contributed_current;
                      return (
                        <Button size="sm" onClick={async (e) => {
                          e.stopPropagation();
                          const result = await products.contributeGroup(g.id);
                          if (result?.data) {
                            toast({ title: "Contributed!", description: `₦${fmt(Number(g.contribution_amount))} for cycle ${g.current_cycle}` });
                            loadGroups();
                          }
                        }} disabled={products.loading || contributed} variant={contributed ? "secondary" : "default"}>
                          <ArrowRight className="h-3 w-3 mr-1" />
                          {contributed ? "Contributed" : "Contribute"}
                        </Button>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* DDM Mandate authorization: collects payer bank details, calls VFD
          E-Mandate Create, then shows the ₦50 NIBSS authorization screen
          and polls /mandate/status every 60s until the bank approves. */}
      <MandateAuthorizationDialog
        subject={mandateGroup ? {
          kind: "group",
          id: (mandateGroup as any).id,
          name: (mandateGroup as any).name,
          contribution_amount: Number((mandateGroup as any).contribution_amount) || 0,
          period: String((mandateGroup as any).period || "monthly"),
          total_cycles: Number((mandateGroup as any).total_cycles || (mandateGroup as any).max_members) || 1,
        } : null}
        onClose={() => { if (!mandateBusy) { setMandateGroup(null); void refreshMandates(); } }}
        onAuthorized={async () => {
          await loadGroups();
          if (mandateGroup && detailGroup === mandateGroup.id) await loadDetail(mandateGroup.id);
        }}
      />


      {/* Invite gate: non-members with a pending invite MUST accept or decline
          before they can enter the group detail. */}
      <Dialog open={!!inviteGate} onOpenChange={(o) => { if (!o && !inviteBusy) setInviteGate(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Group Invite</DialogTitle>
            <DialogDescription className="text-xs">
              You were invited to <span className="font-medium">{inviteGate?.group.name}</span>. Accept or decline to continue.
            </DialogDescription>
          </DialogHeader>
          {inviteGate && (
            <div className="p-3 rounded-xl bg-muted/40 space-y-1 text-xs">
              <p>₦{fmt(Number(inviteGate.group.contribution_amount))} / {inviteGate.group.period}</p>
              <p className="text-muted-foreground">{inviteGate.group.member_count}/{inviteGate.group.max_members} members</p>
              <p className="text-muted-foreground">Non-members can't view this group's details.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={inviteBusy} onClick={() => respondGate(false)} className="h-11">
              <X className="h-4 w-4 mr-1" /> Decline
            </Button>
            <Button disabled={inviteBusy} onClick={() => respondGate(true)} className="h-11">
              <Check className="h-4 w-4 mr-1" /> Accept
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

