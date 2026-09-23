import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { reportePorTienda, reportePorTiendaRediseno } from "@/lib/marketing/reportes";
import { getUniqueFieldValues } from "@/lib/marketing/queries";
import { MARKETING_PORTADA_REDISENO } from "@/lib/marketing/portada-rediseno";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const anioStr = searchParams.get("anio");
  let anio: number | undefined;
  if (anioStr) {
    const parsed = parseInt(anioStr, 10);
    if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 2100) {
      return NextResponse.json({ error: "anio inválido" }, { status: 400 });
    }
    anio = parsed;
  }

  try {
    // Rediseño (22-sep-2026): la tienda es la del GASTO (código del
    // directorio), «General» al final, solo lo reportado. Las tiendas del
    // filtro salen de las mismas filas. Apagado el interruptor, lo de antes.
    if (MARKETING_PORTADA_REDISENO) {
      const filas = await reportePorTiendaRediseno(anio);
      const tiendas = filas.map((f) => f.tienda);
      return NextResponse.json({ items: filas, tiendas, anio: anio ?? null, rediseno: true });
    }
    const [items, tiendas] = await Promise.all([
      reportePorTienda(anio),
      getUniqueFieldValues("mk_proyectos", "tienda"),
    ]);
    return NextResponse.json({ items, tiendas, anio: anio ?? null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/reportes/tienda:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
