/**
 * PUT / DELETE /api/recordatorios/[id]
 *
 * Mismo permiso que el alta: **admin y secretaria**. Borrar es SOFT DELETE
 * (`deleted = true`), como el resto del módulo — la fila queda.
 *
 * Historia (ago-2026): si la escritura decía "falta la migración", se
 * respondía 503 con el nombre del archivo SQL. Tolerancia retirada el
 * 3-sep-2026: la tabla existe desde 20260824120000_recordatorios.sql; hoy un
 * error de la base es un error, con su mensaje.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { RECORDATORIOS_ROLES } from "@/lib/recordatorios/roles";
import {
  faltaParaGuardar,
  leerCuerpo,
} from "@/lib/recordatorios/recordatorio";
import { actualizarRecordatorio, borrarRecordatorio } from "@/lib/recordatorios/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, [...RECORDATORIOS_ROLES]);
  if (auth instanceof NextResponse) return auth;
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const nuevo = leerCuerpo(await req.json().catch(() => ({})));
  const falta = faltaParaGuardar(nuevo);
  if (falta.length) {
    return NextResponse.json({ error: `Falta: ${falta.join(" y ")}` }, { status: 400 });
  }

  const r = await actualizarRecordatorio(params.id, nuevo);
  if (!r.ok) {
    console.error("[api/recordatorios] PUT:", r.error);
    return NextResponse.json({ error: r.error }, { status: 400 });
  }
  return NextResponse.json(r.recordatorio);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, [...RECORDATORIOS_ROLES]);
  if (auth instanceof NextResponse) return auth;
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const r = await borrarRecordatorio(params.id);
  if (!r.ok) {
    console.error("[api/recordatorios] DELETE:", r.error);
    return NextResponse.json({ error: r.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
