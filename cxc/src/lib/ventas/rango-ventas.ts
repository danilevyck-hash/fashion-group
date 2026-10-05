// «Rango de fechas» en Ventas › Resumen y Clientes (Daniel, 5-oct-2026).
// Las mismas reglas que la consulta por fechas de Comisiones: fechas de Panamá,
// sin futuro, hasta dos años de largo; se compara contra los MISMOS días del
// año pasado (`mismosDiasAnioPasado`). `switch_facturas` tiene datos desde 2022.

import { hoyPanama } from "@/lib/fecha-panama";
import { MAX_DIAS_RANGO, diasDelRango, esFechaIso } from "@/lib/comisiones/vendedores-rango";
import { variacionPct } from "@/lib/variacion";
import { fmtPorcentaje } from "@/lib/ventas/format";
import { cambioDeLaTira, cifraDeLaTira } from "@/lib/ventas/celular";

export const PRIMER_DIA_VENTAS = "2022-01-01";

/** El rango pedido, o `null` si no sirve (al revés, futuro, más de 2 años, antes de 2022). */
export function rangoValido(
  desde: string | null | undefined,
  hasta: string | null | undefined,
  hoy: string = hoyPanama(),
): { desde: string; hasta: string } | null {
  if (!esFechaIso(desde) || !esFechaIso(hasta) || desde > hasta || hasta > hoy) return null;
  if (desde < PRIMER_DIA_VENTAS || diasDelRango(desde, hasta) > MAX_DIAS_RANGO) return null;
  return { desde, hasta };
}

// ── Ventas › Resumen por rango (PURO) ────────────────────────────────────────

export interface FilaResumenRango {
  empresa_key: string;
  venta: number;
  ventaPrevio: number;
  /** Hasta el último día CON COSTO (la venta del rango sigue siendo la de hoy). `null` sin costo. */
  utilidad: number | null;
  utilidadPrevio: number | null;
  /** utilidad ÷ la venta de los mismos días con costo. */
  margen: number | null;
  margenPrevio: number | null;
}

export interface ResumenRango {
  desde: string;
  hasta: string;
  anterior: { desde: string; hasta: string };
  /** Último día con costo dentro del rango (`null` = ninguno). */
  corteCosto: string | null;
  filas: FilaResumenRango[];
  total: FilaResumenRango;
}

/** Un movimiento del día ya firmado: venta (NC resta) o costo (NC resta, sin el código ND). */
export interface MontoDia { empresa_key: string; dia: string; monto: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Suma por empresa con la regla del margen del mes en curso: la venta va hasta
 * `hasta`; utilidad y margen, solo hasta el último día con costo.
 */
export function armarResumenRango(args: {
  desde: string; hasta: string; anterior: { desde: string; hasta: string };
  empresas: readonly string[];
  ventas: readonly MontoDia[]; costos: readonly MontoDia[];
  ventasPrevio: readonly MontoDia[]; costosPrevio: readonly MontoDia[];
}): ResumenRango {
  const corteCosto = args.costos.reduce<string | null>((m, c) => (!m || c.dia > m ? c.dia : m), null);
  const dias = corteCosto ? Math.round((Date.parse(corteCosto) - Date.parse(args.desde)) / 86_400_000) : -1;
  const cortePrevio = corteCosto ? new Date(Date.parse(args.anterior.desde) + dias * 86_400_000).toISOString().slice(0, 10) : null;
  const suma = (xs: readonly MontoDia[], ek: string | null, tope: string | null = null) =>
    xs.reduce((s, x) => ((ek == null || x.empresa_key === ek) && (tope == null || x.dia <= tope) ? s + x.monto : s), 0);
  const fila = (ek: string | null): FilaResumenRango => {
    const venta = r2(suma(args.ventas, ek));
    const ventaPrevio = r2(suma(args.ventasPrevio, ek));
    const conCosto = corteCosto != null;
    const vC = suma(args.ventas, ek, corteCosto), vP = suma(args.ventasPrevio, ek, cortePrevio);
    const utilidad = conCosto ? r2(vC - suma(args.costos, ek, corteCosto)) : null;
    const utilidadPrevio = conCosto ? r2(vP - suma(args.costosPrevio, ek, cortePrevio)) : null;
    return {
      empresa_key: ek ?? "total",
      venta, ventaPrevio, utilidad, utilidadPrevio,
      margen: utilidad != null && vC > 0 ? utilidad / vC : null,
      margenPrevio: utilidadPrevio != null && vP > 0 ? utilidadPrevio / vP : null,
    };
  };
  return {
    desde: args.desde, hasta: args.hasta, anterior: args.anterior, corteCosto,
    filas: args.empresas.map(fila).filter(f => f.venta !== 0 || f.ventaPrevio !== 0),
    total: fila(null),
  };
}

/** Los números grandes del rango, con la MISMA forma que `numerosDelResumen`. */
export function numerosDelRango(t: FilaResumenRango): { rotulo: string; valor: string; cambio: string | null; signo: number | null }[] {
  const dV = variacionPct(t.venta, t.ventaPrevio);
  const dU = variacionPct(t.utilidad, t.utilidadPrevio);
  const puntos = t.margen != null && t.margenPrevio != null ? (t.margen - t.margenPrevio) * 100 : null;
  return [
    { rotulo: "Ventas", valor: cifraDeLaTira(t.venta), cambio: cambioDeLaTira(dV), signo: dV },
    { rotulo: "Utilidad", valor: cifraDeLaTira(t.utilidad), cambio: cambioDeLaTira(dU), signo: dU },
    {
      rotulo: "Margen", valor: fmtPorcentaje(t.margen),
      cambio: puntos == null ? null : `${puntos >= 0 ? "▲ +" : "▼ −"}${Math.abs(puntos).toFixed(1)}`,
      signo: puntos,
    },
  ];
}
