import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { fetchVentasResumen } from "@/lib/ventas/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }

  try {
    const resumen = await fetchVentasResumen({ year });
    return NextResponse.json(resumen);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
