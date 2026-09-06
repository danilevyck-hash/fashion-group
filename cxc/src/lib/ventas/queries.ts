// Server-side data fetchers for the Ventas module.
//
// Conventions:
//   - All money values are USD numbers (not strings, not cents).
//   - Months are 1-indexed in params, 0-indexed in return arrays
//     (mes=4 → arr index 3 = Apr).
//   - Null in a monthly array means "no data yet" (future month).

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esEmpresaDelGrupo } from "@/lib/clientes/mundos";
import { withDbRetry, isTransientDbError } from "@/lib/supabase-retry";
import { rpcConFallbackDeVersion } from "@/lib/ventas/rpc-version";
import { leerPrevSamePeriod, PREV_SAME_PERIOD_VACIO, RPC_PREV_SAME_PERIOD } from "@/lib/ventas/prev-same-period";
import { leerDashboardSummary, RPC_DASHBOARD_SUMMARY } from "@/lib/ventas/dashboard-summary";
import {
  ALL_EMPRESA_KEYS,
  EMPRESA_KEY_TO_NAME,
  EMPRESA_KEY_TO_VENTAS_ID,
  type VentasEmpresaId,
} from "@/lib/empresa-mapping";
import { fmtDate } from "@/lib/format";
import type {
  VentasResumen,
  Clientes,
  Multifashion,
  MultifashionSerieAnio,
  MultifashionProyeccion,
  Empresa,
  EmpresaMonthlySales,
  MonthlySeries,
  ProyeccionResp,
  ProyeccionRespCruda,
  ProyeccionGrupoCrudo,
} from "@/components/ventas/types";

/** Una fila de `ventas_rollup_mensual_mv` del año anterior. */
interface RollupPrevRow {
  empresa_key: string;
  mes_num: number;
  ventas_netas: number | string | null;
}

interface DashboardSummaryRow {
  empresa: string;
  mes: number;
  total_subtotal: number | string;
  total_costo: number | string;
  total_utilidad: number | string;
  total_facturado: number | string;
  filas: number;
}

const RETAIL_KEYS = new Set(["american_classic"]);

// ⚠️ INVARIANTE (auditoría 🟡-14): american_classic (Multifashion) NO se suma
// dos veces. El Resumen (fetchVentasResumen → ventas_dashboard_summary →
// switch_ventas_unificado_vw) ya lo incluye UNA vez; el tab Multifashion
// (fetchMultifashion → multifashion_mensual_v6/v7) es su propia vista sobre la
// MISMA switch_facturas y NO debe agregarse al total del grupo (~$300-800K YTD
// de doble conteo si se hiciera).
// La segunda fuente histórica, multifashion_tickets, quedó CONGELADA el
// 26-jul-2026: nadie la leía y su cron se retiró. Los datos siguen en la tabla,
// pero ya no es una fuente viva. Ver CLAUDE.md.

function toNum(v: number | string | null | undefined): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function buildEmpresa(key: string): Empresa {
  const ventasId = EMPRESA_KEY_TO_VENTAS_ID[key] ?? key;
  return {
    id: ventasId as VentasEmpresaId,
    nombre: EMPRESA_KEY_TO_NAME[key] ?? key,
    tipo: RETAIL_KEYS.has(key) ? "retail" : "b2b",
  };
}

/**
 * Resumen tab — KPIs + 8×12 monthly matrix vs prior year.
 *
 * Reusa el RPC ventas_dashboard_summary (year y year-1 en paralelo) y
 * construye el shape VentasResumen mapeando empresa key → ventas_id.
 */
