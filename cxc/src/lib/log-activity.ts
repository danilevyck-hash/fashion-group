import { supabaseServer } from "@/lib/supabase-server";

export async function logActivity(userRole: string, action: string, entityType?: string, entityId?: string, details?: string) {
  try {
    await supabaseServer.from("activity_logs").insert({ user_role: userRole, action, entity_type: entityType, entity_id: entityId, details });
  } catch { /* never fail */ }
}
