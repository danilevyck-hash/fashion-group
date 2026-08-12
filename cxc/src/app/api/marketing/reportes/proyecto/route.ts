import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { reportePorProyecto } from "@/lib/marketing/reportes";
import type { FiltrosReporteProyecto } from "@/lib/marketing/reportes";

export const dynamic = "force-dynamic";

// El filtro `?estado=` se retiró el 11-ago-2026 junto con "Cerrar proyecto":
// la pantalla de reportes nunca lo mandaba y el estado dejó de existir como
// concepto visible del proyecto.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const anioStr = searchParams.get("anio");
  const marcaId = searchParams.get("marca_id") ?? undefined;
  const tienda = searchParams.get("tienda") ?? undefined;

  const filtros: FiltrosReporteProyecto = {};
  if (anioStr) {
    const parsed = parseInt(anioStr, 10);
    if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 2100) {
      return NextResponse.json({ error: "anio inválido" }, { status: 400 });
    }
    filtros.anio = parsed;
  }
  if (marcaId) filtros.marcaId = marcaId;
  if (tienda) filtros.tienda = tienda;

  try {
    const items = await reportePorProyecto(filtros);
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/reportes/proyecto:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
