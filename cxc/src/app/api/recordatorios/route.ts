/**
 * GET / POST /api/recordatorios
 *
 * 🔴 **Admin y secretaria, igual que los cheques.** Daniel, a la pregunta de
 * quién los ve: *"admin y secre"*. Es la MISMA lista que ya usa el módulo
 * (`/api/cheques`), y se deriva de un solo lugar para que no puedan separarse.
 *
 * ⚠️ Sin la migración corrida el GET responde 200 con la lista vacía y
 * `faltaMigracion: true` — la pantalla muestra los cheques igual que siempre y
 * avisa en ámbar qué archivo falta. El POST sí responde 503 con ese aviso: un
 * "guardado" que no guarda nada es peor que un error.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/require-auth";
import { RECORDATORIOS_ROLES } from "@/lib/recordatorios/roles";
import {
  avisoMigracionRecordatorios,
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
    return NextResponse.json({
      recordatorios,
      faltaMigracion,
      aviso: faltaMigracion ? avisoMigracionRecordatorios() : null,
    });
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
    if (r.faltaMigracion) {
      return NextResponse.json({ error: avisoMigracionRecordatorios() }, { status: 503 });
    }
    console.error("[api/recordatorios] POST:", r.error);
    return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
  }
  return NextResponse.json(r.recordatorio);
}
