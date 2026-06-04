import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// GET /api/marketing/proyectos-lista
//   ?filtro_estado=activos|todos|abierto|por_cobrar|enviado|cobrado
//   ?marca_id=<uuid>  → solo proyectos con ≥1 factura de esa marca
//   ?busqueda=<str>   → match en nombre o tienda del proyecto (ILIKE),
//                       y también en sus facturas: número de factura,
//                       concepto/nota, o monto exacto. El número tolera
//                       ceros a la izquierda porque usa "contains"
//                       (ej. "64327" encuentra "0000064327").
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
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const filtroEstado = (url.searchParams.get("filtro_estado") ?? "activos").toLowerCase();
  const marcaIdFiltro = url.searchParams.get("marca_id");
  const busqueda = (url.searchParams.get("busqueda") ?? "").trim();

  // Escape ILIKE wildcards una sola vez (reutilizado en facturas y proyectos).
  const esc = busqueda.replace(/[%_]/g, (m) => `\\${m}`);

  try {
    // 0. Pre-búsqueda en facturas: si hay texto, encontrar los proyectos cuyas
    //    facturas (no anuladas) matchean por número, concepto/nota o monto
    //    exacto. Devuelve la lista de proyecto_id para sumarla al filtro OR
    //    de proyectos más abajo. Solo lectura, no toca data ni cálculos.
    let proyectoIdsPorFactura: string[] = [];
    if (busqueda.length > 0) {
      const orFacturas = [
        `numero_factura.ilike.%${esc}%`,
        `concepto.ilike.%${esc}%`,
      ];
      // Monto exacto: solo si el término es un número válido (admite comas de
      // miles). "150.50" → total.eq.150.5. No rompe si no es número.
      const montoNum = Number(busqueda.replace(/,/g, ""));
      if (busqueda.replace(/,/g, "").trim() !== "" && Number.isFinite(montoNum)) {
        orFacturas.push(`total.eq.${montoNum}`);
      }
      const factSearchRes = await supabaseServer
        .from("mk_facturas")
        .select("proyecto_id")
        .is("anulado_en", null)
        .or(orFacturas.join(","));
      if (factSearchRes.error) {
        throw new Error(`facturas-busqueda: ${factSearchRes.error.message}`);
      }
      proyectoIdsPorFactura = Array.from(
        new Set(
          ((factSearchRes.data ?? []) as Array<{ proyecto_id: string }>).map(
            (r) => String(r.proyecto_id),
          ),
        ),
      );
    }

    // 1. Cargar marcas (catálogo completo para nombres, colores y tipo)
    const [marcasRes, proyectosRes] = await Promise.all([
      supabaseServer
        .from("mk_marcas")
        .select("*"),
      (() => {
        let q = supabaseServer
          .from("mk_proyectos")
          .select(
            "id, nombre, tienda, estado, created_at, anulado_en, fecha_enviado, fecha_cobrado",
          )
          .is("anulado_en", null);
        if (filtroEstado === "activos" || filtroEstado === "joybees") {
          // Tab Joybees comparte el universo de activos (abierto/enviado).
          // El filtro interno/externo se aplica después vía passTipo().
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
          const orProyecto = [
            `nombre.ilike.%${esc}%`,
            `tienda.ilike.%${esc}%`,
          ];
          // Proyectos cuyas facturas matchearon (número, concepto o monto).
          if (proyectoIdsPorFactura.length > 0) {
            orProyecto.push(`id.in.(${proyectoIdsPorFactura.join(",")})`);
          }
          q = q.or(orProyecto.join(","));
        }
        // Historial ordena por fecha_cobrado DESC (lo más reciente arriba).
        // Resto del módulo ordena por created_at DESC.
        if (filtroEstado === "historial") {
          q = q
            .order("fecha_cobrado", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false });
        } else {
          q = q.order("created_at", { ascending: false });
        }
        return q;
      })(),
    ]);

    if (marcasRes.error) throw new Error(`marcas: ${marcasRes.error.message}`);
    if (proyectosRes.error) throw new Error(`proyectos: ${proyectosRes.error.message}`);

    const marcas = ((marcasRes.data ?? []) as Array<Record<string, unknown>>)
      .map((m) => {
        const tipoRaw = String(m.tipo ?? "externa");
        const tipo: "externa" | "interna" =
          tipoRaw === "interna" ? "interna" : "externa";
        return {
          id: String(m.id),
          nombre: String(m.nombre ?? ""),
          codigo: String(m.codigo ?? ""),
          tipo,
          empresa_codigo: String(m.empresa_codigo ?? ""),
        };
      });
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

    // 2. Cargar facturas + adjuntos + marcas-de-factura + entregas en batch
    const [facturasRes, adjFotosRes, fmRes, entregasRes] = await Promise.all([
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
      supabaseServer
        .from("mk_entregas_muebles")
        .select("proyecto_id, total, total_por_marca, total_por_empresa_interna")
        .in("proyecto_id", proyectoIds)
        .not("proyecto_id", "is", null),
    ]);

    if (facturasRes.error) throw new Error(`facturas: ${facturasRes.error.message}`);
    if (adjFotosRes.error) throw new Error(`adjuntos: ${adjFotosRes.error.message}`);
    if (fmRes.error) throw new Error(`factura_marcas: ${fmRes.error.message}`);
    if (entregasRes.error) throw new Error(`entregas: ${entregasRes.error.message}`);

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
    // Gasto BRUTO por proyecto = Σ factura.total (con ITBMS) + Σ entrega.total.
    // Es "lo que se pagó de verdad", SIN ponderar por co-op (distinto del
    // cobrable a marcas que vive en cobrableFactByProyMarca).
    const grossByProy = new Map<string, number>();
    for (const f of facturas) {
      const pid = String(f.proyecto_id);
      facturaIndex.set(String(f.id), { proyectoId: pid, total: Number(f.total ?? 0) });
      grossByProy.set(pid, (grossByProy.get(pid) ?? 0) + Number(f.total ?? 0));
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

    // Marcas involucradas por proyecto + GASTO COMPLETO por marca (sin co-op).
    // Se distribuye factura.total por la PORCIÓN real de cada marca (porcentaje
    // normalizado entre las marcas de esa factura): 1 marca = total completo;
    // 2 marcas 50/50 = mitad real a cada una. Alimenta el tooltip de desglose.
    const marcasByProy = new Map<string, Set<string>>();
    const cobrableFactByProyMarca = new Map<string, Map<string, number>>();
    const fmByFactura = new Map<string, Array<{ mid: string; pct: number }>>();
    for (const r of fm) {
      const fid = String(r.factura_id);
      if (!facturaIndex.has(fid)) continue;
      const arr = fmByFactura.get(fid) ?? [];
      arr.push({ mid: String(r.marca_id), pct: Number(r.porcentaje ?? 0) });
      fmByFactura.set(fid, arr);
    }
    for (const [fid, rows] of fmByFactura) {
      const finfo = facturaIndex.get(fid)!;
      const pid = finfo.proyectoId;
      const sumPct = rows.reduce((s, x) => s + x.pct, 0) || 1;
      const set = marcasByProy.get(pid) ?? new Set<string>();
      const inner = cobrableFactByProyMarca.get(pid) ?? new Map<string, number>();
      for (const r of rows) {
        set.add(r.mid);
        const monto = finfo.total * (r.pct / sumPct);
        inner.set(r.mid, (inner.get(r.mid) ?? 0) + monto);
      }
      marcasByProy.set(pid, set);
      cobrableFactByProyMarca.set(pid, inner);
    }

    // Sumar entregas de muebles al GASTO COMPLETO por marca de cada proyecto.
    // Porción real de cada marca = total_por_marca + total_por_empresa_interna
    // del empresa_codigo pareja (el "otro 50%" que antes absorbía FG ahora se
    // atribuye al gasto de esa marca). Sin co-op.
    const entregasCountByProy = new Map<string, number>();
    for (const e of (entregasRes.data ?? []) as Array<{
      proyecto_id: string;
      total: number | null;
      total_por_marca: Record<string, number> | null;
      total_por_empresa_interna: Record<string, number> | null;
    }>) {
      const pid = String(e.proyecto_id);
      entregasCountByProy.set(pid, (entregasCountByProy.get(pid) ?? 0) + 1);
      // Bruto: el total completo de la entrega.
      grossByProy.set(pid, (grossByProy.get(pid) ?? 0) + Number(e.total ?? 0));
      const tpm = e.total_por_marca ?? {};
      const tpe = e.total_por_empresa_interna ?? {};
      const set = marcasByProy.get(pid) ?? new Set<string>();
      const inner =
        cobrableFactByProyMarca.get(pid) ?? new Map<string, number>();
      for (const [mid, monto] of Object.entries(tpm)) {
        const n = Number(monto);
        if (!Number.isFinite(n) || n <= 0) continue;
        const emp = marcaById.get(mid)?.empresa_codigo;
        const interna = emp && tpe[emp] ? Number(tpe[emp]) : 0;
        set.add(mid);
        inner.set(mid, (inner.get(mid) ?? 0) + n + interna);
      }
      marcasByProy.set(pid, set);
      cobrableFactByProyMarca.set(pid, inner);
    }

    // Desglose SUM(factura.total × %) desde mk_factura_marcas, sin filtrar
    // por estado. Lo usamos para dos cosas distintas:
    //   - por_cobrar_*: pendiente de cobrar (proyectos NO cobrados).
    //   - cobrado_*: monto ya cobrado (proyectos en estado 'cobrado').
    function desgloseDeProy(
      pid: string,
    ): { total: number; desglose: Array<{ marcaId: string; monto: number }> } {
      const inner = cobrableFactByProyMarca.get(pid);
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

    // Split interno/externo: un proyecto se considera "interno" si TODAS sus
    // marcas asignadas son internas. "externo" si al menos una es externa
    // (pero por la regla de exclusividad nunca se mezclan). Sin marcas aún
    // asignadas = tratado como externo por default (tab Activos).
    function proyectoEsInterno(pid: string): boolean {
      const set = marcasByProy.get(pid);
      if (!set || set.size === 0) return false;
      for (const mid of set) {
        const m = marcaById.get(mid);
        if (!m || m.tipo !== "interna") return false;
      }
      return true;
    }

    const esVistaJoybees = filtroEstado === "joybees";
    const passTipo = (pid: string): boolean => {
      const interno = proyectoEsInterno(pid);
      return esVistaJoybees ? interno : !interno;
    };

    const resultado = proyectos
      .filter((p) => passMarca(String(p.id)))
      .filter((p) => passTipo(String(p.id)))
      .map((p) => {
        const pid = String(p.id);
        const marcasSet = marcasByProy.get(pid) ?? new Set<string>();

        const marcasArr = Array.from(marcasSet)
          .map((mid) => marcaById.get(mid))
          .filter(
            (x): x is { id: string; nombre: string; codigo: string; tipo: "externa" | "interna"; empresa_codigo: string } =>
              !!x,
          )
          .map((m) => ({
            id: m.id,
            nombre: m.nombre,
            codigo: m.codigo,
            tipo: m.tipo,
          }));

        const desg = desgloseDeProy(pid);
        const desgloseConNombres = desg.desglose.map((d) => {
          const m = marcaById.get(d.marcaId);
          return {
            marca_id: d.marcaId,
            marca_nombre: m?.nombre ?? "—",
            monto: d.monto,
          };
        });
        const esCobrado = p.estado === "cobrado";

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
          entregas_count: entregasCountByProy.get(pid) ?? 0,
          marcas: marcasArr,
          // Gasto BRUTO real (Σ factura.total con ITBMS + entregas), sin co-op.
          // Es el número grande que se muestra en la columna "Gastado".
          gasto_real: Number((grossByProy.get(pid) ?? 0).toFixed(2)),
          // Activos: desglose de pendiente; cobrados: 0 (ya cobrado).
          // Esto alimenta SOLO el tooltip de desglose por marca (cobrable co-op).
          por_cobrar_total: esCobrado ? 0 : desg.total,
          por_cobrar_por_marca: esCobrado ? [] : desgloseConNombres,
          // Historial: monto ya cobrado por marca (mismo cálculo, semántica distinta).
          cobrado_total: esCobrado ? desg.total : 0,
          cobrado_por_marca: esCobrado ? desgloseConNombres : [],
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
