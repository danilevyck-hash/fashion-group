// GET /api/multifashion/dia?fecha=YYYY-MM-DD — la tarjeta del día de la gráfica
// de Multifashion › Resumen (`MULTIFASHION_TARJETA_DIA_2026_11`). Solo lee.
// Reglas en `lib/multifashion/tarjeta-dia.ts`; lectura en `tarjeta-dia-server.ts`.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MULTIFASHION } from "@/lib/multifashion/acceso";
import { hoyPanama } from "@/lib/fecha-panama";
import { esFechaValida } from "@/lib/multifashion/tarjeta-dia";
import { leerTarjetaDelDia } from "@/lib/multifashion/tarjeta-dia-server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ROLES_MULTIFASHION);
  if (auth instanceof NextResponse) return auth;

  const fecha = req.nextUrl.searchParams.get("fecha") ?? "";
  const hoy = hoyPanama();
  // Los días futuros no se tocan, tampoco aquí.
  if (!esFechaValida(fecha) || fecha > hoy) {
    return NextResponse.json({ error: "fecha inválida" }, { status: 400 });
  }
  try {
    return NextResponse.json(await leerTarjetaDelDia(fecha, hoy));
  } catch (err) {
    console.error("[multifashion/dia]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "error inesperado" }, { status: 500 });
  }
}
