import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// GET /api/marketing/proyectos-lista
//   ?filtro_estado=activos|todos|abierto|por_cobrar|enviado|cobrado
//   ?marca_id=<uuid>  → solo proyectos con ≥1 factura de esa marca
//   ?busqueda=<str>   → match en nombre o tienda (ILIKE)
//
// Respuesta: Array<ProyectoListItem>
// Calcula por_cobrar usando mk_factura_marcas + cobranzas.
// Por cobrar = facturas de proyecto 'abierto' (sin cobranza generada)
//              + cobranzas en 'por_cobrar' o 'enviada' (monto ya fijado).
// No incluye estados 'cobrado'/'cobrada' ni anulados.

// Workflow simplificado (3 estados): abierto | enviado | cobrado
// Activos = abierto + enviado. Historial = cobrado.
const ACTIVOS = ["abierto", "enviado"] as const;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const filtroEstado = (url.searchParams.get("filtro_estado") ?? "activos").toLowerCase();
  const marcaIdFiltro = url.searchParams.get("marca_id");
  const busqueda = (url.searchParams.get("busqueda") ?? "").trim();

  try {
    // 1. Cargar marcas (catálogo completo para nombres y colores)
    const [marcasRes, proyectosRes] = await Promise.all([
      supabaseServer
        .from("mk_marcas")
        .select("id, nombre, codigo"),
      (() => {
        let q = supabaseServer
          .from("mk_proyectos")
          .select(
            "id, nombre, tienda, estado, created_at, anulado_en, fecha_enviado, fecha_cobrado",
          )
          .is("anulado_en", null)
          .order("created_at", { ascending: false });
        if (filtroEstado === "activos") {
          q = q.in("estado", ACTIVOS as unknown as string[]);
        } else if (filtroEstado === "historial") {
          q = q.eq("estado", "cobrado");
        } else if (
          filtroEstado === "abierto" ||
          filtroEstado === "enviado" ||
          filtroEstado === "cobrado"
        ) {
          q = q.eq("estado", filtroEstado);
        }
        if (busqueda.length > 0) {
          const esc = busqueda.replace(/[%_]/g, (m) => `\\${m}`);
          q = q.or(`nombre.ilike.%${esc}%,tienda.ilike.%${esc}%`);
        }
        return q;
      })(),
    ]);

    if (marcasRes.error) throw new Error(`marcas: ${marcasRes.error.message}`);
    if (proyectosRes.error) throw new Error(`proyectos: ${proyectosRes.error.message}`);

    const marcas = (marcasRes.data ?? []) as Array<{
      id: string;
      nombre: string;
      codigo: string;
    }>;
    const marcaById = new Map(marcas.map((m) => [String(m.id), m]));

    const proyectos = (proyectosRes.data ?? []) as Array<{
      id: string;
      nombre: string | null;
      tienda: string;
      estado: string;
      created_at: string;
      anulado_en: string | null;
      fecha_enviado: string | null;
      fecha_cobrado: string | null;
    }>;

    if (proyectos.length === 0) {
      return jsonNoStore([]);
    }

    const proyectoIds = proyectos.map((p) => String(p.id));

    // 2. Cargar facturas + adjuntos + marcas-de-factura en batch
    const [facturasRes, adjFotosRes, fmRes] = await Promise.all([
      supabaseServer
        .from("mk_facturas")
        .select("id, proyecto_id, total, anulado_en")
        .in("proyecto_id", proyectoIds)
        .is("anulado_en", null),
      supabaseServer
        .from("mk_adjuntos")
        .select("proyecto_id")
        .in("proyecto_id", proyectoIds)
        .eq("tipo", "foto_proyecto"),
      supabaseServer
        .from("mk_factura_marcas")
        .select("factura_id, marca_id, porcentaje"),
    ]);

    if (facturasRes.error) throw new Error(`facturas: ${facturasRes.error.message}`);
    if (adjFotosRes.error) throw new Error(`adjuntos: ${adjFotosRes.error.message}`);
    if (fmRes.error) throw new Error(`factura_marcas: ${fmRes.error.message}`);

    const facturas = (facturasRes.data ?? []) as Array<{
      id: string;
      proyecto_id: string;
      total: number;
    }>;
    const fm = (fmRes.data ?? []) as Array<{
      factura_id: string;
      marca_id: string;
      porcentaje: number;
    }>;

    // Índice: factura_id → { proyecto_id, total }
    const facturaIndex = new Map<string, { proyectoId: string; total: number }>();
    for (const f of facturas) {
      facturaIndex.set(String(f.id), {
        proyectoId: String(f.proyecto_id),
        total: Number(f.total ?? 0),
      });
    }

    // Conteo de facturas por proyecto
    const facturasCountByProy = new Map<string, number>();
    for (const f of facturas) {
      const pid = String(f.proyecto_id);
      facturasCountByProy.set(pid, (facturasCountByProy.get(pid) ?? 0) + 1);
    }

    // Conteo de fotos por proyecto
    const fotosCountByProy = new Map<string, number>();
    for (const a of (adjFotosRes.data ?? []) as Array<{ proyecto_id: string }>) {
      const pid = String(a.proyecto_id);
      fotosCountByProy.set(pid, (fotosCountByProy.get(pid) ?? 0) + 1);
    }

    // Marcas involucradas por proyecto + cobrable desde facturas por marca
    const marcasByProy = new Map<string, Set<string>>();
    const cobrableFactByProyMarca = new Map<string, Map<string, number>>();
    for (const r of fm) {
      const finfo = facturaIndex.get(String(r.factura_id));
      if (!finfo) continue;
      const pid = finfo.proyectoId;
      const mid = String(r.marca_id);
      const set = marcasByProy.get(pid) ?? new Set<string>();
      set.add(mid);
      marcasByProy.set(pid, set);

      const inner =
        cobrableFactByProyMarca.get(pid) ?? new Map<string, number>();
      const monto = (finfo.total * Number(r.porcentaje ?? 0)) / 100;
      inner.set(mid, (inner.get(mid) ?? 0) + monto);
      cobrableFactByProyMarca.set(pid, inner);
    }

    // Por cobrar: siempre SUM(factura.total × %) desde mk_factura_marcas.
    //             Si proyecto.estado === 'cobrado' → 0 (ya cobrado).
    function porCobrarDeProy(
      p: { id: string; estado: string },
    ): { total: number; desglose: Array<{ marcaId: string; monto: number }> } {
      if (p.estado === "cobrado") return { total: 0, desglose: [] };
      const inner = cobrableFactByProyMarca.get(p.id);
      const desglose: Array<{ marcaId: string; monto: number }> = [];
      let total = 0;
      if (inner) {
        for (const [marcaId, monto] of inner) {
          const r = Number(monto.toFixed(2));
          desglose.push({ marcaId, monto: r });
          total += r;
        }
      }
      return { total: Number(total.toFixed(2)), desglose };
    }

    // Filtro por marca_id (si se pidió, se excluyen proyectos sin esa marca
    // en mk_factura_marcas). Proyectos sin facturas quedan fuera del filtro
    // — un proyecto vacío no puede "ser de Tommy" si aún no hay facturas.
    const passMarca = (pid: string): boolean => {
      if (!marcaIdFiltro) return true;
      const set = marcasByProy.get(pid);
      return !!set && set.has(marcaIdFiltro);
    };

    const resultado = proyectos
      .filter((p) => passMarca(String(p.id)))
      .map((p) => {
        const pid = String(p.id);
        const marcasSet = marcasByProy.get(pid) ?? new Set<string>();

        const marcasArr = Array.from(marcasSet)
          .map((mid) => marcaById.get(mid))
          .filter((x): x is { id: string; nombre: string; codigo: string } => !!x)
          .map((m) => ({ id: m.id, nombre: m.nombre, codigo: m.codigo }));

        const pc = porCobrarDeProy(p);
        const porCobrarDesglose = pc.desglose.map((d) => {
          const m = marcaById.get(d.marcaId);
          return {
            marca_id: d.marcaId,
            marca_nombre: m?.nombre ?? "—",
            monto: d.monto,
          };
        });

        return {
          id: pid,
          nombre: p.nombre,
          tienda: p.tienda,
          estado: p.estado,
          created_at: p.created_at,
          anulado_en: p.anulado_en,
          fecha_enviado: p.fecha_enviado,
          fecha_cobrado: p.fecha_cobrado,
          facturas_count: facturasCountByProy.get(pid) ?? 0,
          fotos_count: fotosCountByProy.get(pid) ?? 0,
          marcas: marcasArr,
          por_cobrar_total: pc.total,
          por_cobrar_por_marca: porCobrarDesglose,
        };
      });

    return jsonNoStore(resultado);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/proyectos-lista:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function jsonNoStore(data: unknown): NextResponse {
  const res = NextResponse.json(data);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
