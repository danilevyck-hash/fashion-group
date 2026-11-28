// ─────────────────────────────────────────────────────────────────────────────
// VISTA GENERAL «HOY» (27-nov-2026, `VISTA_GENERAL_HOY_2026_11`). Módulo PURO:
// lo leen la ruta, la pantalla y el cuadre (`scripts/_cuadre-vista-general-hoy.ts`).
//
// Sin mes ni período: cómo está el negocio HOY. El servidor manda cada empresa
// por separado y la pantalla suma las que se eligieron con ESTAS funciones,
// así «Fashion Group» es siempre la suma exacta de sus seis.
//
// Contrato de cada dato de una empresa:
//   · la clave NO viene  → la empresa no lo maneja en el sistema;
//   · viene `null`       → no se pudo medir (nunca se pinta $0);
//   · viene el valor     → el número.
// ─────────────────────────────────────────────────────────────────────────────

import { B2B_EMPRESA_KEYS, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { variacionPct } from "@/lib/variacion";

export const VALOR_GRUPO = "grupo";
export const ROTULO_GRUPO = "Fashion Group";
export const BOSTON = "confecciones_boston";
export const MULTIFASHION = "american_classic";
/** Las dos que van aparte: nunca suman al grupo. */
export const APARTE: readonly string[] = [BOSTON, MULTIFASHION];

export type Dato = "cobros" | "pedidos" | "cxc" | "cxp" | "inventario";

/** Lo que cada empresa NO maneja en el sistema (Daniel, 27-nov-2026). */
export const NO_LO_MANEJA: Readonly<Record<string, readonly Dato[]>> = {
  [BOSTON]: ["pedidos", "cxp", "inventario"],
  [MULTIFASHION]: ["cxc", "pedidos"],
};

export const loManeja = (empresa: string, d: Dato): boolean => !(NO_LO_MANEJA[empresa] ?? []).includes(d);

/** Pedidos con más de estos días desde la fecha del pedido sin despachar → punto. */
export const DIAS_PEDIDO_ATRASADO = 3;

export interface SeriesVentas {
  /** 12 meses del año en curso (Ventas › Resumen, la MISMA lectura). */
  serie: (number | null)[];
  /** 12 meses del año pasado; el mes en curso recortado a los mismos días. */
  seriePrev: (number | null)[];
  /** Utilidad con el mes en curso hasta el último día con costo. */
  utilidad: (number | null)[];
  /** La venta con que se divide el margen (sin la venta de hoy en el mes en curso). */
  ventasMargen: (number | null)[];
  costo: (number | null)[];
  /** Utilidad del año pasado (mismos días en el mes en curso), para el margen mes a mes. */
  utilidadPrev?: (number | null)[];
}

export interface ConteoPedidos {
  pendiente: number;
  en_preparacion: number;
  preparado: number;
  /** Por despachar con más de `DIAS_PEDIDO_ATRASADO` días desde el pedido. */
  atrasados: number;
}

export interface Cartera {
  total: number;
  /** Lo de 121 días en adelante. «Hasta 120» = total − esto. */
  mas120: number;
}

export interface Inventario {
  costo: number;
  unidades: number;
}

export interface EmpresaHoy {
  ventas: SeriesVentas | null;
  cobros?: number | null;
  pedidos?: ConteoPedidos | null;
  cxc?: Cartera | null;
  cxp?: Cartera | null;
  inventario?: Inventario | null;
}

export interface VistaGeneralHoyData {
  generadoEn: string;
  /** De cuándo es el dato de ventas (última carga de facturas). */
  actualizado: string | null;
  anio: number;
  /** Mes en curso de Panamá, 1–12. */
  mes: number;
  /** Último día cargado del mes en curso (para la tarjeta mes a mes). */
  fechaCorte: string | null;
  empresas: Record<string, EmpresaHoy>;
}

// ── El selector ─────────────────────────────────────────────────────────────

export interface OpcionEmpresaHoy {
  valor: string;
  etiqueta: string;
  /** Las que van separadas en la lista (Boston y Multifashion). */
  grupo?: string;
}

export function opcionesEmpresaHoy(): OpcionEmpresaHoy[] {
  return [
    { valor: VALOR_GRUPO, etiqueta: ROTULO_GRUPO },
    ...B2B_EMPRESA_KEYS.map((k) => ({ valor: k as string, etiqueta: nombreCortoEmpresa(k) })),
    { valor: BOSTON, etiqueta: "Confecciones Boston", grupo: "Otras empresas" },
    { valor: MULTIFASHION, etiqueta: "Multifashion", grupo: "Otras empresas" },
  ];
}

/** Un `?empresa=` raro cae en Fashion Group. */
export function empresaValida(v: string | null | undefined): string {
  return opcionesEmpresaHoy().some((o) => o.valor === v) ? (v as string) : VALOR_GRUPO;
}

/** Las empresas que suma una opción del selector. */
export function empresasDe(valor: string): readonly string[] {
  return valor === VALOR_GRUPO ? B2B_EMPRESA_KEYS : [valor];
}

// ── Las sumas ───────────────────────────────────────────────────────────────

export interface Comparado {
  actual: number;
  previo: number | null;
  pct: number | null;
}

/** «No lo maneja» · «No se pudo medir» · el valor. */
export type Celda<T> = { estado: "no-maneja" } | { estado: "sin-medir" } | { estado: "ok"; valor: T };

export interface Resumen {
  ventasMes: Comparado | null;
  ventasAnio: Comparado | null;
  /** 0–1; null = sin venta con costo en el mes. */
  margenMes: number | null;
  cobros: Celda<number>;
  pedidos: Celda<ConteoPedidos>;
  cxc: Celda<Cartera>;
  cxp: Celda<Cartera>;
  inventario: Celda<Inventario>;
}

const v0 = (n: number | null | undefined) => n ?? 0;

function sumarCelda<T>(
  keys: readonly string[],
  datos: Record<string, EmpresaHoy>,
  d: Dato,
  sumar: (a: T, b: T) => T,
): Celda<T> {
  const suyas = keys.filter((k) => loManeja(k, d));
  if (suyas.length === 0) return { estado: "no-maneja" };
  let acc: T | null = null;
  for (const k of suyas) {
    const v = datos[k]?.[d] as T | null | undefined;
    if (v == null) return { estado: "sin-medir" };
    acc = acc == null ? v : sumar(acc, v);
  }
  return { estado: "ok", valor: acc as T };
}

const sumaCartera = (a: Cartera, b: Cartera): Cartera => ({ total: a.total + b.total, mas120: a.mas120 + b.mas120 });

export function resumir(keys: readonly string[], data: Pick<VistaGeneralHoyData, "mes" | "empresas">): Resumen {
  const i = data.mes - 1;
  const ventas = keys.map((k) => data.empresas[k]?.ventas ?? null);
  const conVentas = ventas.every((v) => v != null) ? (ventas as SeriesVentas[]) : null;

  let ventasMes: Comparado | null = null;
  let ventasAnio: Comparado | null = null;
  let margenMes: number | null = null;
  if (conVentas) {
    const mes = conVentas.reduce((s, v) => s + v0(v.serie[i]), 0);
    const mesPrev = conVentas.some((v) => v.seriePrev[i] != null) ? conVentas.reduce((s, v) => s + v0(v.seriePrev[i]), 0) : null;
    const anio = conVentas.reduce((s, v) => s + v.serie.reduce<number>((a, x) => a + v0(x), 0), 0);
    const anioPrev = conVentas.reduce((s, v) => s + v.seriePrev.slice(0, data.mes).reduce<number>((a, x) => a + v0(x), 0), 0);
    ventasMes = { actual: mes, previo: mesPrev, pct: variacionPct(mes, mesPrev) };
    ventasAnio = { actual: anio, previo: anioPrev, pct: variacionPct(anio, anioPrev) };
    // La MISMA regla del margen de Ventas: solo empresa-mes con costo > 0, y la
    // venta sin lo de hoy (`margen-mes-en-curso.ts`).
    let u = 0;
    let vm = 0;
    for (const v of conVentas) {
      if (v0(v.costo[i]) > 0 && v.utilidad[i] != null) {
        u += v0(v.utilidad[i]);
        vm += v0(v.ventasMargen[i]);
      }
    }
    margenMes = vm > 0 ? u / vm : null;
  }

  return {
    ventasMes,
    ventasAnio,
    margenMes,
    cobros: sumarCelda<number>(keys, data.empresas, "cobros", (a, b) => a + b),
    pedidos: sumarCelda<ConteoPedidos>(keys, data.empresas, "pedidos", (a, b) => ({
      pendiente: a.pendiente + b.pendiente,
      en_preparacion: a.en_preparacion + b.en_preparacion,
      preparado: a.preparado + b.preparado,
      atrasados: a.atrasados + b.atrasados,
    })),
    cxc: sumarCelda<Cartera>(keys, data.empresas, "cxc", sumaCartera),
    cxp: sumarCelda<Cartera>(keys, data.empresas, "cxp", sumaCartera),
    inventario: sumarCelda<Inventario>(keys, data.empresas, "inventario", (a, b) => ({
      costo: a.costo + b.costo,
      unidades: a.unidades + b.unidades,
    })),
  };
}

// ── El margen mes a mes (mantener presionado «Margen del mes») ─────────────

export interface MargenDelMes {
  mes: number;
  /** 0–1; null = sin venta con costo ese mes. */
  actual: number | null;
  previo: number | null;
}

/**
 * Margen de cada mes del año con la MISMA regla de la tarjeta (`resumir`) y de
 * Ventas › Resumen: solo empresa-mes con costo > 0; el mes en curso, hasta el
 * último día con costo. El año pasado igual, con su utilidad y su venta (el mes
 * en curso a los mismos días). El total = margen del año hasta el mes en curso.
 */
export function margenMesAMes(
  keys: readonly string[],
  data: Pick<VistaGeneralHoyData, "mes" | "empresas">,
): { meses: MargenDelMes[]; total: { actual: number | null; previo: number | null } } | null {
  const vs = keys.map((k) => data.empresas[k]?.ventas ?? null);
  if (vs.some((v) => v == null)) return null;
  const series = vs as SeriesVentas[];
  const acc = { u: 0, v: 0, up: 0, vp: 0 };
  const meses: MargenDelMes[] = [];
  for (let i = 0; i < data.mes; i++) {
    let u = 0, vm = 0, up = 0, vp = 0;
    for (const s of series) {
      if (v0(s.costo[i]) > 0 && s.utilidad[i] != null) {
        u += v0(s.utilidad[i]);
        vm += v0(s.ventasMargen[i]);
      }
      const uPrev = s.utilidadPrev?.[i];
      if (uPrev != null && v0(s.seriePrev[i]) - uPrev > 0) {
        up += uPrev;
        vp += v0(s.seriePrev[i]);
      }
    }
    acc.u += u; acc.v += vm; acc.up += up; acc.vp += vp;
    meses.push({ mes: i + 1, actual: vm > 0 ? u / vm : null, previo: vp > 0 ? up / vp : null });
  }
  return {
    meses,
    total: { actual: acc.v > 0 ? acc.u / acc.v : null, previo: acc.vp > 0 ? acc.up / acc.vp : null },
  };
}

/** «▲ +1.2 pts» / «▼ −0.8 pts»: la diferencia de dos márgenes, en puntos (como Ventas › Resumen). */
export function cambioEnPuntos(actual: number, previo: number | null | undefined): { texto: string; tono: "up" | "dn" | "fl" } {
  if (previo == null) return { texto: "—", tono: "fl" };
  const pts = Math.round((actual - previo) * 1000) / 10;
  if (pts === 0) return { texto: "0.0 pts", tono: "fl" };
  return pts > 0 ? { texto: `▲ +${pts.toFixed(1)} pts`, tono: "up" } : { texto: `▼ −${Math.abs(pts).toFixed(1)} pts`, tono: "dn" };
}

export const porDespachar = (p: ConteoPedidos): number => p.pendiente + p.en_preparacion + p.preparado;

// ── Formato ─────────────────────────────────────────────────────────────────

/** `$1.76M` · `$586k` · `$940`. */
export function montoCorto(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}k`;
  return `${sign}$${Math.round(a)}`;
}

/** `0.123` → `«12%»`. */
export const porcentaje = (n: number): string => `${Math.round(n * 100)}%`;

// ── A dónde lleva cada tarjeta (drill-down, con la misma empresa) ───────────

export type Destino = "ventas" | "cxc" | "pedidos" | "cxp" | "inventario";

/** La `key` del módulo de cada destino (para saber si el rol lo tiene). */
export function moduloDe(destino: Destino, valor: string): string {
  if (destino === "ventas") return valor === BOSTON ? "boston" : valor === MULTIFASHION ? "multifashion" : "ventas";
  if (destino === "cxc") return "cxc";
  if (destino === "pedidos") return "guias";
  if (destino === "cxp") return "proveedores";
  return "referencia";
}

export function enlaceDe(destino: Destino, valor: string): string {
  const una = valor !== VALOR_GRUPO;
  const q = (base: string) => (una ? `${base}${base.includes("?") ? "&" : "?"}empresa=${encodeURIComponent(valor)}` : base);
  switch (destino) {
    case "ventas":
      if (valor === BOSTON) return "/boston";
      if (valor === MULTIFASHION) return "/multifashion";
      return una ? q("/ventas?tab=clientes") : "/ventas";
    case "cxc":
      return valor === BOSTON ? "/cxc?tab=boston" : q("/cxc");
    case "pedidos":
      return q("/despachos?vista=pedidos");
    case "cxp":
      return q("/proveedores");
    case "inventario":
      // Consulta de artículos busca por artículo, no filtra por empresa.
      return "/referencia";
  }
}
