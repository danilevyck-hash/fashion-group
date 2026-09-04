// ─────────────────────────────────────────────────────────────────────────────
// EL AÑO ANTERIOR, RECORTADO A LOS MISMOS DÍAS — una sola lectura para las
// tres pantallas que lo necesitan.
//
// `ventas_dashboard_prev_same_period_v4(p_year)` devuelve, por empresa × mes, el
// año anterior con el mes en curso CORTADO en el mismo día que este año (día de
// Panamá, último día cargado, topado en hoy — la definición única de
// `clientes-corte-comparativo.ts`, en SQL). Los meses ya cerrados van enteros.
//
// La usan:
//   · Ventas › Resumen (KPI y matriz)          — `fetchVentasResumen`
//   · Ventas › Resumen › Anual (Δ del año)     — `/api/ventas/resumen-anual`
//   · Vista General › tarjeta Ventas (YoY)     — `/api/dashboard/vista-general`
//
// 🩸 Hasta el 3-sep-2026 solo la primera la usaba; las otras dos sumaban el mes
// ENTERO del año pasado desde la MV: el Anual decía −7,0% para un grupo que
// crecía +2,5%, y Vista General −93,5% para Boston, que iba +2,2%.
//
// Cadena de versiones (las DDL las corre Daniel a mano, el deploy no exige
// orden): `_v4` (costo del año anterior con notas de débito, nunca desde
// `switch_costo_diario`) → `_v3` (corte en Panamá) → `_v2` (corte en UTC, misma
// matemática) → `_v1` (sin acotar, lenta). Un error TRANSITORIO no cae a la anterior: sería
// repetir la misma consulta más lenta (`rpcConFallbackDeVersion`).
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { withDbRetry, type SupabaseLikeResult } from "@/lib/supabase-retry";
import { rpcConFallbackDeVersion } from "@/lib/ventas/rpc-version";

export interface PrevSamePeriodRow {
  empresa: string;
  mes: number;
  total_subtotal: number | string;
  total_costo: number | string;
  total_utilidad: number | string;
  total_facturado: number | string;
  filas: number;
}

export interface PrevSamePeriodPayload {
  rows: PrevSamePeriodRow[];
  /** El año pedido es el que corre y su mes en curso tiene ventas cargadas. */
  es_periodo_parcial: boolean;
  /** Último día cargado del mes en curso (día de Panamá), o null. */
  fecha_corte: string | null;
  /** Hasta dónde se sumó el mes en curso del año anterior, o null. */
  dia_corte_anio_anterior: string | null;
}

// 🩸 `_v4` (3-sep-2026): el CTE `dia_costo` del año anterior leía
// `switch_costo_diario`, cuyo último día de cada mes vale $0 para siempre. Hoy
// devolvía vacío (esa tabla arranca 2026-05 y el año anterior es 2025), pero
// el 1-ene-2027 despertaba y corría el «costo vs año anterior». Ahora lee la
// misma fuente que el resto del Resumen (artículo diario + ND de utilidad).
// Migración `20260915120000`; cae a `_v3` → `_v2` → `_v1` mientras no corra.
export const RPC_PREV_SAME_PERIOD = "ventas_dashboard_prev_same_period_v4";

export const PREV_SAME_PERIOD_VACIO: PrevSamePeriodPayload = {
  rows: [],
  es_periodo_parcial: false,
  fecha_corte: null,
  dia_corte_anio_anterior: null,
};

/** La lectura, con reintento de caché fría y la cadena de versiones. */
export function leerPrevSamePeriod(year: number): Promise<SupabaseLikeResult<PrevSamePeriodPayload>> {
  const llamar = (fn: string) =>
    withDbRetry(
      () => supabaseServer.rpc(fn, { p_year: year }) as PromiseLike<SupabaseLikeResult<PrevSamePeriodPayload>>,
      { label: fn },
    );
  return rpcConFallbackDeVersion<PrevSamePeriodPayload>(
    () => llamar(RPC_PREV_SAME_PERIOD),
    () =>
      rpcConFallbackDeVersion<PrevSamePeriodPayload>(
        () => llamar("ventas_dashboard_prev_same_period_v3"),
        () =>
          rpcConFallbackDeVersion<PrevSamePeriodPayload>(
            () => llamar("ventas_dashboard_prev_same_period_v2"),
            () => llamar("ventas_dashboard_prev_same_period"),
            { label: "ventas_dashboard_prev_same_period_v2" },
          ),
        { label: "ventas_dashboard_prev_same_period_v3" },
      ),
    { label: RPC_PREV_SAME_PERIOD },
  );
}

/** Suma por empresa de las filas del año anterior recortado: `Map<empresa, {ventas, costo, utilidad}>`. */
export function sumarPrevPorEmpresa(rows: readonly PrevSamePeriodRow[]): Map<string, { ventas: number; costo: number; utilidad: number }> {
  const num = (v: number | string | null | undefined) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
  const out = new Map<string, { ventas: number; costo: number; utilidad: number }>();
  for (const r of rows) {
    const acc = out.get(r.empresa) ?? { ventas: 0, costo: 0, utilidad: 0 };
    out.set(r.empresa, {
      ventas: acc.ventas + num(r.total_subtotal),
      costo: acc.costo + num(r.total_costo),
      utilidad: acc.utilidad + num(r.total_utilidad),
    });
  }
  return out;
}
