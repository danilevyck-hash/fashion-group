import { supabaseServer } from "@/lib/supabase-server";

/**
 * Server-side: log activity directly to DB.
 * Use in API routes where you already have the session info.
 */
export async function logActivity(
  userRole: string,
  action: string,
  module: string,
  details?: Record<string, unknown>,
  userName?: string,
) {
  try {
    await supabaseServer.from("activity_logs").insert({
      user_role: userRole,
      user_name: userName || null,
      action,
      module,
      details: details || null,
    });
  } catch {
    /* never fail the parent operation */
  }
}
