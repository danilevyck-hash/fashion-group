// GET /api/asistencia/correcciones/motivos → { motivos: string[] }
//
// Los botones de «Por qué» de la ventana «Corregir la hora» (11-sep-2026):
// los 4 motivos más escritos en los últimos 90 días, con 2 o más usos. Se
// ARMAN SOLOS de lo que ya se guardó en `asistencia_correcciones` — ninguna
// lista escrita a mano, ninguna tabla nueva, solo lectura. Sin historia, vacío.
//
// La regla vive en `lib/asistencia/motivos-frecuentes.ts`; acá solo se junta.

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { leerMotivosFrecuentes } from "@/lib/asistencia/correcciones-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ motivos: await leerMotivosFrecuentes() });
}
