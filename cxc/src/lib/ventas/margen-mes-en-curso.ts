// ─────────────────────────────────────────────────────────────────────────────
// EL MARGEN DEL MES EN CURSO DEJA DE MEZCLAR (11-sep-2026).
// (módulo PURO: recibe las series y el corte, devuelve las series corregidas)
//
// 🩸 QUÉ PASABA. La RPC del Resumen arma el mes en curso con la VENTA hasta el
// instante (`switch_facturas`, que se lee cuatro veces al día) y el COSTO de
// `switch_articulo_diario`, que el cron llena a las 3:40 a.m. y llega hasta
// AYER. Utilidad = venta de hoy − costo de ayer, y el margen sale inflado:
//
//   · Vistana, medido el 11-sep-2026 al mediodía: venta $60.956,10 hasta hoy,
//     costo $43.548,58 hasta el 10 → la pantalla decía **28,6 %**; con el mismo
//     corte en los dos ($56.418,00 de venta hasta el 10) es **22,8 %**.
//   · El grupo: 32,1 % contra 29,8 %.
//   · Y el día 1 de cada mes es peor: el 1-sep el grupo vendió $13.169,38 sin
//     un dólar de costo cargado y el Resumen mostró margen **100 %**.
//
// Daniel eligió *«correcto y un día viejo»*: la utilidad y el margen del mes en
// curso se calculan hasta el ÚLTIMO DÍA CON COSTO, y la pantalla lo dice
// («al 10 de septiembre»). La VENTA del mes sigue siendo la de hoy: lo único
// que se corta es lo que necesita costo para existir.
//
// 🔴 NINGÚN TOTAL DE VENTA SE MUEVE. Se toca la serie de UTILIDAD del mes en
// curso y la base con la que se divide el margen; `ventas2026` sale intacta.
//
// El corte lo trae la RPC `ventas_mes_en_curso_corte_costo` (migración
// `20261120120000`): por empresa, `costo_hasta` (MAX(fecha) del costo cargado
// en el mes) y `subtotal_hasta_costo` (la venta hasta ese día, con la MISMA
// fórmula firmada de la RPC del resumen). Mientras esa DDL no corra, `corte`
// llega vacío y todo se comporta como hoy.
// ─────────────────────────────────────────────────────────────────────────────

import type { MonthlySeries } from "@/components/ventas/types";

export interface CorteCostoEmpresa {
  /** YYYY-MM-DD del último día con costo cargado en el mes. null = ninguno. */
  costoHasta: string | null;
  /** Venta neta del mes hasta ese día. */
  ventasHastaCosto: number;
}

/** El corte por empresa (`empresa_key`), tal como llega de la RPC. */
export type CorteCosto = Record<string, CorteCostoEmpresa>;

export interface SeriesCorregidas {
  /** Utilidad con el mes en curso = venta hasta el corte − costo. */
  utilidad: MonthlySeries;
  /** La venta con la que se divide el margen: igual a `ventas` salvo en el mes
   *  en curso, donde es la venta hasta el corte. */
  ventasParaMargen: MonthlySeries;
}

/**
 * Aplica el corte al mes en curso. `mesEnCurso` es 1-indexed; 0 (año cerrado)
 * o sin corte para esa empresa → las series salen tal cual.
 *
 * Sin ningún día con costo (el día 1 antes del cron), la utilidad del mes va
 * en `null` y la base del margen en 0: la celda dice «—» en vez de inventar un
 * 100 %.
 */
export function aplicarCorteCosto(
  ventas: MonthlySeries,
  utilidad: MonthlySeries,
  costo: MonthlySeries,
  mesEnCurso: number,
  corte: CorteCostoEmpresa | undefined,
): SeriesCorregidas {
  const i = mesEnCurso - 1;
  if (!corte || i < 0 || i >= 12 || ventas[i] == null) {
    return { utilidad: [...utilidad], ventasParaMargen: [...ventas] };
  }
  const u = [...utilidad];
  const v = [...ventas];
  if (corte.costoHasta == null) {
    u[i] = null;
    v[i] = 0;
    return { utilidad: u, ventasParaMargen: v };
  }
  const c = costo[i] ?? 0;
  u[i] = corte.ventasHastaCosto - c;
  v[i] = corte.ventasHastaCosto;
  return { utilidad: u, ventasParaMargen: v };
}

/** «al 10 de septiembre» — el día hasta el que vale el margen del mes. */
export function textoCorteCosto(costoHasta: string | null): string | null {
  if (!costoHasta) return null;
  const [, m, d] = costoHasta.split("-").map(Number);
  if (!m || !d) return null;
  return `al ${d} de ${MESES_LARGOS[m - 1]}`;
}

/**
 * La frase del pie de la matriz: «Utilidad y margen de septiembre al 10 de
 * septiembre, el último día con costo cargado». null sin corte.
 */
export function pieCorteCosto(costoHasta: string | null): string | null {
  const al = textoCorteCosto(costoHasta);
  if (!al || !costoHasta) return null;
  const mes = Number(costoHasta.split("-")[1]);
  return `Utilidad y margen de ${MESES_LARGOS[mes - 1]} ${al}, el último día con costo cargado`;
}

/** El corte del GRUPO para el pie: el más nuevo entre las empresas con corte. */
export function corteMasNuevo(corte: CorteCosto): string | null {
  let max: string | null = null;
  for (const c of Object.values(corte)) {
    if (c.costoHasta && (!max || c.costoHasta > max)) max = c.costoHasta;
  }
  return max;
}

const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
