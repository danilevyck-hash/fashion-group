// ============================================================================
// Marketing — audit log helper
// ============================================================================
// Escribe en activity_logs (schema existente) con before/after empaquetados
// dentro de details JSON. No abrimos tabla nueva.
// ============================================================================
import { supabaseServer } from "@/lib/supabase-server";

export type AuditEntityType =
  | "mk_proyectos"
  | "mk_facturas"
  | "mk_factura_marcas"
  | "mk_proyecto_marcas"
  | "mk_adjuntos";

export type AuditAction =
  | "update"
  | "delete"
  | "delete_definitivo"
  | "bulk_update_marcas";

export interface LogAuditInput {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  userRole: string;
  userName?: string;
  before?: unknown;
  after?: unknown;
  extra?: Record<string, unknown>;
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  const details: Record<string, unknown> = {};
  if (input.userName) details.user_name = input.userName;
  if (input.before !== undefined) details.before = input.before;
  if (input.after !== undefined) details.after = input.after;
  if (input.extra) Object.assign(details, input.extra);

  const { error } = await supabaseServer.from("activity_logs").insert({
    user_role: input.userRole,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    details: JSON.stringify(details),
  });

  if (error) {
    console.error("[logAudit] insert failed:", error.message, {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }
}
