// Domain types for the Ventas module.

import type { VentasEmpresaId } from "@/lib/empresa-mapping";

export type EmpresaId = VentasEmpresaId;

export type Empresa = {
  id: EmpresaId;
  nombre: string;
  tipo: "b2b" | "retail";
};

/** 12-element array; null = month not yet closed (future). */
export type MonthlySeries = (number | null)[];

export type EmpresaMonthlySales = {
  empresa: Empresa;
  ventas2026: MonthlySeries;
  ventas2025: MonthlySeries;
  /** Utilidad mensual del año actual (toggle Utilidad del heatmap) */
  utilidad2026: MonthlySeries;
  /** Utilidad mensual del año anterior */
  utilidad2025: MonthlySeries;
  /** Margen YTD real del año actual, filtrado por costo > 0 (excluye ajustes contables) */
  margenPct: number;
  /** Margen YTD real del año previo, filtrado por costo > 0 (mismo período Ene..mesActual) */
  margenPctPrev: number;
};

export type ResumenKpis = {
  ventasNetasYTD: number;
  ventas2025YTD: number;
  utilidadYTD: number;
  /** Utilidad YTD real del año previo (NO aproximación) */
  utilidad2025YTD: number;
  margenYTD: number;
  /** Margen YTD real del año previo, filtrado por costo > 0 */
  margen2025YTD: number;
  multifashionYTD: number;
  metaAnualMultifashion: number;
};

/** Bloque por empresa que devuelve ventas_meta_sugerida_v1 (RPC). */
export type MetaSugeridaEmpresa = {
  empresa: string;                 // empresa key snake_case
  nombre: string;                  // display name ("Vistana International")
  ventas_prev_year: number;
  ritmo_historico: number | null;  // 0.05 = +5% crecimiento promedio histórico
  historia_disponible: number;     // 0..3 (cuántos crecimientos efectivos)
  factor_final: number | null;     // ratio clampeado [0.90, 1.25]
  meta_sugerida: number | null;    // ventas_prev_year * factor_final
  meta_manual_actual: number | null; // de ventas_metas (NULL si no hay)
};

/** Bloque por empresa que devuelve ventas_proyeccion_cierre_v5. */
export type ProyeccionEmpresa = {
  empresa: string;
  nombre: string;
  ventas_ytd: number;
  ventas_prev_ytd_sp: number;   // YTD prev year same-period
  ventas_prev_year: number;     // full prev year (base de proyección)
  /** v5: alias semánticamente claro de ventas_prev_year. La UI nueva consume
   *  este campo para comparar proyección 2026 vs cierre real 2025. */
  cierre_anio_anterior: number;
  /** v5: proyeccion_cierre - cierre_anio_anterior. null si cierre = 0. */
  delta_vs_anio_anterior: number | null;
  /** v5: delta / cierre. null si cierre = 0. Decimal: 0.05 = +5%. */
  delta_vs_anio_anterior_pct: number | null;
  ritmo_actual: number | null;  // ratio: 1.05 = +5% YTD vs prev YTD
  ritmo_historico: number | null;
  historia_disponible: number;
  /** v3: fracción del año previo cumplida al día de corte same-period.
   *  Solo populated en rama 'estacional'; null en mixto/fallback. */
  frac_ytd_estacional: number | null;
  /** v3: 'estacional' (linear por frac_ytd), 'mixto' (v2), 'fallback_lineal'. */
  algoritmo: "estacional" | "mixto" | "fallback_lineal";
  factor_final: number | null;
  proyeccion_cierre: number;
  proyeccion_restante: number;  // max(0, proyeccion - ytd)
  /** v4: tres niveles de meta para que la UI pueda mostrar el origen.
   *  meta_anual_manual    : valor de ventas_metas (null si no hay override).
   *  meta_sugerida        : calculo automático sobre histórico (null si sin historia).
   *  meta_efectiva        : COALESCE(manual, sugerida) — la que el sistema considera vigente.
   *  meta_anual           : alias = meta_efectiva (retrocompat con frontend v3). */
  meta_anual_manual: number | null;
  meta_sugerida: number | null;
  meta_efectiva: number | null;
  meta_anual: number | null;
  gap_vs_meta: number | null;
  es_fallback_lineal: boolean;
  status: "verde" | "amarillo" | "rojo" | "gris";
};

