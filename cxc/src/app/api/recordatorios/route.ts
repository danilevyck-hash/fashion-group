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
 *
 * ── 🔴 DOS CANDADOS DEL REDISEÑO (5-sep-2026) ────────────────────────────────
 *
 * 1. **El DESTINO lo decide el ROL, no el cuerpo.** `leerCuerpo` recibe el rol
 *    de la sesión y lo pasa por `destinoPermitido`: una secretaria no ve la
 *    opción en pantalla, pero tampoco la puede mandar a mano. Esconder el
 *    control es cortesía; esto es el candado.
 * 2. **No se guarda para un día que ya pasó.** El aviso sale a las 9:00 a.m. de
 *    Panamá, así que «hoy» ya pasó y el primero disponible es MAÑANA. La fecha
 *    de hoy sale de PANAMÁ (`fechaPanama`), nunca del reloj del servidor.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-auth";
import { RECORDATORIOS_ROLES } from "@/lib/recordatorios/roles";
import {
  faltaParaGuardar,
  leerCuerpo,
  mensajeDeFalta,
} from "@/lib/recordatorios/recordatorio";
import { fechaPanama } from "@/lib/cheques-aviso-ventana";
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
  const nuevo = leerCuerpo(await req.json().catch(() => ({})), s.role);
  const falta = faltaParaGuardar(nuevo, fechaPanama());
  if (falta.length) {
    return NextResponse.json({ error: mensajeDeFalta(falta) }, { status: 400 });
  }

  const r = await crearRecordatorio(nuevo, s.userName || s.role);
  if (!r.ok) {
    console.error("[api/recordatorios] POST:", r.error);
    return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
  }
  return NextResponse.json(r.recordatorio);
}