export async function fetchVentasResumen({ year }: { year: number }): Promise<VentasResumen> {
  const [curRes, prevRes, proyRes, syncedRes, prevFullRes] = await Promise.all([
    // withDbRetry: en caché fría estas RPC se pasan del statement_timeout y
    // Postgres las cancela; al segundo intento (caché caliente) pasan en <1s.
    // Ver src/lib/supabase-retry.ts para la medición.
    // 🩸 Desde el 3-sep-2026 es la `_v2`: el costo del mes en curso incluye las
    // notas de débito (Active Wear agosto salía con costo NEGATIVO). La lectura,
    // con su cadena de versiones, vive en `dashboard-summary.ts`.
    leerDashboardSummary(year),
    // Prev year usa same-period day-by-day: el mes que está en curso en
    // el calendario actual se recorta al mismo offset de días en el año
    // anterior, y los meses posteriores no se emiten. Si `year` no es el
    // año actual del calendario, devuelve full-mes-vs-full-mes (no
    // aplica recorte).
    // 🩸 Desde el 3-sep-2026 el corte es en DÍA DE PANAMÁ (`_v3`; `_v2`
    // cortaba en UTC y una factura después de las 7 p.m. corría el corte un
    // día). La lectura, con su cadena de versiones, vive en
    // `prev-same-period.ts` y la comparten el Anual y Vista General.
    leerPrevSamePeriod(year),
    // 🔴 ACÁ VIVÍA `get_app_setting("multifashion_meta_anual_2026")`, UNA
    // CONSULTA POR CADA CARGA DE /ventas PARA UN NÚMERO QUE NO SE DIBUJA EN
    // NINGUNA PANTALLA. Viajaba como `kpis.metaAnualMultifashion` y nadie lo
    // leía; encima la clave estaba clavada en "2026", así que en 2027 habría
    // devuelto la meta del año equivocado sin que nada avisara. Es una ida
    // más a una base en compute Micro por un número fantasma.
    //
    // ⚠️ NO SE BORRÓ NI LA FILA NI LA TABLA: `app_settings` conserva su
    // `multifashion_meta_anual_2026` y las RPC de Multifashion la siguen
    // leyendo (`multifashion_mensual_v6` y sus versiones). Lo único que se
    // retira es pedirla desde acá.
    //
    // Proyección de cierre por empresa + agregado del grupo. v5 agrega
    // cierre_anio_anterior + delta_vs_anio_anterior por empresa y grupo.
    // El hero del Resumen muestra realidad vs realidad (2026 proyectado
    // vs 2025 cierre), la meta queda como referencia en /ventas/metas.
    // FASE 2.1: migrado a v6 (lee switch_ventas_unificado_vw, base subtotal pre-impuesto).
    // v7 (jul-2026): clamp de la proyección, cobertura del año previo y regla de
    // año base. Cae a v6 mientras la migración 20260726120000 no haya corrido.
    // v8 (5-sep-2026): la v7 byte a byte con UN cambio, el piso de cobertura del
    // año previo (0.10 → 0.20). Medido sobre 1.246 cortes de 2023-2025: no
    // cambia un solo número de 2026 —la cobertura más baja de hoy es 0.72— y
    // arregla tres casos históricos donde el año base era un pedazo de año.
    // Cae a v7 mientras la migración 20261001120000 no haya corrido, y la v7
    // sigue cayendo a v6 como siempre.
    rpcConFallbackDeVersion(
      () => withDbRetry(() => supabaseServer.rpc("ventas_proyeccion_cierre_v8", { p_anio: year }), { label: "ventas_proyeccion_cierre_v8" }),
      () => rpcConFallbackDeVersion(
        () => withDbRetry(() => supabaseServer.rpc("ventas_proyeccion_cierre_v7", { p_anio: year }), { label: "ventas_proyeccion_cierre_v7" }),
        () => withDbRetry(() => supabaseServer.rpc("ventas_proyeccion_cierre_v6", { p_anio: year }), { label: "ventas_proyeccion_cierre_v6" }),
        { label: "ventas_proyeccion_cierre_v7" },
      ),
      { label: "ventas_proyeccion_cierre_v8" },
    ),
    // FASE 2.1b: MAX(synced_at) de switch_facturas — momento del último sync
    // que insertó data nueva. Alimenta el subtitle "Data actualizada al ..."
    // para mostrar frescura real (no la fecha de hoy). Graceful: si falla,
    // el subtitle cae a fecha_corte (lógica vieja) vía null.
    withDbRetry(() => supabaseServer.from("switch_facturas").select("synced_at").order("synced_at", { ascending: false }).limit(1), { label: "switch_facturas.synced_at" }),
    // Los 12 meses del año ANTERIOR completos — la FORMA con la que se reparte
    // lo que falta del año en las celdas grises de la matriz (5-sep-2026).
    // 🩸 No se puede sacar de `prevRes`: esa RPC recorta el mes en curso a los
    // mismos días y no emite los meses posteriores, así que oct-nov-dic del año
    // pasado simplemente no vienen. Misma fuente que el panel mes × año
    // (`ventas_rollup_mensual_mv`, ~313 filas) y su suma por empresa cuadra al
    // centavo con `cierre_anio_anterior` de la proyección.
    // Tolerante: si falla, los meses que faltan se quedan en «—».
    withDbRetry(() => supabaseServer
      .from("ventas_rollup_mensual_mv")
      .select("empresa_key, mes_num, ventas_netas")
      .eq("anio", year - 1), { label: "ventas_rollup_mensual_mv.prev" }),
    // NOTA (25-jul-2026): acá vivían proyeccion_mensual_retail_v1 y
    // proyeccion_mensual_mayorista_v1, que alimentaban la columna "Cierre <mes>
    // (proy.)". Se quitaron: el negocio B2B factura por embarques, no parejo, así
    // que la proyección del mes salía marcada "estimación volátil" en las 8
    // empresas y no ayudaba a decidir. La proyección de Multifashion (retail
    // diario, sí confiable) sigue viva en su propio módulo.
  ]);

  if (curRes.error)  throw new Error(`${RPC_DASHBOARD_SUMMARY}(${year}): ${curRes.error.message}`);
  if (prevRes.error) throw new Error(`${RPC_PREV_SAME_PERIOD}(${year}): ${prevRes.error.message}`);

  const cur = (curRes.data as DashboardSummaryRow[] | null) ?? [];

  // El RPC devuelve { rows, es_periodo_parcial, fecha_corte, dia_corte_anio_anterior }
  const prevPayload = prevRes.data ?? PREV_SAME_PERIOD_VACIO;
  const prev = prevPayload.rows ?? [];

  // Build lookup: { [key]: number[12] }
  const buildSeries = (rows: DashboardSummaryRow[], field: "total_subtotal" | "total_utilidad" | "total_costo") => {
    const map: Record<string, MonthlySeries> = {};
    for (const k of ALL_EMPRESA_KEYS) map[k] = Array(12).fill(null);
    for (const r of rows) {
      if (!ALL_EMPRESA_KEYS.includes(r.empresa as (typeof ALL_EMPRESA_KEYS)[number])) continue;
      if (r.mes < 1 || r.mes > 12) continue;
      map[r.empresa][r.mes - 1] = toNum(r[field]);
    }
    return map;
  };

  // Series mensuales por empresa para subtotal, utilidad, costo (cur + prev)
  const cur26      = buildSeries(cur,  "total_subtotal");
  const cur26Util  = buildSeries(cur,  "total_utilidad");
  const cur26Costo = buildSeries(cur,  "total_costo");
  const prev25     = buildSeries(prev, "total_subtotal");
  // Los 12 meses del año anterior COMPLETOS (del rollup). `null` donde ese mes
  // no tiene fila: no vendió nada. Un error de lectura deja los 8 arreglos en
  // null y las celdas grises no se dibujan — nunca un número inventado.
  const prevFull: Record<string, MonthlySeries> = {};
  for (const k of ALL_EMPRESA_KEYS) prevFull[k] = Array(12).fill(null);
  if (!prevFullRes.error) {
    for (const r of (prevFullRes.data ?? []) as RollupPrevRow[]) {
      if (!ALL_EMPRESA_KEYS.includes(r.empresa_key as (typeof ALL_EMPRESA_KEYS)[number])) continue;
      if (r.mes_num < 1 || r.mes_num > 12) continue;
      prevFull[r.empresa_key][r.mes_num - 1] = (prevFull[r.empresa_key][r.mes_num - 1] ?? 0) + toNum(r.ventas_netas);
    }
  } else {
    console.warn(`[ventas/resumen] ventas_rollup_mensual_mv(${year - 1}): ${prevFullRes.error.message}`);
  }
  const prev25Util = buildSeries(prev, "total_utilidad");
  const prev25Costo = buildSeries(prev, "total_costo");

  // mesActual: último mes con data en el año en curso (cualquier empresa)
  let mesActual = 0;
  for (const k of ALL_EMPRESA_KEYS) {
    for (let i = 0; i < 12; i++) {
      if (cur26[k][i] != null && i + 1 > mesActual) mesActual = i + 1;
    }
  }

  // Aprox. fila-FILTER WHERE costo > 0 a nivel empresa-mes:
  // si una empresa tuvo costo > 0 en el mes m, ese mes contribuye al margen.
  // Excluye empresa-mes donde sólo hay ajustes contables (notas de débito
  // sin costo asociado), que distorsionarían el ratio.
  const sumFiltered = (
    vals: MonthlySeries,
    costo: MonthlySeries,
    upTo: number = 12
  ): number => {
    let s = 0;
    const limit = Math.min(upTo, vals.length);
    for (let i = 0; i < limit; i++) {
      const c = costo[i];
      if (c != null && c > 0) s += vals[i] ?? 0;
    }
    return s;
  };

  const sumYTD = (a: MonthlySeries) => a.reduce<number>((s, v) => s + (v ?? 0), 0);
  const sumSlice = (a: MonthlySeries, n: number) =>
    a.slice(0, n).reduce<number>((s, v) => s + (v ?? 0), 0);

  // Slice para comparar mismo período (Ene..mesActual). Año cerrado ⇒ mesActual=12.
  const upTo = Math.max(mesActual, 1);

  // Empresa-level: margen real (filtered) — current year y prev year
  const empresas: EmpresaMonthlySales[] = ALL_EMPRESA_KEYS.map(key => {
    const ventas       = cur26[key];
    const utilidad     = cur26Util[key];
    const costo        = cur26Costo[key];
    const ventasPrev   = prev25[key];
    const utilidadPrev = prev25Util[key];
    const costoPrev    = prev25Costo[key];
    const filteredVCur  = sumFiltered(ventas,     costo);
    const filteredUCur  = sumFiltered(utilidad,   costo);
    const filteredVPrev = sumFiltered(ventasPrev, costoPrev, upTo);
    const filteredUPrev = sumFiltered(utilidadPrev, costoPrev, upTo);
    const margenPct     = filteredVCur  > 0 ? filteredUCur  / filteredVCur  : 0;
    const margenPctPrev = filteredVPrev > 0 ? filteredUPrev / filteredVPrev : 0;
    return {
      empresa: buildEmpresa(key),
      ventas2026:   ventas,
      ventas2025:   ventasPrev,
      ventasPrevFull: prevFull[key],
      utilidad2026: utilidad,
      utilidad2025: utilidadPrev,
      margenPct,
      margenPctPrev,
    };
  });

  // Totales absolutos — sin filtro (utilidad real incluye ajustes)
  const ventasNetasYTD  = empresas.reduce((s, e) => s + sumYTD(e.ventas2026), 0);
  const ventas2025YTD   = empresas.reduce((s, e) => s + sumSlice(e.ventas2025, upTo), 0);
  const utilidadYTD     = empresas.reduce((s, e) => s + sumYTD(e.utilidad2026), 0);
  const utilidad2025YTD = empresas.reduce((s, e) => s + sumSlice(e.utilidad2025, upTo), 0);

  // Margen del grupo — filtered (excluye empresa-mes con costo=0)
  let totalFilteredUtilCur = 0, totalFilteredVCur = 0;
  let totalFilteredUtilPrev = 0, totalFilteredVPrev = 0;
  for (const k of ALL_EMPRESA_KEYS) {
    totalFilteredUtilCur  += sumFiltered(cur26Util[k],  cur26Costo[k]);
    totalFilteredVCur     += sumFiltered(cur26[k],      cur26Costo[k]);
    totalFilteredUtilPrev += sumFiltered(prev25Util[k], prev25Costo[k], upTo);
    totalFilteredVPrev    += sumFiltered(prev25[k],     prev25Costo[k], upTo);
  }
  const margenYTD     = totalFilteredVCur  > 0 ? totalFilteredUtilCur  / totalFilteredVCur  : 0;
  const margen2025YTD = totalFilteredVPrev > 0 ? totalFilteredUtilPrev / totalFilteredVPrev : 0;

  // (Acá se calculaba `multifashionYTD`, que viajaba en `kpis` y tampoco lo
  // dibujaba ninguna pantalla — el Resumen saca la fila de Multifashion de
  // `empresas`, como las otras siete. Se retiró junto con la meta.)

  // Proyección de cierre: graceful fallback si la RPC falla (ej. migration
  // pendiente o year sin data). No bloquea el resto del Resumen.
  let proyeccion: ProyeccionResp | null = null;
  if (proyRes.error) {
    console.error("[ventas/proyeccion_cierre_v1]", proyRes.error.message);
  } else if (proyRes.data) {
    proyeccion = stripMetasProyeccion(proyRes.data as ProyeccionRespCruda);
  }

  // FASE 2.1b: último sync real (MAX synced_at) — para subtitle "Data actualizada al ..."
  const syncedRow = (syncedRes.data as Array<{ synced_at: string }> | null) ?? [];
  const dataActualizadaAt = syncedRow[0]?.synced_at ?? null;

  return {
    year,
    mesActual,
    kpis: {
      ventasNetasYTD,
      ventas2025YTD,
      utilidadYTD,
      utilidad2025YTD,
      margenYTD,
      margen2025YTD,
    },
    empresas,
    es_periodo_parcial:      prevPayload.es_periodo_parcial,
    fecha_corte:             prevPayload.fecha_corte,
    dia_corte_anio_anterior: prevPayload.dia_corte_anio_anterior,
    data_actualizada_at:     dataActualizadaAt,
    proyeccion,
  };
}