/** Totales agregados del grupo. Alimenta el hero del Resumen + la lista
 *  por empresa ordenada por impacto. */
export type ProyeccionGrupo = {
  ventas_ytd: number;
  proyeccion_cierre: number;
  proyeccion_restante: number;
  meta_total: number;
  gap_vs_meta: number | null;
  /** v5: cierre real del año anterior completo (suma de empresas). */
  cierre_anio_anterior_total: number;
  /** v5: proyeccion_cierre - cierre_anio_anterior_total. */
  delta_vs_anio_anterior_total: number | null;
  /** v5: delta / cierre (decimal). */
  delta_vs_anio_anterior_pct: number | null;
  status: "verde" | "amarillo" | "rojo" | "gris";
};

export type ProyeccionResp = {
  anio: number;
  fecha_corte: string | null;
  mes_corte: number;          // 0 si sin data
  peso_ritmo: number;         // mes_corte / 12
  peso_historico: number;     // 1 - peso_ritmo
  empresas: ProyeccionEmpresa[];
  totales_grupo: ProyeccionGrupo;
};

export type VentasResumen = {
  year: number;
  /** Last closed month index (0-11). e.g. 4 = Ene-Abr cerrados */
  mesActual: number;
  kpis: ResumenKpis;
  empresas: EmpresaMonthlySales[];
  /** true cuando el `year` coincide con el año calendario actual y el
   *  mes en curso tiene el comparativo prev recortado day-by-day. */
  es_periodo_parcial: boolean;
  /** YYYY-MM-DD. Día actual del calendario cuando es_periodo_parcial.
   *  null cuando se mira un año cerrado. */
  fecha_corte: string | null;
  /** YYYY-MM-DD. Día tope aplicado al mes en curso del año anterior
   *  (mismo offset desde el inicio del mes que fecha_corte). null
   *  cuando se mira un año cerrado. */
  dia_corte_anio_anterior: string | null;
  /** ISO timestamp. MAX(synced_at) de switch_facturas — momento del último
   *  sync que insertó data nueva. Lo usa el subtitle "Data actualizada al
   *  ..." para mostrar frescura real (no la fecha de hoy). null si
   *  switch_facturas está vacío. */
  data_actualizada_at: string | null;
  /** Proyección de cierre del año actual (por empresa + grupo). null si
   *  la RPC falló o el año seleccionado no tiene data. */
  proyeccion: ProyeccionResp | null;
};

export type Cliente = {
  rank: number;
  /** Internal Switch Soft code, e.g. "D-04" */
  id: string;
  nombre: string;
  /** Display name, e.g. "Vistana International" */
  empresa: string;
  /** Long key for filtering, e.g. "vistana" */
  empresaKey: string;
  ytd: number;
  /** Δ vs same period 2025 as decimal: 0.18 = +18% */
  delta: number;
  /** Display-formatted date "27 abr 2026" */
  ultima: string;
  /** Raw ISO date for sorting; "" when no purchase */
  ultimaIso: string;
  /**
   * Cantidad de empresas a las que el cliente compró en últimos 12 meses.
   * 1 = single-empresa (sin badge).
   * >1 = multiempresa, en modo "Todas" la celda muestra "N empresas" +
   * hover con el desglose. Siempre 1 cuando filter es empresa específica.
   */
  empresas_count: number;
  /**
   * Desglose por empresa para el hover de la columna en modo "Todas".
   * Ordenado por monto DESC. Sólo populated cuando empresas_count > 1
   * (en modo empresa específica queda undefined).
   */
  empresas_breakdown?: { empresaKey: string; empresaNombre: string; monto: number }[];
  /** WhatsApp E.164 number, e.g. "+50760001111" */
  wa: string;
  /** Compras del año anterior (mismo período YTD). Usado para agregar deltas
   *  same-period en la fila sintética "Otros clientes". */
  prev: number;
  /** true cuando el row no tiene match en clientes_master (cliente_id NULL).
   *  Estos rows se agrupan en la fila "Otros clientes" en la UI. */
  isOrphan: boolean;
  /** true sólo en la fila sintética "Otros clientes" que agrupa huérfanos.
   *  Cliente individual nunca tiene este flag. */
  isOtrosAggregate?: boolean;
};

