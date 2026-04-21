import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { reportePorProyecto } from "@/lib/marketing/reportes";
import type { FiltrosReporteProyecto } from "@/lib/marketing/reportes";
import type { EstadoProyecto } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

const ESTADOS: ReadonlyArray<EstadoProyecto> = ["abierto", "enviado", "cobrado"];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const anioStr = searchParams.get("anio");
  const marcaId = searchParams.get("marca_id") ?? undefined;
  const tienda = searchParams.get("tienda") ?? undefined;
  const estadoStr = searchParams.get("estado") ?? undefined;

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
  if (estadoStr) {
    if (!ESTADOS.includes(estadoStr as EstadoProyecto)) {
      return NextResponse.json({ error: "estado inválido" }, { status: 400 });
    }
    filtros.estado = estadoStr as EstadoProyecto;
  }

  try {
    const items = await reportePorProyecto(filtros);
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/reportes/proyecto:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
