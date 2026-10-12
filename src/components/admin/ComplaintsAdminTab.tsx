import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AlertTriangle, Clock, RefreshCw, Snowflake, Send, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const call = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("complaints-admin", { body });
  if (error) {
    const b = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(b?.error ?? "Request failed");
  }
  return data;
};

const STATUS_LABEL: Record<string, string> = { open: "Open", in_review: "In review", awaiting_reply: "Awaiting customer", resolved: "Resolved", closed: "Closed" };
const PRIO_CLS: Record<string, string> = { Critical: "bg-destructive text-destructive-foreground", High: "bg-primary text-primary-foreground", Medium: "bg-secondary text-secondary-foreground", Low: "bg-muted text-muted-foreground" };
const SERVICES = ["fraud", "transfers", "bills", "add_money", "ajo", "escrow", "savings", "split", "account", "fees"];
const fmt = (s: string) => new Date(s).toLocaleString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const naira = (n: number) => `₦${Number(n).toLocaleString("en-NG")}`;

type Row = { id: string; ticket_no: string; service: string; issue_type: string; status: string; priority: string; created_at: string; sla_due_at: string | null; assigned_to: string | null; freeze_requested: boolean; user_name: string | null; user_email: string | null };

export function ComplaintsAdminTab() {
  return (
    <Tabs defaultValue="queue" className="space-y-4">
      <TabsList><TabsTrigger value="queue">Complaints queue</TabsTrigger><TabsTrigger value="cats">Issue types &amp; SLAs</TabsTrigger></TabsList>
      <TabsContent value="queue"><Queue /></TabsContent>
      <TabsContent value="cats"><Categories /></TabsContent>
    </Tabs>
  );
}

