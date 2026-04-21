import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { reportePorTienda } from "@/lib/marketing/reportes";
import { getUniqueFieldValues } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
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
