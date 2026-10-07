import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { getHistorialCambios } from "@/lib/marketing/historial";
import type { AuditEntityType } from "@/lib/marketing/audit";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TIPOS_VALIDOS: readonly AuditEntityType[] = [
  "mk_proyectos",
  "mk_facturas",
  "mk_factura_marcas",
  "mk_proyecto_marcas",
  "mk_adjuntos",
  "mk_entregas_muebles",
];

function esTipoValido(v: string | null): v is AuditEntityType {
  return !!v && (TIPOS_VALIDOS as readonly string[]).includes(v);
}

// GET /api/marketing/historial?entityType=mk_facturas&entityId=<uuid>
// Quién cambió este gasto, cuándo y qué — mismo rol que ve el módulo
// (ROLES_MARKETING: admin · secretaria · contabilidad, esta última solo mira).
export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!esTipoValido(entityType)) {
    return NextResponse.json({ error: "entityType inválido" }, { status: 400 });
  }
  if (!entityId || !uuidRegex.test(entityId)) {
    return NextResponse.json({ error: "entityId inválido" }, { status: 400 });
  }

  try {
    const cambios = await getHistorialCambios(entityType, entityId);
    return NextResponse.json(cambios);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("marketing/historial GET:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
