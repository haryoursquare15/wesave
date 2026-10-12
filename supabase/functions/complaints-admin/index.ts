import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const STATUSES = ["open", "in_review", "awaiting_reply", "resolved", "closed"] as const;
const PRIOS = ["Low", "Medium", "High", "Critical"] as const;
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), status: z.string().max(20).optional(), service: z.string().max(40).optional(), search: z.string().max(60).optional() }),
  z.object({ action: z.literal("detail"), id: z.string().uuid() }),
  z.object({ action: z.literal("update"), id: z.string().uuid(), status: z.enum(STATUSES).optional(), priority: z.enum(PRIOS).optional(), assign_to_me: z.boolean().optional(), unassign: z.boolean().optional() }),
  z.object({ action: z.literal("reply"), id: z.string().uuid(), message: z.string().trim().min(1).max(2000), internal: z.boolean().optional(), set_status: z.enum(STATUSES).optional() }),
  z.object({ action: z.literal("categories") }),
  z.object({ action: z.literal("save_category"), id: z.string().uuid().optional(), service: z.string().min(1).max(40), issue_type: z.string().regex(/^[a-z0-9_]{2,60}$/), label: z.string().min(3).max(120), priority: z.enum(PRIOS), sla_hours: z.number().int().min(1).max(720), owner_team: z.string().min(1).max(40), active: z.boolean() }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: cl } = await db.auth.getClaims(token);
    const uid = cl?.claims?.sub as string | undefined;
    if (!uid) return json({ error: "Please sign in again." }, 401);
    const [{ data: isAdmin }, { data: canSupport }] = await Promise.all([
      db.rpc("is_any_admin", { _user_id: uid }),
      db.rpc("has_permission", { _user_id: uid, _permission: "support.view" }),
    ]);
    if (!isAdmin && !canSupport) return json({ error: "Not allowed." }, 403);

    const p = Body.safeParse(await req.json());
    if (!p.success) return json({ error: "Invalid request", fields: p.error.flatten().fieldErrors }, 400);
    const b = p.data;

    if (b.action === "list") {
      let q = db.from("complaints").select("*").order("created_at", { ascending: false }).limit(300);
      if (b.status && b.status !== "all") q = b.status === "active" ? q.not("status", "in", "(resolved,closed)") : q.eq("status", b.status);
      if (b.service && b.service !== "all") q = q.eq("service", b.service);
      if (b.search) q = q.ilike("ticket_no", `%${b.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((c) => c.user_id))];
      const { data: profs } = ids.length ? await db.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] };
      const pm = new Map((profs ?? []).map((x: any) => [x.id, x]));
      return json({ rows: (data ?? []).map((c) => ({ ...c, user_name: pm.get(c.user_id)?.full_name ?? null, user_email: pm.get(c.user_id)?.email ?? null })) });
    }
    if (b.action === "detail") {
      const { data: c } = await db.from("complaints").select("*").eq("id", b.id).maybeSingle();
      if (!c) return json({ error: "Not found" }, 404);
      const [{ data: ev }, { data: at }, { data: prof }, tx] = await Promise.all([
        db.from("complaint_events").select("*").eq("complaint_id", b.id).order("created_at"),
        db.from("complaint_attachments").select("*").eq("complaint_id", b.id),
        db.from("profiles").select("full_name,email,account_status").eq("id", c.user_id).maybeSingle(),
        c.transaction_id ? db.from("vfd_sandbox_transactions").select("id,transaction_type,amount,status,reference,vfd_reference,session_id,beneficiary_name,beneficiary_account,beneficiary_bank,description,created_at,reversed_at").eq("id", c.transaction_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const atts = await Promise.all((at ?? []).map(async (a) => ({ ...a, url: (await db.storage.from("complaint-attachments").createSignedUrl(a.storage_path, 900)).data?.signedUrl ?? null })));
      return json({ complaint: c, events: ev ?? [], attachments: atts, user: prof, transaction: tx.data });
    }
    if (b.action === "update") {
      const patch: Record<string, unknown> = {};
      if (b.status) patch.status = b.status;
      if (b.priority) patch.priority = b.priority;
      if (b.assign_to_me) patch.assigned_to = uid;
      if (b.unassign) patch.assigned_to = null;
      if (!Object.keys(patch).length) return json({ error: "Nothing to change" }, 400);
      const { error } = await db.from("complaints").update(patch).eq("id", b.id);
      if (error) throw error;
      if (b.priority) await db.from("complaint_events").insert({ complaint_id: b.id, actor_type: "system", event_type: "internal_note", message: `Priority set to ${b.priority}` });
      await db.from("audit_logs").insert({ user_id: uid, action: "complaint_update", resource_type: "complaint", resource_id: b.id, details: patch }).then(() => {}, () => {});
      return json({ ok: true });
    }
    if (b.action === "reply") {
      const { error } = await db.from("complaint_events").insert({ complaint_id: b.id, actor_type: "agent", event_type: b.internal ? "internal_note" : "reply", message: b.message });
      if (error) throw error;
      if (b.set_status) await db.from("complaints").update({ status: b.set_status }).eq("id", b.id);
      else await db.from("complaints").update({ updated_at: new Date().toISOString() }).eq("id", b.id);
      return json({ ok: true });
    }
    if (b.action === "categories") {
      const { data } = await db.from("complaint_categories").select("*").order("service").order("sort_order");
      return json({ rows: data ?? [] });
    }
    if (b.action === "save_category") {
      const { id, ...row } = b as any; delete row.action;
      const { error } = id ? await db.from("complaint_categories").update(row).eq("id", id) : await db.from("complaint_categories").insert(row);
      if (error) return json({ error: error.code === "23505" ? "That issue already exists for this service." : "Could not save." }, 400);
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("complaints-admin", (e as Error).message);
    return json({ error: "Something went wrong" }, 500);
  }
});
