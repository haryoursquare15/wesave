import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Create = z.object({
  action: z.literal("create"),
  service: z.string().min(1).max(40),
  issue_type: z.string().min(1).max(60),
  transaction_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(15).max(3000),
  freeze_requested: z.boolean().optional(),
  attachments: z.array(z.object({
    path: z.string().min(1).max(300),
    mime_type: z.string().regex(/^image\/(png|jpe?g|webp|heic|gif)$/),
    size: z.number().int().positive().max(5 * 1024 * 1024),
  })).max(3).optional(),
});
const Reopen = z.object({ action: z.literal("reopen"), complaint_id: z.string().uuid() });
const Body = z.discriminatedUnion("action", [Create, Reopen]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: authErr } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    const uid = claims?.claims?.sub as string | undefined;
    if (authErr || !uid) return json({ error: "Please sign in again." }, 401);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Please check the details and try again.", fields: parsed.error.flatten().fieldErrors }, 400);
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = parsed.data;

    if (b.action === "reopen") {
      const { data: c } = await db.from("complaints").select("id,user_id,status,resolved_at").eq("id", b.complaint_id).maybeSingle();
      if (!c || c.user_id !== uid) return json({ error: "Complaint not found." }, 404);
      if (c.status !== "resolved" || !c.resolved_at || Date.now() - new Date(c.resolved_at).getTime() > 7 * 864e5)
        return json({ error: "This complaint can no longer be reopened. Please start a new one." }, 400);
      await db.from("complaints").update({ status: "open", resolved_at: null }).eq("id", c.id);
      await db.from("complaint_events").insert({ complaint_id: c.id, actor_type: "user", event_type: "reopened", message: null });
      return json({ ok: true });
    }

    // Rate limit: 5 per hour
    const since = new Date(Date.now() - 3600e3).toISOString();
    const { count } = await db.from("complaints").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", since);
    if ((count ?? 0) >= 5) return json({ error: "You've sent several complaints in the last hour. Please try again a little later." }, 429);

    const { data: cat } = await db.from("complaint_categories").select("priority,sla_hours").eq("service", b.service).eq("issue_type", b.issue_type).eq("active", true).maybeSingle();
    if (!cat) return json({ error: "Please pick an issue from the list." }, 400);

    if (b.transaction_id) {
      const { data: tx } = await db.from("vfd_sandbox_transactions").select("id,user_id").eq("id", b.transaction_id).maybeSingle();
      if (!tx || tx.user_id !== uid) return json({ error: "We couldn't find that transaction on your account." }, 400);
      const { data: open } = await db.from("complaints").select("id,ticket_no").eq("transaction_id", b.transaction_id).not("status", "in", "(resolved,closed)").maybeSingle();
      if (open) return json({ error: "You already have an open complaint for this transaction.", existing: open }, 409);
    }
    for (const a of b.attachments ?? []) if (!a.path.startsWith(`${uid}/`)) return json({ error: "Attachment upload failed. Please try again." }, 400);

    const priority = b.service === "fraud" ? "Critical" : cat.priority;
    const { data: ticket } = await db.rpc("next_complaint_ticket_no");
    const sla = new Date(Date.now() + cat.sla_hours * 3600e3).toISOString();
    const { data: c, error } = await db.from("complaints").insert({
      ticket_no: ticket, user_id: uid, service: b.service, issue_type: b.issue_type,
      transaction_id: b.transaction_id ?? null, description: b.description, priority, sla_due_at: sla,
      freeze_requested: !!b.freeze_requested,
    }).select("id,ticket_no,sla_due_at").single();
    if (error) {
      if (error.code === "23505") return json({ error: "You already have an open complaint for this transaction." }, 409);
      console.error("complaint insert failed", error.code);
      return json({ error: "We couldn't submit your complaint. Please try again." }, 500);
    }
    await db.from("complaint_events").insert({ complaint_id: c.id, actor_type: "user", event_type: "created", message: b.description });
    if (b.freeze_requested) await db.from("complaint_events").insert({ complaint_id: c.id, actor_type: "system", event_type: "freeze_requested", message: "Account freeze requested by customer" });
    if (b.attachments?.length) await db.from("complaint_attachments").insert(b.attachments.map((a) => ({ complaint_id: c.id, storage_path: a.path, mime_type: a.mime_type, size: a.size })));
    return json({ ok: true, complaint: { ...c, sla_hours: cat.sla_hours } });
  } catch (e) {
    console.error("complaints error", (e as Error).message);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
