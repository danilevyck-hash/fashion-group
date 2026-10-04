// ─────────────────────────────────────────────────────────────────────────────
// VENTAS › RESUMEN EN EL CELULAR: VER UN MES (2-oct-2026).
// (módulo PURO: sin React, sin fetch)
//
// Daniel, 2-oct-2026: «aquí sería bueno ver un mes específico».
//
// El selector de Comisiones (‹ 2026 › · Todo el año · 12 meses) reemplaza al
// «Año 2026 ▾» del Resumen en el celular, y la tabla queda en UNA columna de
// período: Empresa · Ventas · % contra el mismo período del año pasado.
//
// 🔴 NO HAY UNA FUENTE NUEVA. Todo sale de los 12 meses que el Resumen ya trae
// por empresa (`ventas2026`, `ventas2025`, `utilidad2026`…):
//   · `ventas2025` ya viene recortada a los MISMOS DÍAS en el mes en curso
//     (`ventas_dashboard_prev_same_period_v4`), así que el mes en curso y el
//     año en curso comparan igual que hoy.
//   · «Todo el año» usa `data.kpis` tal cual: ese número no cambia.
//   · El margen de UN mes repite el filtro del servidor (`sumFiltered` en
//     `queries.ts`): se excluye la empresa-mes sin costo (venta − utilidad = 0).
//
// Interruptor `RESUMEN_MES_2026_10`: `false` = el «Año 2026 ▾» y la tabla de
// dos columnas de siempre. 🔴 PRENDIDO el 4-oct-2026: Daniel aprobó el mockup
// («sigue»). Cerrado dice «Año 2026» o «Septiembre 2026»; el panel mide lo que
// el botón, y la nota de mayoreo (que es del año) sale solo con «Todo el año».
// ─────────────────────────────────────────────────────────────────────────────

import type { EmpresaMonthlySales, VentasResumen } from "@/components/ventas/types";
import { MESES_LARGOS } from "@/lib/comisiones/periodo";
import { variacionPct } from "@/lib/variacion";
import { fmtPorcentaje } from "@/lib/ventas/format";
import { cambioDeLaTira, cifraDeLaTira } from "@/lib/ventas/celular";

export const RESUMEN_MES_2026_10 = true;

/** Lo que dice el selector cerrado: «Año 2026» o «Septiembre 2026». */
export function rotuloDelPeriodo(anio: number, m: MesDelResumen): string {
  return m > 0 ? `${MESES_LARGOS[m - 1]} ${anio}` : `Año ${anio}`;
}

/** 0 = todo el año (igual que `MES_TODO_EL_ANIO` de Comisiones), 1..12 = un mes. */
export type MesDelResumen = number;

/** El mes de la URL, ya válido: basura o un mes que no empezó → todo el año. */
export function mesValido(raw: string | null | undefined, mesActual: number, esAnioEnCurso: boolean): MesDelResumen {
  const m = Number(raw);
  if (!Number.isInteger(m) || m < 1 || m > 12) return 0;
  if (esAnioEnCurso && m > mesActual) return 0;
  return m;
}

/** La cifra de un período: el mes `m`, o la suma de los doce si `m` es 0. */
export function delPeriodo(serie: (number | null)[], m: MesDelResumen): number {
  if (m > 0) return serie[m - 1] ?? 0;
  return serie.reduce<number>((s, v) => s + (v ?? 0), 0);
}

export interface CifrasDelMes {
  ventas: number;
  ventasPrevio: number;
  utilidad: number;
  utilidadPrevio: number;
  margen: number;
  margenPrevio: number;
}

/** Las cifras de arriba para UN mes (1..12), sumando las empresas. */
export function cifrasDelMes(empresas: EmpresaMonthlySales[], m: number): CifrasDelMes {
  const i = m - 1;
  let ventas = 0, ventasPrevio = 0, utilidad = 0, utilidadPrevio = 0;
  let uM = 0, vM = 0, uMp = 0, vMp = 0;
  for (const e of empresas) {
    const v = e.ventas2026[i] ?? 0, u = e.utilidad2026[i] ?? 0, vb = e.ventasParaMargen[i] ?? v;
    const vp = e.ventas2025[i] ?? 0, up = e.utilidad2025[i] ?? 0;
    ventas += v; utilidad += u; ventasPrevio += vp; utilidadPrevio += up;
    // Mismo filtro que el servidor: una empresa-mes sin costo no entra al margen.
    if (vb - u > 0) { uM += u; vM += vb; }
    if (vp - up > 0) { uMp += up; vMp += vp; }
  }
  return {
    ventas, ventasPrevio, utilidad, utilidadPrevio,
    margen: vM > 0 ? uM / vM : 0,
    margenPrevio: vMp > 0 ? uMp / vMp : 0,
  };
}

/** Un número de la tira de arriba, ya escrito (lo dibuja `TiraDeCuatro` o el número grande). */
export interface NumeroDelResumen {
  rotulo: string;
  valor: string;
  cambio: string | null;
  signo: number | null;
}

/**
 * Ventas · Utilidad · Margen (· Proyección, solo con «Todo el año» del año en
 * curso) del período. La MISMA cuenta que hacía la tira del celular: se movió
 * aquí para que la computadora (`VENTAS_APPLE_2026_10`) diga las mismas cifras.
 */
export function numerosDelResumen(data: VentasResumen, m: MesDelResumen, isClosedYear: boolean): NumeroDelResumen[] {
  const k = data.kpis;
  const proy = m === 0 && !isClosedYear && data.proyeccion ? data.proyeccion : null;
  const c =
    m > 0
      ? cifrasDelMes(data.empresas, m)
      : {
          ventas: k.ventasNetasYTD, ventasPrevio: k.ventas2025YTD,
          utilidad: k.utilidadYTD, utilidadPrevio: k.utilidad2025YTD,
          margen: k.margenYTD, margenPrevio: k.margen2025YTD,
        };
  const dVentas = variacionPct(c.ventas, c.ventasPrevio);
  const dUtilidad = variacionPct(c.utilidad, c.utilidadPrevio);
  const puntos = (c.margen - c.margenPrevio) * 100;
  const salida: NumeroDelResumen[] = [
    { rotulo: "Ventas", valor: cifraDeLaTira(c.ventas), cambio: cambioDeLaTira(dVentas), signo: dVentas },
    { rotulo: "Utilidad", valor: cifraDeLaTira(c.utilidad), cambio: cambioDeLaTira(dUtilidad), signo: dUtilidad },
    {
      rotulo: "Margen",
      valor: fmtPorcentaje(c.margen),
      cambio: `${puntos >= 0 ? "▲ +" : "▼ −"}${Math.abs(puntos).toFixed(1)}`,
      signo: puntos,
    },
  ];
  if (proy) {
    const delta = proy.totales_grupo.delta_vs_anio_anterior_total ?? null;
    salida.push({
      rotulo: "Proyección",
      valor: cifraDeLaTira(proy.totales_grupo.proyeccion_cierre),
      cambio: delta == null ? null : `${delta >= 0 ? "+" : "−"}${cifraDeLaTira(Math.abs(delta))}`,
      signo: delta,
    });
  }
  return salida;
}