interface ClientesEmpresaRow {
  /** Sólo existe tras la migración 20260727230000. Ver el mapeo más abajo. */
  es_del_grupo?: boolean | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  cliente_codigo: string | null;
  empresa: string | null;
  compras_ytd: number | string;
  compras_anio_anterior: number | string;
  delta_vs_2025: number | string | null;
  ultima_compra: string | null;
  whatsapp: string | null;
  /** Sólo presente en clientes_agregado_12m_vw (modo Todas) */
  empresas_count?: number | string | null;
  /** jsonb_agg de { empresa, monto } ordenado DESC. Modo Todas únicamente. */
  empresas_breakdown?: Array<{ empresa: string; monto: number | string }> | null;
}

/**
 * Clientes tab — clientes activos en últimos 12 meses (rolling).
 *
 * Ramas:
 *   - empresaKey null/'todas': lee de clientes_agregado_12m_vw — agregado
 *     por cliente con window functions, una fila por cliente único, badge
 *     +N visible cuando empresas_count > 1.
 *   - empresaKey específica (vistana, fashion_wear, ...): lee de
 *     clientes_empresa_12m_vw filtrando por empresa — una fila por par
 *     (cliente, empresa). Cada cliente que compra a esta empresa aparece,
 *     incluso si también compra a otras (sin badge en este modo).
 *
 * Orden default: ultima_compra DESC NULLS LAST.
 */
