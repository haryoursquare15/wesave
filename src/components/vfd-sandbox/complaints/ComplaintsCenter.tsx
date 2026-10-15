import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowLeftRight, Smartphone, PlusCircle, Users, Handshake, PiggyBank, SplitSquareHorizontal,
  UserCog, Receipt, ShieldAlert, ChevronRight, ImagePlus, X, CheckCircle2, Clock, Loader2, Plus, Send, Snowflake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { sandboxSupabase as sb } from "@/integrations/supabase/sandboxClient";
import { describeTransaction } from "@/lib/transactionLabels";
import { cn } from "@/lib/utils";

/** Open the complaints flow from anywhere: openComplaints({ txId }) */
export function openComplaints(detail: { txId?: string; view?: "list" | "new" } = {}) {
  window.dispatchEvent(new CustomEvent("vestara:complaints", { detail }));
}

const SERVICES = [
  { key: "transfers", label: "Transfers", icon: ArrowLeftRight, kw: ["transfer", "withdraw"] },
  { key: "bills", label: "Bills & airtime", icon: Smartphone, kw: ["bill", "airtime", "data", "electric", "cable"] },
  { key: "add_money", label: "Add money", icon: PlusCircle, kw: ["fund", "inflow", "deposit", "credit"] },
  { key: "ajo", label: "Ajo / Thrift", icon: Users, kw: ["thrift", "contribution", "payout", "ajo", "target", "group"] },
  { key: "escrow", label: "Escrow (P2P)", icon: Handshake, kw: ["escrow"] },
  { key: "savings", label: "Savings & investments", icon: PiggyBank, kw: ["saving", "lock", "goal", "vault", "invest", "interest"] },
  { key: "split", label: "Split pay", icon: SplitSquareHorizontal, kw: ["split"] },
  { key: "account", label: "Account & login", icon: UserCog, kw: [] },
  { key: "fees", label: "Fees & charges", icon: Receipt, kw: ["fee", "charge"] },
] as const;
const SERVICE_LABEL: Record<string, string> = { fraud: "Unauthorized transaction or fraud", ...Object.fromEntries(SERVICES.map((s) => [s.key, s.label])) };

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-primary/10 text-primary" },
  in_review: { label: "In review", cls: "bg-accent text-accent-foreground" },
  awaiting_reply: { label: "Awaiting your reply", cls: "bg-destructive/10 text-destructive" },
  resolved: { label: "Resolved", cls: "bg-success/10 text-success" },
  closed: { label: "Closed", cls: "bg-muted text-muted-foreground" },
};

type Cat = { service: string; issue_type: string; label: string; sla_hours: number };
type Tx = { id: string; transaction_type: string; amount: number; status: string; created_at: string; description: string | null; reversed_at: string | null; beneficiary_name?: string | null };
type Complaint = { id: string; ticket_no: string; service: string; issue_type: string; status: string; priority: string; created_at: string; resolved_at: string | null; sla_due_at: string | null; transaction_id: string | null; description: string };
type Ev = { id: string; actor_type: string; event_type: string; message: string | null; created_at: string };

const naira = (n: number) => `₦${Number(n).toLocaleString("en-NG")}`;
const dt = (s: string) => new Date(s).toLocaleString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const tile = "rounded-2xl border border-border bg-card active:scale-[0.97] active:bg-muted transition-transform";

function StatusChip({ s }: { s: string }) {
  const m = STATUS[s] ?? STATUS.open;
  return <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap", m.cls)}>{m.label}</span>;
}

