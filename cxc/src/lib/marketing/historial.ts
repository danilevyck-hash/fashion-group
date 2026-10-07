// ============================================================================
// Marketing — lee el historial que escribe `logAudit` (activity_logs).
// ============================================================================
import { supabaseServer } from "@/lib/supabase-server";
import type { AuditEntityType } from "./audit";

export interface CambioAuditoria {
  id: string;
  action: string;
  userRole: string;
  userName: string | null;
  createdAt: string;
  before: unknown;
  after: unknown;
}

function parseDetails(details: string | null): Pick<CambioAuditoria, "userName" | "before" | "after"> {
  if (!details) return { userName: null, before: undefined, after: undefined };
  try {
    const d = JSON.parse(details) as Record<string, unknown>;
    return {
      userName: typeof d.user_name === "string" ? d.user_name : null,
      before: d.before,
      after: d.after,
    };
  } catch {
    return { userName: null, before: undefined, after: undefined };
  }
}

/** Los cambios de UN registro (factura o entrega), del más nuevo al más viejo. */
export async function getHistorialCambios(
  entityType: AuditEntityType,
  entityId: string,
  limite = 50,
): Promise<CambioAuditoria[]> {
  const { data, error } = await supabaseServer
    .from("activity_logs")
    .select("id, action, user_role, details, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error || !data) return [];
  return data.map((row) => {
    const r = row as Record<string, unknown>;
    const parsed = parseDetails((r.details as string | null) ?? null);
    return {
      id: String(r.id),
      action: String(r.action),
      userRole: String(r.user_role),
      userName: parsed.userName,
      createdAt: String(r.created_at),
      before: parsed.before,
      after: parsed.after,
    };
  });
}
