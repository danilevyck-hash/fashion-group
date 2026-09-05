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
 *
 * ── 🔴 LA FECHA PASADA SOLO FRENA SI CAMBIÓ (5-sep-2026) ─────────────────────
 *
 * La regla nueva es «no se guarda para un día que ya pasó», porque el aviso sale
 * a las 9:00 a.m. Pero aplicada a rajatabla en el PUT dejaría **imposible editar
 * el texto de un recordatorio que se repite**: su `fecha` es el día en que
 * ARRANCÓ, casi siempre en el pasado, y volver a guardarlo lo rebotaría para
 * siempre. Por eso el freno mira si la fecha CAMBIÓ: si es la misma que estaba
 * guardada, pasa; si es otra, tiene que ser de mañana en adelante.
 *
 * El DESTINO se re-decide por rol en cada PUT, igual que en el alta: si no,
 * una secretaria podría editar un recordatorio ajeno y mandarlo al privado.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getSession } from "@/lib/require-auth";
import { RECORDATORIOS_ROLES } from "@/lib/recordatorios/roles";
import {
  FALTA_FECHA_PASADA,
  faltaParaGuardar,
  leerCuerpo,
  mensajeDeFalta,
} from "@/lib/recordatorios/recordatorio";
import { fechaPanama } from "@/lib/cheques-aviso-ventana";
import {
  actualizarRecordatorio,
  borrarRecordatorio,
  leerRecordatorio,
} from "@/lib/recordatorios/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, [...RECORDATORIOS_ROLES]);
  if (auth instanceof NextResponse) return auth;
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const rol = getSession(req)?.role ?? "";
  const nuevo = leerCuerpo(await req.json().catch(() => ({})), rol);
  const hoy = fechaPanama();

  const previo = await leerRecordatorio(params.id);
  if (!previo.ok) {
    // Un fallo de la base NO se disfraza de «ya no existe»: sería dar por
    // borrado algo que sigue ahí.
    if (previo.noEsta) {
      return NextResponse.json({ error: "Ese recordatorio ya no existe." }, { status: 404 });
    }
    console.error("[api/recordatorios] PUT lectura previa:", previo.error);
    return NextResponse.json({ error: previo.error }, { status: 400 });
  }

  // La fecha vieja pasa siempre; una fecha NUEVA tiene que ser de mañana en
  // adelante. Ver el encabezado.
  const cambioLaFecha = nuevo.fecha !== previo.recordatorio.fecha;
  const falta = faltaParaGuardar(nuevo, hoy).filter(
    (f) => f !== FALTA_FECHA_PASADA || cambioLaFecha,
  );
  if (falta.length) {
    return NextResponse.json({ error: mensajeDeFalta(falta) }, { status: 400 });
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