export function ComplaintsCenter() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "service" | "issue" | "tx" | "describe" | "done" | "detail">("list");
  const [presetTx, setPresetTx] = useState<string | null>(null);
  const [service, setService] = useState<string | null>(null);
  const [issue, setIssue] = useState<Cat | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [freeze, setFreeze] = useState(false);
  const [fraudSheet, setFraudSheet] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; ticket_no: string; sla_hours: number } | null>(null);

  const reset = () => { setService(null); setIssue(null); setTxId(null); setFreeze(false); setCreated(null); };

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      reset(); setOpen(true);
      if (d.txId) { setPresetTx(d.txId); setTxId(d.txId); setView("service"); }
      else { setPresetTx(null); setView(d.view === "new" ? "service" : "list"); }
    };
    window.addEventListener("vestara:complaints", h);
    return () => window.removeEventListener("vestara:complaints", h);
  }, []);

  if (!open) return null;

  const back = () => {
    if (view === "list" || view === "done") return setOpen(false);
    if (view === "service") return presetTx ? setOpen(false) : setView("list");
    if (view === "issue") return setView("service");
    if (view === "tx") return setView("issue");
    if (view === "describe") return setView(presetTx ? "issue" : "tx");
    if (view === "detail") return setView("list");
  };
  const title = { list: "Complaints", service: "What's it about?", issue: "What happened?", tx: "Which transaction?", describe: "Tell us more", done: "Complaint sent", detail: "Complaint" }[view];

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto" style={{ minHeight: "100dvh" }}>
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border flex items-center gap-2 px-3 h-14">
        <button aria-label="Back" onClick={back} className="h-11 w-11 -ml-1 grid place-items-center rounded-xl active:bg-muted"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-base font-semibold flex-1">{title}</h1>
        {view === "list" && <Button size="sm" className="rounded-xl" onClick={() => { reset(); setPresetTx(null); setView("service"); }}><Plus className="h-4 w-4 mr-1" />New</Button>}
      </header>
      <main className="max-w-lg mx-auto p-4 pb-24">
        {view === "list" && <ComplaintList onOpen={(id) => { setDetailId(id); setView("detail"); }} onNew={() => setView("service")} />}
        {view === "service" && (
          <div className="space-y-3">
            <button onClick={() => setFraudSheet(true)} className={cn(tile, "w-full flex items-center gap-3 p-4 text-left border-destructive/30 bg-destructive/10")}>
              <div className="h-11 w-11 rounded-2xl bg-destructive grid place-items-center shrink-0"><ShieldAlert className="h-5 w-5 text-destructive-foreground" /></div>
              <div className="flex-1"><p className="font-semibold text-destructive">Unauthorized transaction or fraud</p><p className="text-xs text-muted-foreground">Handled first, around the clock</p></div>
              <ChevronRight className="h-4 w-4 text-destructive" />
            </button>
            <div className="grid grid-cols-2 gap-3">
              {SERVICES.map((s) => (
                <button key={s.key} onClick={() => { setService(s.key); setView("issue"); }} className={cn(tile, "p-4 text-left flex flex-col gap-3 min-h-[104px]")}>
                  <div className="h-10 w-10 rounded-2xl bg-primary/10 grid place-items-center"><s.icon className="h-5 w-5 text-primary" /></div>
                  <span className="text-sm font-medium leading-tight">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {view === "issue" && service && <IssueList service={service} onPick={(c) => { setIssue(c); setView(presetTx ? "describe" : "tx"); }} />}
        {view === "tx" && service && <TxPicker service={service} onPick={(id) => { setTxId(id); setView("describe"); }} onOpenExisting={(id) => { setDetailId(id); setView("detail"); }} />}
        {view === "describe" && service && issue && (
          <Describe service={service} issue={issue} txId={txId} freeze={freeze}
            onExisting={(id) => { setDetailId(id); setView("detail"); }}
            onDone={(c) => { setCreated(c); setView("done"); }} />
        )}
        {view === "done" && created && (
          <div className="text-center pt-8 space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-success/10 grid place-items-center"><CheckCircle2 className="h-8 w-8 text-success" /></div>
            <div><p className="text-sm text-muted-foreground">Your ticket number</p><p className="text-2xl font-bold tracking-wide">{created.ticket_no}</p></div>
            <p className="text-sm text-muted-foreground">We'll respond within {created.sla_hours < 24 ? `${created.sla_hours} hours` : `${Math.round(created.sla_hours / 24)} day${created.sla_hours >= 48 ? "s" : ""}`}. You'll get a notification when there's an update.</p>
            {freeze && <p className="text-sm rounded-2xl bg-destructive/10 text-destructive p-3">Your freeze request is with our fraud team as top priority.</p>}
            <Button className="w-full h-12 rounded-2xl" onClick={() => { setDetailId(created.id); setView("detail"); }}>Track this complaint</Button>
            <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>Done</Button>
          </div>
        )}
        {view === "detail" && detailId && <ComplaintDetail id={detailId} />}
      </main>

      <Sheet open={fraudSheet} onOpenChange={setFraudSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader><SheetTitle>Protect your money first</SheetTitle>
            <SheetDescription>If you think someone else is moving your money, ask us to freeze your account while we investigate.</SheetDescription></SheetHeader>
          <div className="flex flex-col gap-2 pt-4">
            <Button variant="destructive" className="h-12 rounded-2xl" onClick={() => { setFreeze(true); setService("fraud"); setFraudSheet(false); setView("issue"); }}><Snowflake className="h-4 w-4 mr-2" />Freeze my account now</Button>
            <Button variant="outline" className="h-12 rounded-2xl" onClick={() => { setFreeze(false); setService("fraud"); setFraudSheet(false); setView("issue"); }}>Continue to report</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ListSkeleton() { return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>; }

function ComplaintList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [rows, setRows] = useState<Complaint[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    sb.from("complaints").select("*").order("created_at", { ascending: false }).then(({ data, error }) => { if (error) setErr(true); setRows((data as Complaint[]) ?? []); });
  }, []);
  if (err) return <p className="text-sm text-destructive">We couldn't load your complaints. Pull down or try again shortly.</p>;
  if (!rows) return <ListSkeleton />;
  if (!rows.length) return (
    <div className="text-center pt-12 space-y-3">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 grid place-items-center"><CheckCircle2 className="h-7 w-7 text-primary" /></div>
      <p className="font-semibold">No complaints yet</p>
      <p className="text-sm text-muted-foreground">If something goes wrong, tell us and we'll sort it out.</p>
      <Button className="rounded-2xl h-12 px-6" onClick={onNew}>Report a problem</Button>
    </div>
  );
  return (
    <div className="space-y-3">
      {rows.map((c) => (
        <button key={c.id} onClick={() => onOpen(c.id)} className={cn(tile, "w-full p-4 text-left space-y-1")}>
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-mono text-muted-foreground">{c.ticket_no}</span><StatusChip s={c.status} /></div>
          <p className="text-sm font-medium">{SERVICE_LABEL[c.service] ?? c.service}</p>
          <p className="text-xs text-muted-foreground">{dt(c.created_at)}</p>
        </button>
      ))}
    </div>
  );
}

function IssueList({ service, onPick }: { service: string; onPick: (c: Cat) => void }) {
  const [cats, setCats] = useState<Cat[] | null>(null);
  useEffect(() => {
    sb.from("complaint_categories").select("service,issue_type,label,sla_hours").eq("service", service).eq("active", true).order("sort_order")
      .then(({ data }) => setCats((data as Cat[]) ?? []));
  }, [service]);
  if (!cats) return <ListSkeleton />;
  if (!cats.length) return <p className="text-sm text-muted-foreground">No issues set up for this service yet.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-1">{SERVICE_LABEL[service]}</p>
      {cats.map((c) => (
        <button key={c.issue_type} onClick={() => onPick(c)} className={cn(tile, "w-full flex items-center gap-3 p-4 text-left min-h-[56px]")}>
          <span className="flex-1 text-sm font-medium">{c.label}</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

function TxPicker({ service, onPick }: { service: string; onPick: (id: string | null) => void; onOpenExisting: (id: string) => void }) {
  const [rows, setRows] = useState<Tx[] | null>(null);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setRows([]); return; }
      const { data } = await sb.from("vfd_sandbox_transactions").select("id,transaction_type,amount,status,created_at,description,reversed_at,beneficiary_name").eq("user_id", user.id).in("status", ["failed", "reversed", "refunded"]).order("created_at", { ascending: false }).limit(100);
      const all = (data as Tx[]) ?? [];
      const kw = SERVICES.find((s) => s.key === service)?.kw ?? [];
      const hit = kw.length ? all.filter((t) => kw.some((k) => `${t.transaction_type} ${t.description ?? ""}`.toLowerCase().includes(k))) : all;
      setRows((hit.length ? hit : all).slice(0, 10));
    })();
  }, [service]);
  if (!rows) return <ListSkeleton />;
  return (
    <div className="space-y-2">
      <button onClick={() => onPick(null)} className={cn(tile, "w-full p-4 text-left text-sm font-medium")}>Not about a transaction</button>
      {rows.map((t) => {
        const info = describeTransaction(t as never);
        const st = (t.status ?? "").toLowerCase();
        const reversed = !!t.reversed_at || st.includes("revers") || st === "refunded";
        return (
          <button key={t.id} onClick={() => onPick(t.id)} className={cn(tile, "w-full flex items-center gap-3 p-4 text-left")}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{info?.title ?? t.transaction_type}</p>
              <p className="text-xs text-muted-foreground">{dt(t.created_at)}</p>
              <p className={cn("text-[11px] font-medium mt-0.5", reversed ? "text-success" : "text-destructive")}>
                {reversed ? `Reversed${t.reversed_at ? ` on ${dt(t.reversed_at)}` : ""} · money returned to your wallet` : "Failed · not yet reversed"}
              </p>
            </div>
            <span className="text-sm font-semibold">{naira(t.amount)}</span>
          </button>
        );
      })}
      {!rows.length && <p className="text-sm text-muted-foreground text-center pt-4">No failed transactions found.</p>}
    </div>
  );
}

function Describe({ service, issue, txId, freeze, onDone, onExisting }: {
  service: string; issue: Cat; txId: string | null; freeze: boolean;
  onDone: (c: { id: string; ticket_no: string; sla_hours: number }) => void; onExisting: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tx, setTx] = useState<Tx | null>(null);
  const [existing, setExisting] = useState<{ id: string; ticket_no: string } | null>(null);
  const [proceed, setProceed] = useState(false);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  useEffect(() => {
    if (!txId) return;
    sb.from("vfd_sandbox_transactions").select("id,transaction_type,amount,status,created_at,description,reversed_at").eq("id", txId).maybeSingle().then(({ data }) => setTx(data as Tx));
    sb.from("complaints").select("id,ticket_no").eq("transaction_id", txId).not("status", "in", "(resolved,closed)").maybeSingle().then(({ data }) => setExisting(data));
  }, [txId]);

  const st = (tx?.status ?? "").toLowerCase();
  const reversed = !!tx?.reversed_at || st.includes("revers") || st === "refunded";
  const processing = ["pending", "processing", "reserved", "initiated"].includes(st);

  if (existing) return (
    <div className="space-y-4 pt-4">
      <div className="rounded-2xl border border-border bg-card p-4"><p className="font-semibold">You already reported this</p>
        <p className="text-sm text-muted-foreground mt-1">Ticket {existing.ticket_no} is still open for this transaction.</p></div>
      <Button className="w-full h-12 rounded-2xl" onClick={() => onExisting(existing.id)}>View complaint</Button>
    </div>
  );
  if (tx && (reversed || processing) && !proceed) return (
    <div className="space-y-4 pt-2">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
        <div className="flex items-center gap-2">{reversed ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Clock className="h-5 w-5 text-primary" />}
          <p className="font-semibold">{reversed ? "This was already reversed" : "This is still processing"}</p></div>
        <p className="text-sm text-muted-foreground">{reversed
          ? `${naira(tx.amount)} was returned${tx.reversed_at ? ` on ${dt(tx.reversed_at)}` : ""}. It should already be in your balance.`
          : "Most transactions complete within a few minutes. Some bank transfers can take up to 24 hours."}</p>
      </div>
      <Button variant="outline" className="w-full h-12 rounded-2xl" onClick={() => setProceed(true)}>Still need help? Submit anyway</Button>
    </div>
  );

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) { toast.error("Only images can be attached"); continue; }
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is larger than 5MB`); continue; }
      if (next.length < 3) next.push(f);
    }
    setFiles(next);
  };

  const submit = async () => {
    setErr(null);
    if (text.trim().length < 15) return setErr("Please add a little more detail (at least 15 characters).");
    setBusy(true);
    try {
      const { data: u } = await sb.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Please sign in again.");
      const attachments = [];
      for (const f of files) {
        const path = `${uid}/${crypto.randomUUID()}.${(f.name.split(".").pop() || "jpg").toLowerCase()}`;
        const { error } = await sb.storage.from("complaint-attachments").upload(path, f, { contentType: f.type });
        if (error) throw new Error("An image failed to upload. Please try again.");
        attachments.push({ path, mime_type: f.type === "image/jpg" ? "image/jpeg" : f.type, size: f.size });
      }
      const { data, error } = await sb.functions.invoke("complaints", {
        body: { action: "create", service, issue_type: issue.issue_type, transaction_id: txId, description: text.trim(), freeze_requested: freeze, attachments },
      });
      if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        if (body?.existing) { onExisting(body.existing.id); return; }
        throw new Error(body?.error ?? "We couldn't submit your complaint. Please try again.");
      }
      toast.success("Complaint submitted");
      onDone(data.complaint);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-muted p-3 text-sm"><p className="font-medium">{issue.label}</p>
        {tx && <p className="text-xs text-muted-foreground mt-0.5">{naira(tx.amount)} · {dt(tx.created_at)} · {tx.status}</p>}</div>
      <div>
        <label className="text-sm font-medium" htmlFor="cdesc">Describe what happened</label>
        <Textarea id="cdesc" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={3000} className="mt-1 rounded-2xl" placeholder="What did you expect, and what happened instead?" />
        <p className={cn("text-xs mt-1", text.trim().length < 15 ? "text-muted-foreground" : "text-success")}>{text.trim().length}/15 characters minimum</p>
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Screenshots (optional, up to 3)</p>
        <div className="flex gap-2 flex-wrap">
          {previews.map((src, i) => (
            <div key={src} className="relative h-20 w-20 rounded-2xl overflow-hidden border border-border">
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button aria-label="Remove image" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/90 grid place-items-center"><X className="h-3 w-3" /></button>
            </div>
          ))}
          {files.length < 3 && (
            <label className="h-20 w-20 rounded-2xl border-2 border-dashed border-border grid place-items-center cursor-pointer active:bg-muted">
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button className="w-full h-12 rounded-2xl" disabled={busy} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit complaint"}</Button>
    </div>
  );
}

function ComplaintDetail({ id }: { id: string }) {
  const [c, setC] = useState<Complaint | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [atts, setAtts] = useState<{ url: string }[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: cc }, { data: ev }, { data: at }] = await Promise.all([
      sb.from("complaints").select("*").eq("id", id).maybeSingle(),
      sb.from("complaint_events").select("*").eq("complaint_id", id).order("created_at"),
      sb.from("complaint_attachments").select("storage_path").eq("complaint_id", id),
    ]);
    setC(cc as Complaint); setEvents((ev as Ev[]) ?? []);
    const signed = await Promise.all(((at as { storage_path: string }[]) ?? []).map((a) => sb.storage.from("complaint-attachments").createSignedUrl(a.storage_path, 600)));
    setAtts(signed.filter((s) => s.data?.signedUrl).map((s) => ({ url: s.data!.signedUrl })));
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (!c) return <ListSkeleton />;
  const closed = c.status === "resolved" || c.status === "closed";
  const canReopen = c.status === "resolved" && c.resolved_at && Date.now() - new Date(c.resolved_at).getTime() < 7 * 864e5;

  const sendReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    const { error } = await sb.from("complaint_events").insert({ complaint_id: id, actor_type: "user", event_type: "reply", message: reply.trim() });
    setBusy(false);
    if (error) return toast.error("Couldn't send your reply. Please try again.");
    setReply(""); toast.success("Reply sent"); void load();
  };
  const reopen = async () => {
    setBusy(true);
    const { error } = await sb.functions.invoke("complaints", { body: { action: "reopen", complaint_id: id } });
    setBusy(false);
    if (error) return toast.error("Couldn't reopen this complaint. Please start a new one.");
    toast.success("Complaint reopened"); void load();
  };
  const evLabel = (e: Ev) => e.event_type === "created" ? "You opened this complaint" : e.event_type === "reopened" ? "You reopened this complaint"
    : e.event_type === "freeze_requested" ? "Account freeze requested" : e.event_type.startsWith("status_") ? `Status: ${STATUS[e.event_type.slice(7)]?.label ?? ""}`
    : e.actor_type === "agent" ? "Vestara Support" : "You";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm">{c.ticket_no}</span><StatusChip s={c.status} /></div>
        <p className="font-semibold">{SERVICE_LABEL[c.service]}</p>
        {c.sla_due_at && !closed && <p className="text-xs text-muted-foreground">Expected response by {dt(c.sla_due_at)}</p>}
      </div>
      {atts.length > 0 && (
        <div className="flex gap-2">{atts.map((a) => (
          <button key={a.url} onClick={() => setViewer(a.url)} className="h-20 w-20 rounded-2xl overflow-hidden border border-border active:scale-95 transition-transform"><img src={a.url} alt="Attachment" className="h-full w-full object-cover" /></button>
        ))}</div>
      )}
      <ol className="relative border-l-2 border-border ml-2 space-y-4">
        {events.map((e) => (
          <li key={e.id} className="ml-4">
            <span className={cn("absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full", e.actor_type === "agent" ? "bg-primary" : e.actor_type === "system" ? "bg-muted-foreground" : "bg-foreground")} />
            <p className="text-xs text-muted-foreground">{evLabel(e)} · {dt(e.created_at)}</p>
            {e.message && <p className={cn("text-sm mt-1 rounded-2xl p-3 whitespace-pre-wrap break-words", e.actor_type === "agent" ? "bg-primary/10" : "bg-muted")}>{e.message}</p>}
          </li>
        ))}
      </ol>
      {!closed && (
        <div className="flex gap-2 items-end">
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={2000} placeholder="Write a reply" className="rounded-2xl" />
          <Button size="icon" className="h-11 w-11 rounded-2xl shrink-0" aria-label="Send reply" disabled={busy || !reply.trim()} onClick={sendReply}><Send className="h-4 w-4" /></Button>
        </div>
      )}
      {canReopen && <Button variant="outline" className="w-full h-12 rounded-2xl" disabled={busy} onClick={reopen}>Reopen complaint</Button>}
      <Sheet open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl"><SheetHeader><SheetTitle>Attachment</SheetTitle></SheetHeader>
          {viewer && <img src={viewer} alt="Attachment" className="mt-3 w-full max-h-[70dvh] object-contain rounded-2xl" />}</SheetContent>
      </Sheet>
    </div>
  );
}
