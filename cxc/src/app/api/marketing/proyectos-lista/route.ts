import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { esMultifashion } from "@/lib/marketing/multifashion";
import {
  marcasDeEntrega,
  porcionEntregaParaMarca,
} from "@/lib/marketing/resumen-inicio";
import {
  MULTIFASHION_KEY,
  SIN_BLOQUE,
  esMarcaCodigo,
  indiceBloquePorMarcaId,
} from "@/lib/marketing/bloques";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// GET /api/marketing/proyectos-lista
//   ?bloque=TH|CK|KL|RBK|J|multifashion|sin_bloque
//                     → solo proyectos del bloque del inicio (una MARCA por
//                       bloque). `?proveedor=` se sigue aceptando como nombre
//                       viejo del mismo parámetro.
//   ?marca_id=<uuid>  → solo proyectos con ≥1 factura de esa marca
//   ?busqueda=<str>   → match en nombre o tienda del proyecto (ILIKE),
//                       y también en sus facturas: número de factura,
//                       concepto/nota, o monto exacto. El número tolera
//                       ceros a la izquierda porque usa "contains"
//                       (ej. "64327" encuentra "0000064327").
//
// Respuesta: Array<ProyectoListItem>
//
// 🔴 EL ESTADO DEL PROYECTO DEJÓ DE EXISTIR COMO FILTRO (11-ago-2026).
// "Cerrar proyecto" se retiró de la UI: era cosmético y confundía al lado de
// "Cerrar período". La lista devuelve SIEMPRE todos los proyectos vivos (no
// anulados). `?filtro_estado=` se ignora si un cliente viejo lo manda. Los
// valores legacy 'enviado'/'cobrado'/'cerrado' que pudieran quedar en la
// columna se leen igual que 'abierto': el proyecto es solo la agrupación por
// cliente, y lo que congela plata es el PERÍODO cerrado.

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const marcaIdFiltro = url.searchParams.get("marca_id");
  // Bucket de cards por marca (rediseño): grupo=legacy → solo proyectos con ≥1
  // factura legacy (bucket "Tommy y Calvin"); grupo=marca + marca_id → solo
  // proyectos con ≥1 factura NO-legacy de esa marca. Sin grupo = sin filtro (compat).
  const grupo = (url.searchParams.get("grupo") ?? "").toLowerCase();
  // Bloque del inicio (modelo por MARCA): TH | CK | KL | RBK | J |
  // multifashion | sin_bloque. Lista blanca explícita — un valor desconocido
  // cae a null (sin filtro) en vez de colarse hasta la partición.
  //
  // ⚠️ El código de marca va en MAYÚSCULAS y los dos buckets en minúsculas, así
  // que no se puede bajar todo a minúsculas de entrada: `th` tiene que
  // encontrar a Tommy igual, porque el parámetro lo escribe una persona.
  const bloqueRaw = (
    url.searchParams.get("bloque") ??
    url.searchParams.get("proveedor") ??
    ""
  ).trim();
  const bloqueUp = bloqueRaw.toUpperCase();
  const bloqueLow = bloqueRaw.toLowerCase();
  const bloque = esMarcaCodigo(bloqueUp)
    ? bloqueUp
    : bloqueLow === MULTIFASHION_KEY || bloqueLow === SIN_BLOQUE
      ? bloqueLow
      : null;
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
          // tienda_codigo entra para poder reconocer los proyectos de
          // Multifashion (bucket independiente) — ver lib/marketing/multifashion.
          .select("id, nombre, tienda, tienda_codigo, created_at, anulado_en")
          .is("anulado_en", null);
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
        return q.order("created_at", { ascending: false });
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
      tienda_codigo: string | null;
      created_at: string;
      anulado_en: string | null;
    }>;
    const proyectosMf = new Set(
      proyectos.filter((p) => esMultifashion(p)).map((p) => String(p.id)),
    );

    if (proyectos.length === 0) {
      return jsonNoStore([]);
    }

    const proyectoIds = proyectos.map((p) => String(p.id));

    // 2. Cargar facturas + adjuntos + marcas-de-factura + entregas en batch
    const [facturasRes, adjFotosRes, fmRes, entregasRes] = await Promise.all([
      supabaseServer
        .from("mk_facturas")
        .select("id, proyecto_id, total, anulado_en, grupo_legacy")
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
      grupo_legacy?: boolean;
    }>;
    // Legacy por factura y por proyecto (para el filtro de cards por marca).
    const legacyByFactura = new Map<string, boolean>();
    const hasLegacyByProy = new Set<string>();
    for (const f of facturas) {
      legacyByFactura.set(String(f.id), !!f.grupo_legacy);
      if (f.grupo_legacy) hasLegacyByProy.add(String(f.proyecto_id));
    }
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
    // Marcas SOLO de facturas no-legacy (para el filtro de cards por marca; el
    // display de badges/desglose sigue usando marcasByProy con todas).
    const nonLegacyMarcasByProy = new Map<string, Set<string>>();
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
      if (legacyByFactura.get(fid)) continue; // solo no-legacy alimenta el bucket de marca
      const pid = facturaIndex.get(fid)!.proyectoId;
      const set = nonLegacyMarcasByProy.get(pid) ?? new Set<string>();
      for (const r of rows) set.add(r.mid);
      nonLegacyMarcasByProy.set(pid, set);
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
      const set = marcasByProy.get(pid) ?? new Set<string>();
      // 🩸 La entrega TAMBIÉN mete al proyecto en el bucket de su marca.
      // Antes solo lo hacían las facturas, y un proyecto sin facturas cuya
      // ÚNICA marca venía de una entrega de muebles no aparecía en ninguna
      // tarjeta ni en ninguna lista (el caso "Nova Lux" del 11-ago-2026).
      // Misma regla que la tarjeta: lib/marketing/resumen-inicio.ts.
      const nonLegacy = nonLegacyMarcasByProy.get(pid) ?? new Set<string>();
      const inner =
        cobrableFactByProyMarca.get(pid) ?? new Map<string, number>();
      for (const mid of marcasDeEntrega(e)) {
        const monto = porcionEntregaParaMarca(
          e,
          mid,
          marcaById.get(mid)?.empresa_codigo,
        );
        if (monto <= 0) continue;
        set.add(mid);
        nonLegacy.add(mid);
        inner.set(mid, (inner.get(mid) ?? 0) + monto);
      }
      marcasByProy.set(pid, set);
      nonLegacyMarcasByProy.set(pid, nonLegacy);
      cobrableFactByProyMarca.set(pid, inner);
    }

    // Desglose SUM(factura.total × %) desde mk_factura_marcas. Alimenta el
    // tooltip de desglose por marca de la columna "Gastado".
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

    // Filtro por bucket de card:
    //   grupo=legacy  → proyectos con ≥1 factura legacy (card "Tommy y Calvin").
    //   grupo=marca   → proyectos con ≥1 factura NO-legacy de marca_id.
    //   sin grupo     → filtro marca_id sobre TODAS las facturas (compat previa).
    // Proyectos sin facturas de ese bucket quedan fuera (un proyecto vacío no
    // pertenece a ninguna marca todavía).
    // Índice marca_id → bloque. Fuente ÚNICA: lib/marketing/bloques.ts — el
    // mismo mapa que usa el resumen del inicio, así que la lista enseña
    // exactamente los proyectos que el bloque contó.
    const bloquePorMarca = indiceBloquePorMarcaId(marcas);

    const passBloque = (pid: string): boolean => {
      // Multifashion es del PROYECTO (tienda propia), no de la marca.
      if (bloque === MULTIFASHION_KEY) return proyectosMf.has(pid);
      if (proyectosMf.has(pid)) return false;
      // marcasByProy junta las marcas de las facturas (legacy incluidas) y las
      // de las entregas de muebles, igual que `agregarPorBloques`.
      const set = marcasByProy.get(pid);
      if (!set) return false;
      for (const mid of set) {
        if ((bloquePorMarca.get(mid) ?? SIN_BLOQUE) === bloque) return true;
      }
      return false;
    };

    const passBucket = (pid: string): boolean => {
      if (bloque) return passBloque(pid);
      // Multifashion es un bucket INDEPENDIENTE: entra solo con
      // grupo=multifashion y queda fuera de legacy y de las marcas.
      if (grupo === "multifashion") return proyectosMf.has(pid);
      if (proyectosMf.has(pid) && (grupo === "legacy" || grupo === "marca")) return false;
      if (grupo === "legacy") return hasLegacyByProy.has(pid);
      if (grupo === "marca") {
        if (!marcaIdFiltro) return true;
        return nonLegacyMarcasByProy.get(pid)?.has(marcaIdFiltro) ?? false;
      }
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

    const passTipo = (pid: string): boolean => {
      // 🩸 El split interno/externo es del modelo viejo (tab Joybees) y NO
      // aplica al modelo por marca: un bloque tiene que enseñar TODOS sus
      // proyectos. Si se aplicara, "Ver proyectos" de una marca interna
      // devolvería una lista vacía mientras su bloque muestra plata. Sin
      // bloque (compat) se conserva el default de siempre: solo externos.
      if (bloque) return true;
      return !proyectoEsInterno(pid);
    };

    const resultado = proyectos
      .filter((p) => passBucket(String(p.id)))
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
        return {
          id: pid,
          nombre: p.nombre,
          tienda: p.tienda,
          created_at: p.created_at,
          anulado_en: p.anulado_en,
          facturas_count: facturasCountByProy.get(pid) ?? 0,
          fotos_count: fotosCountByProy.get(pid) ?? 0,
          entregas_count: entregasCountByProy.get(pid) ?? 0,
          marcas: marcasArr,
          // Gasto BRUTO real (Σ factura.total con ITBMS + entregas), sin co-op.
          // Es el número grande que se muestra en la columna "Gastado".
          gasto_real: Number((grossByProy.get(pid) ?? 0).toFixed(2)),
          // Desglose de gasto por marca. Alimenta SOLO el tooltip de la
          // columna "Gastado". El split por_cobrar/cobrado que dependía del
          // estado del proyecto se retiró con el estado (11-ago-2026).
          por_cobrar_total: desg.total,
          por_cobrar_por_marca: desgloseConNombres,
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
