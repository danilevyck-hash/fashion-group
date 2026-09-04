/**
 * GET / POST /api/recordatorios
 *
 * 🔴 **Admin y secretaria, igual que los cheques.** Daniel, a la pregunta de
 * quién los ve: *"admin y secre"*. Es la MISMA lista que ya usa el módulo
 * (`/api/cheques`), y se deriva de un solo lugar para que no puedan separarse.
 *
 * Historia (ago-2026): sin la migración corrida el GET respondía 200 con la
 * lista vacía y `faltaMigracion: true` (aviso en ámbar), y el POST un 503 con el
 * nombre del archivo. Tolerancia retirada el 3-sep-2026: la tabla existe desde
 * 20260824120000_recordatorios.sql (verificado en producción). Hoy cualquier
 * error de la base es un 500 con el mensaje humano de siempre. `faltaMigracion`
 * sigue viajando en el GET (siempre `false`) porque la pantalla lo lee.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-auth";
import { RECORDATORIOS_ROLES } from "@/lib/recordatorios/roles";
import {
  faltaParaGuardar,
  leerCuerpo,
} from "@/lib/recordatorios/recordatorio";
import { crearRecordatorio, leerRecordatorios } from "@/lib/recordatorios/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = getSession(req);
  if (!s || !RECORDATORIOS_ROLES.includes(s.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  try {
    const { recordatorios, faltaMigracion } = await leerRecordatorios();
    return NextResponse.json({ recordatorios, faltaMigracion, aviso: null });
  } catch (err) {
    console.error("[api/recordatorios] GET:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const s = getSession(req);
  if (!s || !RECORDATORIOS_ROLES.includes(s.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const nuevo = leerCuerpo(await req.json().catch(() => ({})));
  const falta = faltaParaGuardar(nuevo);
  if (falta.length) {
    return NextResponse.json({ error: `Falta: ${falta.join(" y ")}` }, { status: 400 });
  }

  const r = await crearRecordatorio(nuevo, s.userName || s.role);
  if (!r.ok) {
    console.error("[api/recordatorios] POST:", r.error);
    return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
  }
  return NextResponse.json(r.recordatorio);
}