export async function fetchClientes({
  year,
  empresaKey,
}: {
  year: number;
  empresaKey?: string | null;
}): Promise<Clientes> {
  const isTodas = !empresaKey || empresaKey === "todas";
  const currentYear = new Date().getFullYear();
  const isClosedYear = year < currentYear;

  let data: ClientesEmpresaRow[] | null;
  let error: { message: string } | null;
  let viewLabel: string;

  if (isClosedYear) {
    // Año cerrado: usar RPC clientes_anio(p_year, p_empresa). Filtra
    // clientes con compras en p_year (no rolling 12m) y delta vs p_year-1.
    viewLabel = `clientes_anio(${year}, ${empresaKey ?? "todas"})`;
    const res = await supabaseServer.rpc("clientes_anio", {
      p_year: year,
      p_empresa: isTodas ? null : empresaKey,
    });
    data = (res.data as ClientesEmpresaRow[] | null) ?? null;
    error = res.error ? { message: res.error.message } : null;
  } else {
    // Año en curso: vista 12m rolling existente (materialized views).
    //
    // ⚠️ PAGINADO (26-jul-2026): el `.limit(5000)` de antes NO protegía de nada
    // — el tope real es el `db-max-rows` = 1000 de PostgREST, que corta en
    // silencio. `clientes_empresa_12m_vw` tiene 1.563 filas, así que la lista se
    // venía cortando y la fila sintética "Otros clientes (N)" —que SUMA plata—
    // se calculaba sobre una lectura corta. El orden de negocio (última compra
    // desc) se CONSERVA y se le agregan desempates únicos: paginar exige un
    // orden total, y muchas filas comparten `ultima_compra`.
    viewLabel = isTodas ? "clientes_agregado_12m_vw" : `clientes_empresa_12m_vw(${empresaKey})`;
    const vista = isTodas ? "clientes_agregado_12m_vw" : "clientes_empresa_12m_vw";
    try {
      // 🩸 Ventas › Clientes lista SOLO los clientes del GRUPO (las 6 que
      // conviven). Los de Boston viven en CXC › Boston y los de Multifashion en
      // su módulo — Daniel: "sus ventas suman, pero sus clientes no se ven".
      //
      // ⚠️ Esto NO toca un solo total: acá se listan clientes, y la PLATA de los
      // tres mundos se suma en `ventas_dashboard_summary` y en Vista General,
      // que no pasan por esta función. Si un total se moviera, el cambio está mal.
      //
      // El modo "Todas" (clientes_agregado_12m_vw) ya viene sin Boston ni
      // Multifashion: medido, 117 filas y 0 de esas dos empresas.
      const filasCrudas = await leerTodoPaginado<ClientesEmpresaRow>(
        viewLabel,
        (pedirCount, desde, hasta) => {
          const q = supabaseServer
            .from(vista)
            .select("*", pedirCount ? { count: "exact" } : {});
          return (isTodas ? q : q.eq("empresa", empresaKey))
            .order("ultima_compra", { ascending: false, nullsFirst: false })
            .order("cliente_nombre", { ascending: true })
            .order("cliente_id", { ascending: true })
            .range(desde, hasta);
        },
      );
      const filas = isTodas
        ? filasCrudas
        : filasCrudas.filter((r) => esEmpresaDelGrupo((r as { empresa?: string }).empresa));
      data = filas;
      error = null;
    } catch (e) {
      data = null;
      error = { message: e instanceof Error ? e.message : String(e) };
    }
  }

  if (error) {
    throw new Error(`${viewLabel}: ${error.message}`);
  }

  const rows = ((data as ClientesEmpresaRow[] | null) ?? []).map((r, i) => {
    const ek = r.empresa ?? "";
    const empresasCount = isTodas ? Math.max(1, toNum(r.empresas_count)) : 1;
    const empresasBreakdown =
      isTodas && empresasCount > 1 && Array.isArray(r.empresas_breakdown)
        ? r.empresas_breakdown.map(b => ({
            empresaKey: b.empresa,
            empresaNombre: EMPRESA_KEY_TO_NAME[b.empresa] ?? b.empresa,
            monto: toNum(b.monto),
          }))
        : undefined;
    return {
      rank: i + 1,
      id: r.cliente_codigo ?? "—",
      nombre: r.cliente_nombre ?? "(Sin nombre)",
      empresa: EMPRESA_KEY_TO_NAME[ek] ?? ek ?? "—",
      empresaKey: ek,
      ytd: toNum(r.compras_ytd),
      prev: toNum(r.compras_anio_anterior),
      delta: r.delta_vs_2025 == null ? 0 : toNum(r.delta_vs_2025),
      ultima: r.ultima_compra ? fmtDate(r.ultima_compra) : "",
      ultimaIso: r.ultima_compra ?? "",
      wa: r.whatsapp ? normalizeWa(r.whatsapp) : "",
      empresas_count: empresasCount,
      empresas_breakdown: empresasBreakdown,
      // Huérfano = no match en clientes_master (cliente_id NULL en la view).
      // En la UI estos rows se colapsan en la fila sintética "Otros clientes".
      isOrphan: r.cliente_id == null,
      // Empresa del propio grupo comprándole a otra empresa del grupo. Es una
      // venta REAL y suma en los totales como cualquier otra — la marca es sólo
      // para que se vea de un vistazo cuáles son de casa. Llega `undefined`
      // mientras la migración 20260727230000 no esté corrida, y también en el
      // modo "año cerrado" (RPC clientes_anio, que no tiene la columna): en
      // ambos casos simplemente no se muestra la etiqueta.
      esDelGrupo: r.es_del_grupo === true,
    };
  });

  return {
    total: rows.length,
    pageSize: rows.length,
    // 🔴 EL AÑO CONTRA EL QUE SE COMPARA SALE DE ACÁ, NO DE UN LITERAL EN LA
    // PANTALLA. Los rótulos decían "Δ vs 2025" fijo: con 2025 elegido en el
    // selector, la pantalla mostraba "Compras 2025 · Δ vs 2025" mientras la
    // cuenta comparaba contra 2024. Las DOS ramas de esta función comparan
    // contra `year - 1` —la RPC `clientes_anio` con `p_year - 1`, y la vista
    // rolling con `current_year - 1` sobre los mismos meses—, así que el año se
    // deriva del MISMO dato que hace la división y no puede volver a mentir.
    anioComparativo: year - 1,
    rows,
  };
}

