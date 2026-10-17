// Inserts an in-app notification for every staff admin. The existing
// user_notifications triggers fan each row out to email and push, so this
// one insert path reaches admins on every channel. Best-effort: failures
// are logged, never thrown.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const ADMIN_ROLES = ["admin", "super_admin", "compliance_admin", "operations_admin"];

export async function notifyAdmins(
  supabaseAdmin: SupabaseClient,
  opts: { type: string; title: string; message: string },
): Promise<void> {
  try {
    const { data: roleRows, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ADMIN_ROLES);
    if (error) {
      console.error("[notify-admins] role lookup failed:", error.message);
      return;
    }
    const userIds = Array.from(new Set((roleRows ?? []).map((r) => r.user_id as string)));
    if (userIds.length === 0) return;

    const { error: insertError } = await supabaseAdmin.from("user_notifications").insert(
      userIds.map((uid) => ({
        user_id: uid,
        notification_type: opts.type.slice(0, 60),
        title: opts.title.slice(0, 200),
        message: opts.message.slice(0, 2000),
      })),
    );
    if (insertError) console.error("[notify-admins] insert failed:", insertError.message);
  } catch (e) {
    console.error("[notify-admins] unexpected error:", e);
  }
}
