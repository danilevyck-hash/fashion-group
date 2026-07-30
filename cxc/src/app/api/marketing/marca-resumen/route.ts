import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { esMultifashion } from "@/lib/marketing/multifashion";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// GET /api/marketing/marca-resumen
// Totales para las cards de Nivel 1 (rediseño por marca):
//   - legacy: { count, total } sobre facturas grupo_legacy=true (card "Tommy y Calvin").
//   - porMarca[marca_id]: { count, total } sobre facturas NO-legacy, gasto repartido
//     por porcentaje entre las marcas de cada factura (1 marca = total completo).
//   - multifashion: { count, total } — bucket INDEPENDIENTE (ver lib/marketing/
//     multifashion.ts). Sus facturas NO se cuentan en legacy ni en porMarca: si se
//     contaran en los dos lados, la suma de las cards daría más que el gasto real.
// Solo facturas no anuladas.

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const [facturasRes, fmRes, proyRes] = await Promise.all([
      supabaseServer
        .from("mk_facturas")
        .select("id, proyecto_id, total, grupo_legacy, impulsadora_id")
        .is("anulado_en", null),
      supabaseServer
        .from("mk_factura_marcas")
        .select("factura_id, marca_id, porcentaje"),
      supabaseServer
        .from("mk_proyectos")
        .select("id, tienda, tienda_codigo")
        .is("anulado_en", null),
    ]);

    if (facturasRes.error) throw new Error(`facturas: ${facturasRes.error.message}`);
    if (fmRes.error) throw new Error(`factura_marcas: ${fmRes.error.message}`);
    if (proyRes.error) throw new Error(`proyectos: ${proyRes.error.message}`);

    const facturas = (facturasRes.data ?? []) as Array<{
      id: string;
      proyecto_id: string | null;
      total: number | null;
      grupo_legacy?: boolean;
      impulsadora_id?: string | null;
    }>;
    const fm = (fmRes.data ?? []) as Array<{
      factura_id: string;
      marca_id: string;
      porcentaje: number | null;
    }>;

    const proyectosMf = new Set(
      (
        (proyRes.data ?? []) as Array<{
          id: string;
          tienda: string | null;
          tienda_codigo: string | null;
        }>
      )
        .filter((p) => esMultifashion(p))
        .map((p) => String(p.id)),
    );
    const facturaEsMf = (proyectoId: string | null): boolean =>
      !!proyectoId && proyectosMf.has(String(proyectoId));

    const facturaById = new Map(
      facturas.map((f) => [
        String(f.id),
        {
          total: Number(f.total ?? 0),
          legacy: !!f.grupo_legacy,
          impulsadora: !!f.impulsadora_id,
          multifashion: facturaEsMf(f.proyecto_id),
        },
      ]),
    );

    // Legacy: cuenta y suma directa de facturas legacy, SIN Multifashion.
    let legacyCount = 0;
    let legacyTotal = 0;
    let mfCount = 0;
    let mfTotal = 0;
    for (const f of facturas) {
      if (facturaEsMf(f.proyecto_id)) {
        mfCount += 1;
        mfTotal += Number(f.total ?? 0);
        continue;
      }
      if (f.grupo_legacy) {
        legacyCount += 1;
        legacyTotal += Number(f.total ?? 0);
      }
    }

    // Agrupar factura_marcas por factura para repartir el total por porcentaje.
    const rowsByFactura = new Map<string, Array<{ mid: string; pct: number }>>();
    for (const r of fm) {
      const fid = String(r.factura_id);
      if (!facturaById.has(fid)) continue;
      const arr = rowsByFactura.get(fid) ?? [];
      arr.push({ mid: String(r.marca_id), pct: Number(r.porcentaje ?? 0) });
      rowsByFactura.set(fid, arr);
    }

    const porMarca: Record<string, { count: number; total: number }> = {};
    // Sub-total de impulsadoras por marca (subconjunto de porMarca) — para que el
    // drill-down de la marca pueda mostrar "Impulsadoras: $X" y cuadrar la card.
    const impulsadoraPorMarca: Record<string, { count: number; total: number }> = {};
    const bump = (
      acc: Record<string, { count: number; total: number }>,
      mid: string,
      monto: number,
    ) => {
      const cur = acc[mid] ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += monto;
      acc[mid] = cur;
    };
    for (const [fid, rows] of rowsByFactura) {
      const info = facturaById.get(fid)!;
      if (info.multifashion) continue; // Multifashion tiene su propia card
      if (info.legacy) continue; // legacy va al bucket "Tommy y Calvin", no a las marcas
      const sumPct = rows.reduce((s, x) => s + x.pct, 0) || 1;
      for (const r of rows) {
        const monto = info.total * (r.pct / sumPct);
        bump(porMarca, r.mid, monto);
        if (info.impulsadora) bump(impulsadoraPorMarca, r.mid, monto);
      }
    }
    // Redondear a 2 decimales.
    for (const k of Object.keys(porMarca)) {
      porMarca[k].total = Number(porMarca[k].total.toFixed(2));
    }
    for (const k of Object.keys(impulsadoraPorMarca)) {
      impulsadoraPorMarca[k].total = Number(impulsadoraPorMarca[k].total.toFixed(2));
    }

    const res = NextResponse.json({
      legacy: { count: legacyCount, total: Number(legacyTotal.toFixed(2)) },
      multifashion: { count: mfCount, total: Number(mfTotal.toFixed(2)) },
      porMarca,
      impulsadoraPorMarca,
    });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/marca-resumen:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