/**
 * 🔴 LO QUE NADIE LEE, NO VIAJA. `ventas_proyeccion_cierre_v7` devuelve cinco
 * campos de META por empresa (`meta_anual_manual`, `meta_sugerida`,
 * `meta_efectiva`, `meta_anual`, `gap_vs_meta`) y dos del grupo (`meta_total`,
 * `gap_vs_meta`), y **ninguna pantalla los dibuja** — barrido completo de
 * `src/`: cero renders, solo el tipo. Igual cruzaban el cable en cada carga
 * de /ventas.
 *
 * Se quitan ACÁ, del lado del servidor, y no en el SQL: cambiar la RPC exige
 * una migración que corre Daniel a mano, y ésa es la consulta que alimenta la
 * columna "Proyección" que él sí mira todos los días. Tocar el TypeScript no
 * puede mover un número; tocar la RPC, sí.
 *
 * ⚠️ TODO LO DEMÁS SE CONSERVA TAL CUAL —`proyeccion_cierre`,
 * `cierre_anio_anterior`, `algoritmo`, `factor_final`, `status`…—: es lo que
 * leen la celda de proyección y `proyeccion-texto.ts`.
 */
function stripMetasProyeccion(cruda: ProyeccionRespCruda): ProyeccionResp {
  const {
    meta_total: _mt, gap_vs_meta: _gg, ...totales_grupo
  } = cruda.totales_grupo ?? ({} as ProyeccionGrupoCrudo);
  return {
    ...cruda,
    empresas: (cruda.empresas ?? []).map((e) => {
      const {
        meta_anual_manual: _m1, meta_sugerida: _m2, meta_efectiva: _m3,
        meta_anual: _m4, gap_vs_meta: _m5, ...resto
      } = e;
      return resto;
    }),
    totales_grupo,
  };
}

