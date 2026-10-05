// Ventas › Resumen con «Rango de fechas» (5-oct-2026). GET ?desde=&hasta=
// → la venta, utilidad y margen por empresa, contra los mismos días del año pasado.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { rangoValido } from "@/lib/ventas/rango-ventas";
import { leerResumenRango } from "@/lib/ventas/resumen-rango-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const rango = rangoValido(req.nextUrl.searchParams.get("desde"), req.nextUrl.searchParams.get("hasta"));
  if (!rango) return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
  try {
    return NextResponse.json(await leerResumenRango(rango.desde, rango.hasta));
  } catch (e) {
    console.error("[ventas/resumen-rango]", e);
    return NextResponse.json({ error: "No se pudo calcular el rango. Intenta de nuevo." }, { status: 500 });
  }
}