function Queue() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState("active");
  const [service, setService] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setRows(null);
    try { setRows((await call({ action: "list", status, service, search: search || undefined })).rows); }
    catch (e) { toast.error((e as Error).message); setRows([]); }
  }, [status, service, search]);
  useEffect(() => { void load(); }, [load]);

  const counts = (rows ?? []).reduce((a, r) => { a[r.priority] = (a[r.priority] ?? 0) + 1; if (r.sla_due_at && new Date(r.sla_due_at) < new Date() && !["resolved", "closed"].includes(r.status)) a.overdue++; return a; }, { overdue: 0 } as Record<string, number>);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Showing", rows?.length ?? 0], ["Critical", counts.Critical ?? 0], ["High", counts.High ?? 0], ["Past SLA", counts.overdue]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold">{v}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="active">All unresolved</SelectItem><SelectItem value="all">Everything</SelectItem>{Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={service} onValueChange={setService}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All services</SelectItem>{SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        <Input placeholder="Ticket no." value={search} onChange={(e) => setSearch(e.target.value)} className="w-44" />
        <Button variant="outline" size="icon" onClick={load} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {!rows ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
        : !rows.length ? <p className="text-sm text-muted-foreground py-8 text-center">No complaints match these filters.</p>
        : (
          <div className="space-y-2">
            {rows.map((r) => {
              const overdue = r.sla_due_at && new Date(r.sla_due_at) < new Date() && !["resolved", "closed"].includes(r.status);
              return (
                <button key={r.id} onClick={() => setOpenId(r.id)} className="w-full text-left rounded-2xl border border-border bg-card p-4 hover:bg-muted/50 active:scale-[0.99] transition">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">{r.ticket_no}</span>
                    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", PRIO_CLS[r.priority])}>{r.priority}</span>
                    <Badge variant="outline">{STATUS_LABEL[r.status]}</Badge>
                    {r.freeze_requested && <Badge variant="destructive" className="gap-1"><Snowflake className="h-3 w-3" />Freeze requested</Badge>}
                    {overdue && <Badge variant="destructive" className="gap-1"><Clock className="h-3 w-3" />Past SLA</Badge>}
                    {!r.assigned_to && <Badge variant="secondary">Unassigned</Badge>}
                  </div>
                  <p className="text-sm mt-1">{r.user_name ?? r.user_email ?? "Customer"} · {r.service} / {r.issue_type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">{fmt(r.created_at)}{r.sla_due_at ? ` · due ${fmt(r.sla_due_at)}` : ""}</p>
                </button>
              );
            })}
          </div>
        )}
      <Sheet open={!!openId} onOpenChange={(o) => { if (!o) { setOpenId(null); void load(); } }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">{openId && <Detail id={openId} />}</SheetContent>
      </Sheet>
    </div>
  );
}

function Detail({ id }: { id: string }) {
  const [d, setD] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [internal, setInternal] = useState(false);
  const [nextStatus, setNextStatus] = useState("keep");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setD(await call({ action: "detail", id })); } catch (e) { toast.error((e as Error).message); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  const act = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { await call({ id, ...body }); toast.success(ok); await load(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  if (!d) return <div className="space-y-3 pt-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  const c = d.complaint, tx = d.transaction;
  return (
    <div className="space-y-5">
      <SheetHeader><SheetTitle className="font-mono">{c.ticket_no}</SheetTitle></SheetHeader>
      {c.freeze_requested && (
        <div className="rounded-2xl bg-destructive/10 text-destructive p-3 text-sm flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          Customer asked to freeze their account. Freeze it from User Management, then note it here.</div>
      )}
      <div className="rounded-2xl border border-border p-4 text-sm space-y-1">
        <p><span className="text-muted-foreground">Customer:</span> {d.user?.full_name ?? "—"} ({d.user?.email ?? "—"})</p>
        <p><span className="text-muted-foreground">Account status:</span> {d.user?.account_status ?? "—"}</p>
        <p><span className="text-muted-foreground">Issue:</span> {c.service} / {c.issue_type.replace(/_/g, " ")}</p>
        <p><span className="text-muted-foreground">Opened:</span> {fmt(c.created_at)}{c.sla_due_at && <> · <span className="text-muted-foreground">SLA due</span> {fmt(c.sla_due_at)}</>}</p>
      </div>
      {tx && (
        <div className="rounded-2xl border border-border p-4 text-sm space-y-1">
          <p className="font-semibold">Linked transaction</p>
          <p>{tx.transaction_type} · {naira(tx.amount)} · <b>{tx.status}</b>{tx.reversed_at && ` · reversed ${fmt(tx.reversed_at)}`}</p>
          <p className="text-xs text-muted-foreground">{fmt(tx.created_at)}{tx.beneficiary_name ? ` · to ${tx.beneficiary_name} ${tx.beneficiary_account ?? ""} ${tx.beneficiary_bank ?? ""}` : ""}</p>
          {[["Ref", tx.reference], ["VFD ref", tx.vfd_reference], ["Session", tx.session_id]].filter(([, v]) => v).map(([k, v]) => <p key={k} className="text-xs font-mono break-all">{k}: {v}</p>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Select value={c.status} onValueChange={(v) => act({ action: "update", status: v }, "Status updated")} disabled={busy}>
          <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={c.priority} onValueChange={(v) => act({ action: "update", priority: v }, "Priority updated")} disabled={busy}>
          <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Low", "Medium", "High", "Critical"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" disabled={busy} className="col-span-2" onClick={() => act(c.assigned_to ? { action: "update", unassign: true } : { action: "update", assign_to_me: true }, c.assigned_to ? "Unassigned" : "Assigned to you")}>
          {c.assigned_to ? "Unassign" : "Assign to me"}</Button>
      </div>
      {d.attachments.length > 0 && (
        <div className="flex gap-2 flex-wrap">{d.attachments.map((a: any) => a.url && (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="h-24 w-24 rounded-xl overflow-hidden border border-border"><img src={a.url} alt="Attachment" className="h-full w-full object-cover" /></a>
        ))}</div>
      )}
      <div className="space-y-3">
        {d.events.map((e: any) => (
          <div key={e.id} className={cn("rounded-2xl p-3 text-sm", e.event_type === "internal_note" ? "bg-accent border border-dashed border-border" : e.actor_type === "agent" ? "bg-primary/10 ml-6" : e.actor_type === "system" ? "bg-transparent text-muted-foreground text-xs p-1" : "bg-muted mr-6")}>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              {e.event_type === "internal_note" && <Lock className="h-3 w-3" />}
              {e.event_type === "internal_note" ? "Internal note" : e.actor_type === "agent" ? "Support" : e.actor_type === "system" ? "System" : "Customer"} · {e.event_type.replace(/_/g, " ")} · {fmt(e.created_at)}
            </p>
            {e.message && <p className="whitespace-pre-wrap break-words mt-1">{e.message}</p>}
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <Textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={internal ? "Internal note (customer won't see this)" : "Reply to customer"} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><Switch checked={internal} onCheckedChange={setInternal} />Internal note</label>
          {!internal && (
            <Select value={nextStatus} onValueChange={setNextStatus}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="keep">Keep status</SelectItem><SelectItem value="awaiting_reply">Ask customer to reply</SelectItem><SelectItem value="in_review">Mark in review</SelectItem><SelectItem value="resolved">Mark resolved</SelectItem></SelectContent></Select>
          )}
          <Button className="ml-auto" disabled={busy || !msg.trim()} onClick={async () => {
            await act({ action: "reply", message: msg, internal, set_status: !internal && nextStatus !== "keep" ? nextStatus : undefined }, internal ? "Note saved" : "Reply sent");
            setMsg(""); setNextStatus("keep");
          }}><Send className="h-4 w-4 mr-1" />{internal ? "Save note" : "Send"}</Button>
        </div>
      </div>
    </div>
  );
}

function Categories() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const load = useCallback(async () => { try { setRows((await call({ action: "categories" })).rows); } catch (e) { toast.error((e as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    try { await call({ action: "save_category", ...edit, sla_hours: Number(edit.sla_hours) }); toast.success("Saved"); setEdit(null); void load(); }
    catch (e) { toast.error((e as Error).message); }
  };
  if (!rows) return <Skeleton className="h-64 rounded-2xl" />;
  return (
    <div className="space-y-3">
      <Button onClick={() => setEdit({ service: "transfers", issue_type: "", label: "", priority: "Medium", sla_hours: 48, owner_team: "support", active: true })}>Add issue type</Button>
      <div className="rounded-2xl border border-border divide-y divide-border">
        {rows.map((r) => (
          <button key={r.id} onClick={() => setEdit(r)} className={cn("w-full text-left p-3 flex flex-wrap gap-2 items-center hover:bg-muted/50", !r.active && "opacity-50")}>
            <Badge variant="outline">{r.service}</Badge><span className="text-sm flex-1 min-w-[180px]">{r.label}</span>
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full", PRIO_CLS[r.priority])}>{r.priority}</span>
            <span className="text-xs text-muted-foreground">{r.sla_hours}h · {r.owner_team}</span>
          </button>
        ))}
      </div>
      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent className="space-y-3 overflow-y-auto">
          <SheetHeader><SheetTitle>{edit?.id ? "Edit issue type" : "New issue type"}</SheetTitle></SheetHeader>
          {edit && (<>
            <Select value={edit.service} onValueChange={(v) => setEdit({ ...edit, service: v })} disabled={!!edit.id}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            <Input placeholder="code e.g. not_received" value={edit.issue_type} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, issue_type: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
            <Input placeholder="Customer-facing label" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
            <Select value={edit.priority} onValueChange={(v) => setEdit({ ...edit, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Low", "Medium", "High", "Critical"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
            <Input type="number" min={1} placeholder="SLA hours" value={edit.sla_hours} onChange={(e) => setEdit({ ...edit, sla_hours: e.target.value })} />
            <Input placeholder="Owner team" value={edit.owner_team} onChange={(e) => setEdit({ ...edit, owner_team: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><Switch checked={edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v })} />Shown to customers</label>
            <Button className="w-full" onClick={save}>Save</Button>
          </>)}
        </SheetContent>
      </Sheet>
    </div>
  );
}
