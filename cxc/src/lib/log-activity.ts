import { supabaseServer } from "@/lib/supabase-server";

/**
 * Server-side: log activity directly to DB.
 * Use in API routes where you already have the session info.
 *
 * Schema: activity_logs(user_role, action, entity_type, entity_id, details text).
 * `module` maps to entity_type; userName is merged into details (no column).
 */
export async function logActivity(
  userRole: string,
  action: string,
  module: string,
  details?: Record<string, unknown>,
  userName?: string,
) {
  const merged =
    userName && details ? { ...details, user_name: userName } :
    userName ? { user_name: userName } :
    details || null;

  const { error } = await supabaseServer.from("activity_logs").insert({
    user_role: userRole,
    action,
    entity_type: module,
    details: merged ? JSON.stringify(merged) : null,
  });

  if (error) console.error("[logActivity] insert failed:", error.message, { action, module });
}
