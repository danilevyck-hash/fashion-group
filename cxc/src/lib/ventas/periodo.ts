// ─────────────────────────────────────────────────────────────────────────────
// UN SOLO SELECTOR DE PERÍODO PARA TODO VENTAS (11-sep-2026).
// (módulo PURO: sin React, sin fetch, sin reloj — el «hoy» llega por parámetro)
//
// 🩸 Hasta hoy había TRES controles de tiempo en el módulo, y ninguno sabía
// de los otros: el AÑO suelto arriba a la derecha (que en Productos ni se
// dibujaba), el desplegable «Clientes: últimos 12 meses / con compras en 2026»
// de la pestaña Clientes (que en los modos Utilidad y Margen no hacía nada), y
// el «Período» propio de Productos (Año en curso · Últimos 6 · Últimos 12 · Año
// pasado), que se contaba desde HOY y no miraba el año de arriba — con un
// párrafo explicando que «el año de arriba no se aplica».
//
// Queda UN desplegable arriba, el MISMO patrón que Multifashion
// (`src/lib/multifashion/periodo.ts`) y Comisiones:
//
//     Año 2026 ⌄        (Año 2026 · 2025 · 2024 · … · Últimos 12 meses · Últimos 6 meses)
//
// que manda en las tres pestañas, vive en la URL (`?periodo=`) y se recuerda
// por usuario (`fg_last_ventas_periodo`). Daniel, con el mockup del 11-sep:
// *«un solo selector arriba … que manda en las tres pestañas; dicho una vez»*.
//
// 🔴 CADA PESTAÑA OFRECE SOLO LO QUE SABE SERVIR, y no es cosmético:
//   · Resumen es la matriz de UN AÑO (12 meses × 8 empresas): no sabe dibujar
//     una ventana rodante.
//   · Clientes lee la vista `clientes_empresa_12m_vw`, que suma por AÑO
//     (`compras_ytd`) y, desde la migración `20261121120000`, también las
//     ventanas de 6 y 12 meses. Mientras esa DDL no corra la pestaña sirve
//     solo años, y lo dice el servidor (`ventanasDisponibles`), nunca una
//     lista escrita a mano.
//   · Productos sirve los años (cualquiera con datos) y las dos ventanas.
// Un período que la pestaña no sabe servir cae al AÑO EN CURSO
// (`ajustarPeriodo`), nunca a una pantalla vacía ni a otro número en silencio.
//
// ⚠️ LO QUE NO CAMBIA: el año en curso es el de PANAMÁ (`hoyPanama`, lo pasa la
// página), las comparaciones siguen siendo contra los MISMOS DÍAS del año
// anterior, y este módulo no toca una sola fórmula: elige el período.
// ─────────────────────────────────────────────────────────────────────────────

import type { TabVentas } from "@/lib/ventas/pestanas";

export type VentanaN = 6 | 12;

export type PeriodoVentas =
  /** Un año de calendario (en el año en curso, lo que va del año). */
  | { tipo: "anio"; anio: number }
  /** Ventana rodante de N meses de calendario que termina en el mes en curso. */
  | { tipo: "ultimos"; n: VentanaN };

/** Las ventanas que existen en el sistema, en el orden del desplegable. */
export const VENTANAS: readonly VentanaN[] = [12, 6] as const;

/** Clave con la que se recuerda por usuario (`useLastUsed` → `fg_last_…`). */
export const MEMORIA_PERIODO_VENTAS = "ventas_periodo";

/** El parámetro de la URL. Es un filtro del MISMO nivel → `replace`. */
export const PARAM_PERIODO_VENTAS = "periodo";

/** Qué sabe servir cada pestaña. Las ventanas de Clientes las dice el servidor. */
export interface CapacidadesPeriodo {
  /** Ventanas que la vista de Clientes trae hoy (`[]` mientras la DDL no corra). */
  clientesVentanas: readonly VentanaN[];
}

export const SIN_VENTANAS_EN_CLIENTES: CapacidadesPeriodo = { clientesVentanas: [] };

export function ventanasDeTab(tab: TabVentas, cap: CapacidadesPeriodo): readonly VentanaN[] {
  if (tab === "productos") return VENTANAS;
  if (tab === "clientes") return VENTANAS.filter((n) => cap.clientesVentanas.includes(n));
  return [];
}

/** ¿Esta pestaña sabe servir este período? Los años los sirven las tres. */
export function periodoSirve(tab: TabVentas, p: PeriodoVentas, cap: CapacidadesPeriodo): boolean {
  if (p.tipo === "anio") return true;
  return ventanasDeTab(tab, cap).includes(p.n);
}

/** El año con el que se pide cada lectura: el suyo, o el en curso. */
export function anioDelPeriodo(p: PeriodoVentas, anioEnCurso: number): number {
  return p.tipo === "anio" ? p.anio : anioEnCurso;
}

/** El período con el que abre el módulo: el año en curso (de Panamá). */
export function periodoPorDefecto(anioEnCurso: number): PeriodoVentas {
  return { tipo: "anio", anio: anioEnCurso };
}

