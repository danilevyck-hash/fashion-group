import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getVentasMensuales } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;
  const año = req.nextUrl.searchParams.get("anio");
  const empresa = req.nextUrl.searchParams.get("empresa");
  if (!año) return NextResponse.json({ error: "año required" }, { status: 400 });

  try {
    const rows = await getVentasMensuales(parseInt(año));
    let filtered = rows;
    if (empresa) filtered = rows.filter(r => r.empresa === empresa);
    // Map to legacy format expected by ReportExport consumer
    const legacy = filtered.map(r => ({
      empresa: r.empresa,
      mes: r.mes,
      ventas_brutas: r.ventas_netas,
      notas_credito: 0,
      costo_total: r.costo,
      utilidad: r.utilidad,
    }));
    return NextResponse.json(legacy);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