export type Clientes = {
  total: number;
  pageSize: number;
  rows: Cliente[];
};

export type RetailMonthly = {
  mes: string;
  ventas: number;
  tickets: number;
  ticketProm: number;
  vs2025: number | null;
  /** true sólo en el mes que contiene CURRENT_DATE (calendario, no data). */
  es_periodo_parcial?: boolean;
  /** YYYY-MM-DD. MAX(fecha) con data del mes actual cuando es_periodo_parcial=true. */
  fecha_corte?: string | null;
  /** YYYY-MM-DD. Día tope aplicado al mes del año anterior para mantener
   *  same-period day-by-day. Sólo cuando es_periodo_parcial=true. */
  dia_corte_anio_anterior?: string | null;
};

export type Vendedora = {
  nombre: string;
  tickets: number;
  ventas: number;
  /** Δ vs prior month (Marzo) as decimal */
  deltaMarzo: number;
  ticketProm: number;
  comision: number;
  manager: boolean;
  top: boolean;
};

/** Período activo del sub-tab Vendedoras. */
export type VendedorasPeriodoTipo = "mes" | "trimestre" | "ytd";

/** Una fila del ranking de vendedoras devuelta por la RPC
 *  multifashion_vendedoras(...). Delta compara contra el mismo período
 *  del año anterior; null = no había actividad para comparar. */
export type VendedoraDetalle = {
  nombre: string;
  tickets: number;
  ventas: number;
  ticket_promedio: number;
  comision: number;
  manager: boolean;
  top: boolean;
  delta_ventas_pct: number | null;
  delta_tickets_pct: number | null;
};

/** Shape JSON devuelto por la RPC multifashion_vendedoras. */
export type VendedorasPeriodo = {
  vendedoras: VendedoraDetalle[];
  total_vendedoras_periodo: number;
  ventas_total: number;
  tickets_total: number;
  ventas_total_prev: number;
  tickets_total_prev: number;
  /** MAX(fecha) con data en el período actual. ISO YYYY-MM-DD.
   *  null cuando no hay data en el período actual (período futuro o vacío). */
  fecha_corte: string | null;
  /** true cuando el período seleccionado contiene la fecha actual del
   *  calendario, false cuando ya cerró. */
  es_periodo_parcial: boolean;
  /** Fecha tope aplicada al período inmediatamente anterior (mes/trim
   *  anterior; para ytd sigue siendo año anterior). ISO YYYY-MM-DD.
   *  Mismo offset de días desde el inicio que fecha_corte. null cuando
   *  no hay data en el período actual. */
  dia_corte_periodo_anterior: string | null;
  /** @deprecated Mantener para compatibilidad transicional: respuesta
   *  duplicada de `dia_corte_periodo_anterior` mientras Vercel propaga
   *  el frontend nuevo. Eliminar en sesión 4+. */
  dia_corte_anio_anterior: string | null;
};

export type WholesaleMonthly = {
  mes: string;
  ventas: number;
  tickets: number;
};

export type MultifashionRetail = {
  ytdVentas: number;
  ytdTickets: number;
  ticketProm: number;
  margen: number;
  /** Margen retail YTD del año anterior — mismo período (mes <= p_mes).
   *  Usado por la UI para "Δ X pts vs 2025" en el card Margen Bruto. */
  margenPrev: number;
  meses: RetailMonthly[];
};

export type MultifashionWholesale = {
  ytdVentas: number;
  ytdTickets: number;
  /** Cliente con más ventas wholesale en el año en curso (ej. "LA FRONTERA
   *  DUTY FREE"). null cuando no hay wholesale data del año. */
  topClienteName: string | null;
  /** Cantidad de clientes distintos con ventas wholesale en el año. */
  totalClientes: number;
  meses: WholesaleMonthly[];
};

export type MultifashionTotal = {
  ytdVentas: number;
  ytdTickets: number;
};

export type Multifashion = {
  tienda: string;
  ubicacion: string;
  manager: string;
  metaAnual: number;
  /** 0..1 fraction of year elapsed at "today" — used for progress marker.
   *  Calculado contra TOTAL (retail + wholesale) porque la meta anual del
   *  negocio se mide históricamente sobre el total. */
  expectedTodayPct: number;
  retail: MultifashionRetail;
  wholesale: MultifashionWholesale;
  total: MultifashionTotal;
};