/**
 * Un período que la pestaña no sabe servir cae al AÑO EN CURSO. Nunca a una
 * pantalla vacía y nunca a otro período en silencio.
 */
export function ajustarPeriodo(
  p: PeriodoVentas,
  tab: TabVentas,
  anioEnCurso: number,
  cap: CapacidadesPeriodo,
): PeriodoVentas {
  return periodoSirve(tab, p, cap) ? p : periodoPorDefecto(anioEnCurso);
}

// ── URL ──────────────────────────────────────────────────────────────────────
// `2026` · `u6` · `u12`. La misma gramática que `?mfPeriodo=` de Multifashion.

export function periodoAUrl(p: PeriodoVentas): string {
  return p.tipo === "anio" ? String(p.anio) : `u${p.n}`;
}

/** Basura → `null` (el llamador cae al default), nunca una pantalla en blanco. */
export function periodoDesdeUrl(raw: string | null | undefined): PeriodoVentas | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const ventana = /^u(6|12)$/.exec(v);
  if (ventana) return { tipo: "ultimos", n: Number(ventana[1]) as VentanaN };
  const anio = /^(\d{4})$/.exec(v);
  if (anio) {
    const a = Number(anio[1]);
    if (a < 2000 || a > 2100) return null;
    return { tipo: "anio", anio: a };
  }
  return null;
}

/**
 * Lo que se muestra al abrir: la URL manda; sin URL, lo que la persona eligió
 * la última vez; sin nada, el año en curso. Y en los tres casos, lo que la
 * pestaña no sepa servir cae al año en curso.
 */
export function resolverPeriodo(args: {
  url: string | null | undefined;
  memoria: string | null | undefined;
  tab: TabVentas;
  anioEnCurso: number;
  cap: CapacidadesPeriodo;
}): PeriodoVentas {
  const pedido = periodoDesdeUrl(args.url) ?? periodoDesdeUrl(args.memoria) ?? periodoPorDefecto(args.anioEnCurso);
  return ajustarPeriodo(pedido, args.tab, args.anioEnCurso, args.cap);
}

// ── Rótulos ──────────────────────────────────────────────────────────────────

/** Lo que dice el botón: «Año 2026», «Últimos 12 meses». */
export function etiquetaPeriodo(p: PeriodoVentas): string {
  return p.tipo === "anio" ? `Año ${p.anio}` : `Últimos ${p.n} meses`;
}

/** Encabezado de la columna de compras de Clientes: dice CUÁL período suma. */
export function rotuloCompras(p: PeriodoVentas): string {
  return `Compras · ${etiquetaPeriodo(p)}`;
}

/**
 * Contra qué compara la columna de cambio. Un año, contra el anterior con su
 * número; una ventana, contra la misma ventana un año antes.
 */
export function rotuloVs(p: PeriodoVentas, anioComparativo: number): string {
  return p.tipo === "anio" ? `vs ${anioComparativo}` : "vs año anterior";
}

export interface OpcionPeriodoVentas {
  /** El mismo texto que va y viene por la URL. */
  valor: string;
  label: string;
  /** Encabezado del grupo en el desplegable («Años», «Rangos»). */
  grupo: string;
}

/**
 * Las opciones del desplegable, en el orden aprobado: primero los años (del
 * más nuevo al más viejo), después los rangos que esa pestaña sabe servir.
 */
export function opcionesPeriodo(args: {
  tab: TabVentas;
  /** Años con datos, en cualquier orden. */
  anios: readonly number[];
  anioEnCurso: number;
  cap: CapacidadesPeriodo;
}): OpcionPeriodoVentas[] {
  const anios = [...new Set([...args.anios, args.anioEnCurso])].sort((a, b) => b - a);
  const out: OpcionPeriodoVentas[] = anios.map((a) => ({
    valor: String(a),
    label: etiquetaPeriodo({ tipo: "anio", anio: a }),
    grupo: "Años",
  }));
  for (const n of ventanasDeTab(args.tab, args.cap)) {
    out.push({ valor: `u${n}`, label: etiquetaPeriodo({ tipo: "ultimos", n }), grupo: "Rangos" });
  }
  return out;
}

// ── Lo que cada pestaña le pide a su ruta ───────────────────────────────────

/** Productos: `periodo=ytd` con el año elegido, o `6m` / `12m` desde hoy. */
export function periodoParaProductos(
  p: PeriodoVentas,
  anioEnCurso: number,
): { periodo: "ytd" | "6m" | "12m"; year: number } {
  if (p.tipo === "anio") return { periodo: "ytd", year: p.anio };
  return { periodo: p.n === 6 ? "6m" : "12m", year: anioEnCurso };
}

/** Clientes: la ventana que se pide (`null` = el año). */
export function ventanaParaClientes(p: PeriodoVentas): VentanaN | null {
  return p.tipo === "ultimos" ? p.n : null;
}
