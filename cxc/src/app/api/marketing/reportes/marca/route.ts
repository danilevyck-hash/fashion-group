import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { reportePorMarca } from "@/lib/marketing/reportes";

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
    const items = await reportePorMarca(anio);
    return NextResponse.json({ items, anio: anio ?? null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/reportes/marca:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
