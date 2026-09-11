/* ─────────────────────────────────────────────────────────────────────────────
 * El I/O de las aprobaciones de horas extra. La regla vive en `aprobaciones.ts`,
 * que es puro; acá solo se junta el dato.
 *
 * Historia (ago-2026): IGUAL QUE `planilla-server.ts` Y `config-server.ts`, si
 * la migración todavía no había corrido esto NO reventaba: devolvía cero
 * aprobaciones con `faltaTabla: true`, y con eso la planilla NO EXIGÍA
 * aprobación — pagaba todas las extras que midió el reloj, como antes. En este
 * proyecto los DDL los corre Daniel a mano y varios se quedaron pendientes
 * semanas.
 *
 * 🔴 TOLERANCIA RETIRADA EL 3-SEP-2026: la tabla existe desde
 * 20260829120000_asistencia_horas_extra_aprobadas.sql (verificado por PostgREST
 * en producción). Degradar hoy sería lo peor que puede pasar acá: un permiso o
 * un timeout que devuelva el mismo código soltaría el candado de la contadora
 * (*«Sólo se pagan las horas extras autorizadas»*) y se pagarían TODAS las
 * extras sin que nadie las apruebe, con la pantalla tranquila. El error se
 * propaga y la planilla no sale.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { TABLA_APROBACIONES, decisionDeToque, type Aprobacion, type Decision } from "./aprobaciones";

interface FilaAprobacionDb {
  empleado_codigo: string;
  fecha: string;
  aprobado: boolean | null;
  /** 'si' | 'no' | null (20261105120000). `null` = pendiente. */
  decision?: string | null;
  minutos_vistos: number | string | null;
  marcado_por: string | null;
  marcado_en: string | null;
}

function aDominio(f: FilaAprobacionDb): Aprobacion {
  // 🔴 La decisión manda; `aprobado` se deriva de ella. Una fila vieja sin
  // decisión (no debería haber: el backfill puso 'si' a todo lo aprobado) se
  // lee por `aprobado`, que es lo que siempre significó.
  const decision: Decision =
    f.decision === "si" || f.decision === "no" ? f.decision : f.aprobado === true ? "si" : null;
  return {
    codigo: String(f.empleado_codigo).trim(),
    fecha: String(f.fecha).slice(0, 10),
    aprobado: decision === "si",
    decision,
    minutosVistos: Number(f.minutos_vistos ?? 0) || 0,
    por: f.marcado_por ?? null,
    cuando: f.marcado_en ?? null,
  };
}

export interface AprobacionesLeidas {
  filas: Aprobacion[];
}

/**
 * Las aprobaciones de UN período EXACTO.
 *
 * 🔑 Se filtra por las dos fechas, no por un solape. Una aprobación es de ese
 * período y de ninguno otro: si mañana el período de horas extra se corre (la
 * contadora usa del 13 al 27, no del 16 al 31), el rango nuevo se pregunta de
 * cero en vez de heredar un permiso que nadie dio sobre esos días.
 */
export async function leerAprobaciones(
  desde: string,
  hasta: string,
): Promise<AprobacionesLeidas> {
  const { data, error } = await supabaseServer
    .from(TABLA_APROBACIONES)
    // Select EXPLÍCITO, nunca `*`: si mañana la tabla gana una columna, esta
    // consulta sigue trayendo lo mismo.
    .select("empleado_codigo, fecha, aprobado, decision, minutos_vistos, marcado_por, marcado_en")
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (error) {
    // 🔴 Nada de «cero filas» ante un error: eso soltaría el candado de las
    // horas extra (ver el encabezado).
    throw new Error(`No se pudieron leer las aprobaciones de horas extra: ${error.message}`);
  }
  return { filas: (data ?? []).map((f) => aDominio(f as FilaAprobacionDb)) };
}

/**
 * Aprueba (o desaprueba) las horas extra de una o varias personas en UN período.
 *
 * 🔴 QUEDA REGISTRO DE QUIÉN Y CUÁNDO — lo pidió Daniel explícitamente. La fila
 * NUNCA se borra al desaprobar: se pone `aprobado = false` y se reescribe quién
 * lo tocó. Un DELETE dejaría el mismo estado que «nadie lo miró nunca», y son
 * dos cosas distintas.
 *
 * ⚠️ `minutos_vistos` es el TESTIGO: cuántos minutos había medidos en el
 * momento de tocar el botón. No se paga con él. Sirve para que la pantalla
 * pueda decir «aprobaste 5,50 h y hoy son 6,20 h» el día que se corrija una
 * marcación o cambie la base de cálculo.
 *
 * Devuelve `true` cuando escribió. Historia: devolvía `false` si la tabla
 * todavía no existía, para que la pantalla avisara en vez de decir "aprobado"
 * sobre algo que no se guardó. Tolerancia retirada el 3-sep-2026 (la tabla
 * existe desde 20260829120000): hoy cualquier error se propaga. El `boolean`
 * se conserva porque `aprobaciones/route.ts` (otra tanda) lo lee; ya solo
 * vale `true`.
 */
export interface DiaAAprobar {
  codigo: string;
  /** YYYY-MM-DD */
  fecha: string;
  /** Minutos medidos AHORA. Es el TESTIGO, no el pago. */
  minutos: number;
}

export async function guardarAprobaciones(opts: {
  dias: readonly DiaAAprobar[];
  /**
   * 🔴 Sí · No · pendiente (10-sep-2026). `aprobado` se escribe DERIVADO
   * (`decision === 'si'`), así el motor de planilla paga exactamente como hoy.
   * Un booleano sigue valiendo: `true` = 'si', `false` = pendiente (lo que la
   * casilla vieja significaba).
   */
  decision?: Decision | boolean;
  /** El nombre viejo del mismo dato. `true` = 'si', `false` = pendiente. */
  aprobado?: boolean;
  por: string;
  /** Momento en ISO. Entra por parámetro: nada de `new Date()` escondido. */
  cuando: string;
}): Promise<boolean> {
  const decision = decisionDeToque(opts.decision ?? opts.aprobado ?? null);
  const filas = opts.dias.map((d) => ({
    empleado_codigo: String(d.codigo).trim(),
    fecha: d.fecha,
    aprobado: decision === "si",
    decision,
    minutos_vistos: Math.max(0, Math.round(Number(d.minutos) || 0)),
    marcado_por: opts.por,
    marcado_en: opts.cuando,
  }));
  if (filas.length === 0) return true;

  const { error } = await supabaseServer
    .from(TABLA_APROBACIONES)
    .upsert(filas, { onConflict: "empleado_codigo,fecha" });

  if (error) {
    throw new Error(`No se pudieron guardar las aprobaciones de horas extra: ${error.message}`);
  }
  return true;
}
