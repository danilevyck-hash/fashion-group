import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

interface ResumenMarca {
  marcaId: string;
  activos: number;
  porCobrar: number;
}

// GET /api/marketing/resumen-marcas
// Devuelve por cada marca:
//   - activos: # proyectos en estados abierto | por_cobrar | enviado (no cobrado, no anulado)
//   - porCobrar:
//       - Para proyectos 'abierto': SUM(factura.total) × porcentaje marca / 100
//       - Para cobranzas 'por_cobrar' o 'enviada': cobranza.monto
//       - NO incluye cobranzas 'cobrada' ni 'borrador' ni 'disputada'
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const [marcasRes, proyectosRes, proyMarcasRes, facturasRes, cobranzasRes] =
      await Promise.all([
        supabaseServer.from("mk_marcas").select("id"),
        supabaseServer
          .from("mk_proyectos")
          .select("id, estado")
          .is("anulado_en", null),
        supabaseServer
          .from("mk_proyecto_marcas")
          .select("proyecto_id, marca_id, porcentaje"),
        supabaseServer
          .from("mk_facturas")
          .select("proyecto_id, total")
          .is("anulado_en", null),
        supabaseServer
          .from("mk_cobranzas")
          .select("marca_id, proyecto_id, monto, estado")
          .is("anulado_en", null),
      ]);

    if (marcasRes.error) throw new Error(`marcas: ${marcasRes.error.message}`);
    if (proyectosRes.error) throw new Error(`proyectos: ${proyectosRes.error.message}`);
    if (proyMarcasRes.error) throw new Error(`proy_marcas: ${proyMarcasRes.error.message}`);
    if (facturasRes.error) throw new Error(`facturas: ${facturasRes.error.message}`);
    if (cobranzasRes.error) throw new Error(`cobranzas: ${cobranzasRes.error.message}`);

    const proyectos = (proyectosRes.data ?? []) as Array<{
      id: string;
      estado: string;
    }>;
    const estadoProy = new Map<string, string>();
    for (const p of proyectos) estadoProy.set(p.id, p.estado);

    const proyMarcas = (proyMarcasRes.data ?? []) as Array<{
      proyecto_id: string;
      marca_id: string;
      porcentaje: number;
    }>;

    const facturas = (facturasRes.data ?? []) as Array<{
      proyecto_id: string;
      total: number;
    }>;
    const totalFactByProy = new Map<string, number>();
    for (const f of facturas) {
      totalFactByProy.set(
        f.proyecto_id,
        (totalFactByProy.get(f.proyecto_id) ?? 0) + Number(f.total ?? 0),
      );
    }

    const cobranzas = (cobranzasRes.data ?? []) as Array<{
      marca_id: string;
      proyecto_id: string;
      monto: number;
      estado: string;
    }>;

    const marcaIds = (marcasRes.data ?? []).map(
      (m) => String((m as { id: string }).id),
    );

    const resumen = new Map<string, ResumenMarca>();
    for (const mid of marcaIds) {
      resumen.set(mid, { marcaId: mid, activos: 0, porCobrar: 0 });
    }

    // Contar ACTIVOS por marca (proyectos con estado no-cobrado no-anulado, que incluyan la marca)
    const ACTIVOS_ESTADOS = new Set(["abierto", "por_cobrar", "enviado"]);
    const proyectosPorMarca = new Map<string, Set<string>>();
    for (const pm of proyMarcas) {
      const estado = estadoProy.get(pm.proyecto_id);
      if (!estado || !ACTIVOS_ESTADOS.has(estado)) continue;
      const set = proyectosPorMarca.get(pm.marca_id) ?? new Set();
      set.add(pm.proyecto_id);
      proyectosPorMarca.set(pm.marca_id, set);
    }
    for (const [mid, set] of proyectosPorMarca) {
      const entry = resumen.get(mid);
      if (entry) entry.activos = set.size;
    }

    // POR COBRAR — parte 1: proyectos abiertos (aún sin cobranza generada)
    for (const pm of proyMarcas) {
      const estado = estadoProy.get(pm.proyecto_id);
      if (estado !== "abierto") continue;
      const totalFact = totalFactByProy.get(pm.proyecto_id) ?? 0;
      const monto = (totalFact * Number(pm.porcentaje ?? 0)) / 100;
      const entry = resumen.get(pm.marca_id);
      if (entry) entry.porCobrar += monto;
    }

    // POR COBRAR — parte 2: cobranzas vigentes no cobradas
    const COBRAR_ESTADOS = new Set(["por_cobrar", "enviada"]);
    for (const c of cobranzas) {
      if (!COBRAR_ESTADOS.has(c.estado)) continue;
      const entry = resumen.get(c.marca_id);
      if (entry) entry.porCobrar += Number(c.monto ?? 0);
    }

    const out: ResumenMarca[] = Array.from(resumen.values()).map((r) => ({
      marcaId: r.marcaId,
      activos: r.activos,
      porCobrar: Number(r.porCobrar.toFixed(2)),
    }));

    const res = NextResponse.json(out);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/resumen-marcas:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