/** "+507 6000-1111" / "60001111" / "507-6000-1111" → "+50760001111" */
function normalizeWa(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("507")) return "+" + digits;
  if (digits.length === 8) return "+507" + digits;
  return "+" + digits;
}

/**
 * Años con data en switch_facturas (fuente única, historia 2022+) — alimenta el dropdown del tab Resumen.
 * Devuelve siempre al menos el año actual, ordenado descendente.
 */
export async function fetchAvailableYears(): Promise<number[]> {
  // Fuente única switch_facturas: el rango de años sale de fecha (no hay columna
  // anio). switch_facturas tiene toda la historia backfilleada (2022+).
  const [minRes, maxRes] = await Promise.all([
    supabaseServer.from("switch_facturas").select("fecha").order("fecha", { ascending: true }).limit(1),
    supabaseServer.from("switch_facturas").select("fecha").order("fecha", { ascending: false }).limit(1),
  ]);
  const minF = minRes.data?.[0]?.fecha as string | undefined;
  const maxF = maxRes.data?.[0]?.fecha as string | undefined;
  const minYear = minF ? new Date(minF).getFullYear() : null;
  const maxYear = maxF ? new Date(maxF).getFullYear() : null;
  const years = new Set<number>();
  if (minYear && maxYear) {
    for (let y = minYear; y <= maxYear; y++) years.add(y);
  }
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}

