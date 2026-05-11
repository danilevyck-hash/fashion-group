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

export type VentasResumen = {
  year: number;
  /** Last closed month index (0-11). e.g. 4 = Ene-Abr cerrados */
  mesActual: number;
  kpis: ResumenKpis;
  empresas: EmpresaMonthlySales[];
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
  /** Fecha tope aplicada al período del año anterior (mismo offset de
   *  días desde el inicio que fecha_corte). null cuando no hay data
   *  en el período actual. */
  dia_corte_anio_anterior: string | null;
};

export type Multifashion = {
  tienda: string;
  ubicacion: string;
  manager: string;
  metaAnual: number;
  ytdVentas: number;
  ytdTickets: number;
  ticketProm: number;
  margen: number;
  /** 0..1 fraction of year elapsed at "today" — used for progress marker */
  expectedTodayPct: number;
  meses: RetailMonthly[];
  vendedoras: Vendedora[];
  abrVentas: number;
  abrTicketProm: number;
  abrComisiones: number;
  /** Bono adicional pagado a la TOP vendedora cuando supera mes anterior */
  bonoTop: number;
};
