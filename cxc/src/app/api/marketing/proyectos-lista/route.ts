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
  nombreDeBloque,
} from "@/lib/marketing/bloques";
import { bloqueDeSlug, slugDeMarca } from "@/lib/marketing/slugs";
import {
  agregarPorBloques,
  crearClasificadorPeriodos,
  periodoLegacyDeFactura,
  type AdjuntoResumen,
  type PeriodoRow,
  type SelloRow,
} from "@/lib/marketing/resumen-bloques";
import {
  SECCION_ABIERTO,
  armarGastoGeneral,
  armarSecciones,
  claveDeSeccion,
  descripcionDeGastoSuelto,
  type GastoGeneral,
  type GastoGeneralItem,
} from "@/lib/marketing/lista-por-periodo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// GET /api/marketing/proyectos-lista
//   ?bloque=<código | slug del nombre | multifashion | sin-marca>
//                     → solo proyectos de ese bloque (una MARCA por bloque).
//                       Acepta el CÓDIGO (`TH`, `ck`) y el slug del NOMBRE
//                       (`calvin-klein`) — es el mismo segmento `[marca]` de
//                       la URL de tres niveles. `?proveedor=` se sigue
//                       aceptando como nombre viejo del mismo parámetro.
//   ?marca_id=<uuid>  → solo proyectos con ≥1 factura de esa marca
//   ?busqueda=<str>   → match en nombre o tienda del proyecto, y también en
//                       sus facturas: número de factura, concepto/nota, o
//                       monto exacto (sin distinguir mayúsculas).
//
// Respuesta: { proyectos, general, particion, bloque_resumen, secciones }
//
// 🔴 UNA SECCIÓN POR PERÍODO (12-ago-2026). Daniel: *"quiero que dentro de
// cada marca aparezca 'periodo uno' periodo dos, y dentro de cada periodo la
// info… que este ordenado"*. Con `?bloque=<marca>` la respuesta trae
// `secciones`: el período ABIERTO primero (con su total y `puedeCerrar`) y
// los CERRADOS después, cada uno con su total, sus proyectos CON EL MONTO DE
// ESE PERÍODO y su fila General (impulsadoras y gastos sin cliente).
//
// 🩸 LOS TOTALES Y LOS MONTOS SALEN DE `agregarPorBloques` — el MISMO módulo
// puro que dibuja las tarjetas del inicio, corrido sobre los MISMOS insumos
// que `/api/marketing/inicio`. Por eso el total de cada sección cuadra al
// centavo con el chip de esa marca en el inicio: es literalmente el mismo
// número. Acá no se suma nada a mano.
//
// 🔴 LA BÚSQUEDA NO CAMBIA LOS TOTALES. `?busqueda=` filtra qué proyectos se
// listan (en JS, sobre los mismos datos ya leídos), pero el agregador corre
// SIEMPRE sobre todo: el encabezado de una sección dice cuánto tiene el
// período, no cuánto suma el filtro.
//
// 🔴 EL ESTADO DEL PROYECTO DEJÓ DE EXISTIR COMO FILTRO (11-ago-2026).
// "Cerrar proyecto" se retiró de la UI: era cosmético y confundía al lado de
// "Cerrar período". La lista devuelve SIEMPRE todos los proyectos vivos (no
// anulados). `?filtro_estado=` se ignora si un cliente viejo lo manda.

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const marcaIdFiltro = url.searchParams.get("marca_id");
  // Bucket de cards por marca (rediseño): grupo=legacy → solo proyectos con ≥1
  // factura legacy (bucket "Tommy y Calvin"); grupo=marca + marca_id → solo
  // proyectos con ≥1 factura NO-legacy de esa marca. Sin grupo = sin filtro (compat).
  const grupo = (url.searchParams.get("grupo") ?? "").toLowerCase();
  // Bloque del inicio (modelo por MARCA). Se resuelve DESPUÉS de leer el
  // catálogo, porque el segmento acepta el slug del NOMBRE (`calvin-klein`)
  // además del código — ver lib/marketing/slugs.ts. Un valor desconocido cae
  // a null (sin filtro) en vez de colarse hasta la partición.
  const bloqueRaw = (
    url.searchParams.get("bloque") ??
    url.searchParams.get("proveedor") ??
    ""
  ).trim();
  const busqueda = (url.searchParams.get("busqueda") ?? "").trim();

  try {
    // 1. TODO en un batch, SIN filtrar por la búsqueda: el agregador necesita
    //    los mismos insumos que /api/marketing/inicio para que los totales de
    //    las secciones sean los MISMOS números de las tarjetas. La búsqueda se
    //    aplica después, en JS, solo a qué proyectos se listan.
    const [
      marcasRes,
      proyectosRes,
      facturasRes,
      fmRes,
      entregasRes,
      adjRes,
      perRes,
      selloRes,
    ] = await Promise.all([
      supabaseServer.from("mk_marcas").select("*"),
      supabaseServer
        .from("mk_proyectos")
        // tienda_codigo entra para poder reconocer los proyectos de
        // Multifashion (bucket independiente) — ver lib/marketing/multifashion.
        .select("id, nombre, tienda, tienda_codigo, created_at, anulado_en")
        .is("anulado_en", null)
        .order("created_at", { ascending: false }),
      // TODAS las facturas vivas — las de proyecto y las sueltas (proyecto_id
      // null) en UNA lectura: las dos alimentan al agregador, y las columnas
      // extra son las que la fila General necesita para describir el gasto.
      supabaseServer
        .from("mk_facturas")
        .select(
          "id, proyecto_id, total, grupo_legacy, impulsadora_id, concepto, proveedor, numero_factura, fecha_factura, created_at",
        )
        .is("anulado_en", null),
      supabaseServer
        .from("mk_factura_marcas")
        .select("factura_id, marca_id, porcentaje"),
      supabaseServer
        .from("mk_entregas_muebles")
        .select("id, proyecto_id, total, total_por_marca, total_por_empresa_interna"),
      supabaseServer.from("mk_adjuntos").select("tipo, factura_id, proyecto_id"),
      supabaseServer
        .from("mk_periodos")
        .select("id, proveedor_key, nombre, estado, cerrado_en"),
      supabaseServer
        .from("mk_periodo_documentos")
        .select("periodo_id, proveedor_key, tipo, documento_id"),
    ]);

    if (marcasRes.error) throw new Error(`marcas: ${marcasRes.error.message}`);
    if (proyectosRes.error) throw new Error(`proyectos: ${proyectosRes.error.message}`);
    if (facturasRes.error) throw new Error(`facturas: ${facturasRes.error.message}`);
    if (fmRes.error) throw new Error(`factura_marcas: ${fmRes.error.message}`);
    if (entregasRes.error) throw new Error(`entregas: ${entregasRes.error.message}`);
    if (adjRes.error) throw new Error(`adjuntos: ${adjRes.error.message}`);
    // Tolerancia a DDL retirada el 3-sep-2026: `mk_periodos` y
    // `mk_periodo_documentos` existen desde 20260811160000. Un error acá es un
    // error (permiso, timeout, esquema) y se propaga; tratarlo como "no hay
    // períodos" mostraba el archivo ya reportado como gasto abierto.
    if (perRes.error) throw new Error(`periodos: ${perRes.error.message}`);
    if (selloRes.error) {
      throw new Error(`periodo_documentos: ${selloRes.error.message}`);
    }

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

    // El bloque pedido: código, slug del nombre, o uno de los dos buckets.
    const bloque = bloqueRaw ? bloqueDeSlug(bloqueRaw, marcas) : null;

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
    const vivos = new Set(proyectos.map((p) => String(p.id)));

    const periodos = (perRes.data ?? []) as PeriodoRow[];
    const sellos = (selloRes.data ?? []) as SelloRow[];
    const adjuntos = (adjRes.data ?? []) as Array<{
      tipo: string;
      factura_id: string | null;
      proyecto_id: string | null;
    }>;

    const facturasTodas = (facturasRes.data ?? []) as Array<{
      id: string;
      proyecto_id: string | null;
      total: number | null;
      grupo_legacy: boolean | null;
      impulsadora_id: string | null;
      concepto: string | null;
      proveedor: string | null;
      numero_factura: string | null;
      fecha_factura: string | null;
      created_at: string | null;
    }>;
    // Con proyecto VIVO (para conteos y tooltips) y sueltas (fila General).
    const facturas = facturasTodas.filter(
      (f) => f.proyecto_id && vivos.has(String(f.proyecto_id)),
    );
    const sueltas = facturasTodas.filter((f) => !f.proyecto_id);

    const entregas = (entregasRes.data ?? []) as Array<{
      id: string;
      proyecto_id: string | null;
      total: number | null;
      total_por_marca: Record<string, number> | null;
      total_por_empresa_interna: Record<string, number> | null;
    }>;
    const entregasVivas = entregas.filter(
      (e) => e.proyecto_id && vivos.has(String(e.proyecto_id)),
    );

    // ------------------------------------------------------------------
    // EL AGREGADOR ÚNICO — los mismos insumos que /api/marketing/inicio.
    // De acá salen los totales de las secciones (bloques + cerrados) y el
    // detalle por proyecto·período. Nada se vuelve a sumar en esta ruta.
    // ------------------------------------------------------------------
    const resumen = agregarPorBloques({
      facturas: facturasTodas as never,
      facturaMarcas: (fmRes.data ?? []) as never,
      entregas: entregas as never,
      marcas: marcas as never,
      proyectos,
      proyectosMultifashion: proyectosMf,
      periodos,
      sellos,
      adjuntos: adjuntos as AdjuntoResumen[],
    });

    // El clasificador ÚNICO de períodos (el mismo que usa el agregador): acá
    // solo decide EN QUÉ PERÍODO va cada gasto suelto de la fila General.
    const clasificador = crearClasificadorPeriodos(periodos, sellos);

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
    // Es "lo que se pagó de verdad", SIN ponderar por co-op. Alimenta la
    // columna "Gastado" del modo PLANO (multifashion / sin bloque); en las
    // secciones por período la columna es el monto DEL período (agregador).
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
    for (const a of adjuntos) {
      if (a.tipo !== "foto_proyecto" || !a.proyecto_id) continue;
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
    for (const e of entregasVivas) {
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

    // Índice marca_id → bloque. Fuente ÚNICA: lib/marketing/bloques.ts — el
    // mismo mapa que usa el resumen del inicio, así que la lista enseña
    // exactamente los proyectos que el bloque contó.
    const bloquePorMarca = indiceBloquePorMarcaId(marcas);

    const bloqueEsMarca = bloque !== null && esMarcaCodigo(bloque);

    // ------------------------------------------------------------------
    // La fila "GENERAL" de cada período: impulsadoras y gastos SIN cliente
    // de esta marca. La marca sale de mk_factura_marcas (la marca REAL del
    // gasto), NUNCA de la clave del sello; el sello (vía el clasificador
    // único) solo decide EN QUÉ PERÍODO va cada gasto.
    // ------------------------------------------------------------------
    const generales = new Map<string, GastoGeneral>();
    if (bloqueEsMarca) {
      const fmBySuelta = new Map<string, Array<{ mid: string; pct: number }>>();
      const sueltaIds = new Set(sueltas.map((s) => String(s.id)));
      for (const r of fm) {
        const fid = String(r.factura_id);
        if (!sueltaIds.has(fid)) continue;
        const arr = fmBySuelta.get(fid) ?? [];
        arr.push({ mid: String(r.marca_id), pct: Number(r.porcentaje ?? 0) });
        fmBySuelta.set(fid, arr);
      }
      const itemsPorSeccion = new Map<string, GastoGeneralItem[]>();
      for (const f of sueltas) {
        const fid = String(f.id);
        const rows = fmBySuelta.get(fid) ?? [];
        const sumPct = rows.reduce((s, r) => s + r.pct, 0) || 1;
        const pctBloque = rows
          .filter((r) => (bloquePorMarca.get(r.mid) ?? SIN_BLOQUE) === bloque)
          .reduce((s, r) => s + r.pct, 0);
        if (pctBloque <= 0) continue;
        const cer = clasificador.cerradoPara(
          "factura",
          fid,
          bloque,
          periodoLegacyDeFactura({ grupo_legacy: f.grupo_legacy } as never, false),
        );
        const clave = claveDeSeccion(cer);
        const esImpulsadora = !!f.impulsadora_id;
        const arr = itemsPorSeccion.get(clave) ?? [];
        arr.push({
          id: fid,
          fecha: f.fecha_factura ?? f.created_at ?? null,
          descripcion: descripcionDeGastoSuelto({ ...f, esImpulsadora }),
          monto: Number(
            (Number(f.total ?? 0) * (pctBloque / sumPct)).toFixed(2),
          ),
          esImpulsadora,
        });
        itemsPorSeccion.set(clave, arr);
      }
      for (const [clave, items] of itemsPorSeccion) {
        generales.set(clave, armarGastoGeneral(items));
      }
    }

    // ------------------------------------------------------------------
    // LAS SECCIONES — una por período, el abierto primero. Los totales son
    // los del agregador (los mismos chips del inicio) y los montos por
    // proyecto vienen de `resumen.detalle` (la misma pasada que los sumó).
    // ------------------------------------------------------------------
    const bloqueResumen = bloqueEsMarca
      ? (resumen.bloques.find((b) => b.key === bloque) ?? null)
      : null;
    const secciones = bloqueEsMarca
      ? armarSecciones({
          bloqueKey: bloque,
          bloque: bloqueResumen,
          cerrados: resumen.cerrados,
          detalle: resumen.detalle,
          generales,
          conPeriodos: resumen.conPeriodos,
          ordenProyectos: proyectos.map((p) => String(p.id)),
        })
      : null;

    // ------------------------------------------------------------------
    // BÚSQUEDA — en JS, sobre lo ya leído (mismo criterio que el ILIKE de
    // antes: sin distinguir mayúsculas; monto exacto si el término es un
    // número). Filtra qué proyectos se listan; los totales NO cambian.
    // ------------------------------------------------------------------
    const term = busqueda.toLowerCase();
    const montoNum = Number(busqueda.replace(/,/g, ""));
    const buscaMonto =
      busqueda.length > 0 &&
      busqueda.replace(/,/g, "").trim() !== "" &&
      Number.isFinite(montoNum);
    const matchTexto = (s: string | null | undefined) =>
      !!s && s.toLowerCase().includes(term);
    const proyConFacturaMatch = new Set<string>();
    if (term) {
      for (const f of facturas) {
        if (
          matchTexto(f.numero_factura) ||
          matchTexto(f.concepto) ||
          (buscaMonto && Number(f.total ?? 0) === montoNum)
        ) {
          proyConFacturaMatch.add(String(f.proyecto_id));
        }
      }
    }
    const pasaBusqueda = (p: { id: string; nombre: string | null; tienda: string }) =>
      !term ||
      matchTexto(p.nombre) ||
      matchTexto(p.tienda) ||
      proyConFacturaMatch.has(String(p.id));

    // Desglose SUM(factura.total × %) desde mk_factura_marcas. Alimenta el
    // tooltip de desglose por marca de la columna "Gastado" del modo plano.
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
      .filter((p) => pasaBusqueda(p))
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
          // Es la columna "Gastado" del modo PLANO; en las secciones por
          // período la fila muestra el monto DEL período (secciones[].proyectos).
          gasto_real: Number((grossByProy.get(pid) ?? 0).toFixed(2)),
          // Desglose de gasto por marca. Alimenta SOLO el tooltip de la
          // columna "Gastado" del modo plano.
          por_cobrar_total: desg.total,
          por_cobrar_por_marca: desgloseConNombres,
        };
      });

    return jsonNoStore({
      proyectos: resultado,
      // Compat: el General del período ABIERTO, para un cliente viejo.
      general: generales.get(SECCION_ABIERTO) ?? null,
      particion: bloqueEsMarca,
      // La identidad del bloque pedido, para el título y los links de las
      // páginas de nivel 2 y 3 (el slug es el del nombre — ver slugs.ts).
      marca: bloque
        ? {
            key: bloque,
            nombre: nombreDeBloque(bloque, marcas),
            slug: slugDeMarca(bloque, marcas),
          }
        : null,
      // El bloque del agregador para la marca: alimenta el modal de cierre
      // (facturas/muebles/total + los avisos sin comprobante / sin foto) y el
      // detalle de los buckets sin período (multifashion / sin marca).
      bloque_resumen: bloqueEsMarca
        ? bloqueResumen
        : bloque
          ? (resumen.bloques.find((b) => b.key === bloque) ?? null)
          : null,
      secciones,
    });
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