/**
 * Multifashion tab — single retail store snapshot.
 * Llama al RPC multifashion_mensual que retorna jsonb con todo el shape listo.
 */
export async function fetchMultifashion({
  year,
  mes,
}: {
  year: number;
  mes: number;
}): Promise<Multifashion> {
  // v6 = shape Multifashion (retail/wholesale/total). serie_v1 ×2 (year y year-1)
  // alimenta la línea acumulada diaria del Overview; proyeccion_cierre_v1 la
  // proyección ponderada por temporada del header. Todo en paralelo.
  const [mv6, serieAct, seriePrev, proy] = await Promise.all([
    // v7 = v6 con el bloque de margen tienda-completa leído de ventas_rollup_mensual_mv
    // (híbrido: cerrados=MV, mes en curso=vivo) → quita 2 agregaciones en vivo de
    // switch_ventas_unificado_vw (~2.2s c/u). Mismo número exacto. Migración:
    // 20260623130000_multifashion_margen_desde_mv.sql. Fallback a v6 si aún no se
    // aplicó (deploy sin orden forzado).
    (async () => {
      const v7 = await withDbRetry(
        () => supabaseServer.rpc("multifashion_mensual_v7", { p_year: year, p_mes: mes }),
        { label: "multifashion_mensual_v7" },
      );
      if (!v7.error) return v7;
      // Igual que arriba: el fallback a v6 cubre "la migración de v7 no corrió",
      // no un timeout. v6 hace MÁS trabajo que v7 (agrega en vivo lo que v7 lee
      // del MV), así que ante un timeout intentarla es garantía de otro timeout.
      if (isTransientDbError(v7.error)) return v7;
      return withDbRetry(
        () => supabaseServer.rpc("multifashion_mensual_v6", { p_year: year, p_mes: mes }),
        { label: "multifashion_mensual_v6" },
      );
    })(),
    withDbRetry(() => supabaseServer.rpc("multifashion_overview_serie_v1", { p_year: year }), { label: "multifashion_overview_serie_v1" }),
    withDbRetry(() => supabaseServer.rpc("multifashion_overview_serie_v1", { p_year: year - 1 }), { label: "multifashion_overview_serie_v1(prev)" }),
    withDbRetry(() => supabaseServer.rpc("multifashion_proyeccion_cierre_v1", { p_year: year }), { label: "multifashion_proyeccion_cierre_v1" }),
  ]);
  if (mv6.error) throw new Error(`multifashion_mensual_v7/v6: ${mv6.error.message}`);
  if (serieAct.error) throw new Error(`multifashion_overview_serie_v1(${year}): ${serieAct.error.message}`);
  if (seriePrev.error) throw new Error(`multifashion_overview_serie_v1(${year - 1}): ${seriePrev.error.message}`);
  if (proy.error) throw new Error(`multifashion_proyeccion_cierre_v1: ${proy.error.message}`);

  return {
    ...(mv6.data as Multifashion),
    serieActual: serieAct.data as MultifashionSerieAnio,
    seriePrevio: seriePrev.data as MultifashionSerieAnio,
    proyeccionCierre: proy.data as MultifashionProyeccion,
  };
}
