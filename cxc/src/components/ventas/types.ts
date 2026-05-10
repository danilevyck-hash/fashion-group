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
  margenPct: number;
};

export type ResumenKpis = {
  ventasNetasYTD: number;
  ventas2025YTD: number;
  utilidadYTD: number;
  margenYTD: number;
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
  empresa: string;
  ytd: number;
  /** Δ vs same period 2025 as decimal: 0.18 = +18% */
  delta: number;
  /** Display-formatted date "27 abr 2026" */
  ultima: string;
  /** WhatsApp E.164 number, e.g. "+50760001111" */
  wa: string;
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
  vs2025: number;
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
