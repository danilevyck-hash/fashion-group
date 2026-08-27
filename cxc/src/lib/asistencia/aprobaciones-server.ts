/* ─────────────────────────────────────────────────────────────────────────────
 * El I/O de las aprobaciones de horas extra. La regla vive en `aprobaciones.ts`,
 * que es puro; acá solo se junta el dato.
 *
 * 🩸 IGUAL QUE `planilla-server.ts` Y `config-server.ts`: si la migración
 * todavía no corrió, esto NO revienta. Devuelve cero aprobaciones y avisa que
 * NO SE ESTÁ EXIGIENDO ninguna — o sea, la planilla de siempre. En este
 * proyecto los DDL los corre Daniel a mano y varios se quedaron pendientes
 * semanas; que la planilla entera se caiga por eso sería cambiar un aviso por
 * un "Asistencia está rota".
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { esTablaFaltante } from "./config";
import { TABLA_APROBACIONES, type Aprobacion } from "./aprobaciones";

interface FilaAprobacionDb {
  empleado_codigo: string;
  fecha: string;
  aprobado: boolean | null;
  minutos_vistos: number | string | null;
  marcado_por: string | null;
  marcado_en: string | null;
}

function aDominio(f: FilaAprobacionDb): Aprobacion {
  return {
    codigo: String(f.empleado_codigo).trim(),
    fecha: String(f.fecha).slice(0, 10),
    aprobado: f.aprobado === true,
    minutosVistos: Number(f.minutos_vistos ?? 0) || 0,
    por: f.marcado_por ?? null,
    cuando: f.marcado_en ?? null,
  };
}

export interface AprobacionesLeidas {
  filas: Aprobacion[];
  /** `true` = la tabla todavía no existe → NO se exige aprobación, se paga todo. */
  faltaTabla: boolean;
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
    .select("empleado_codigo, fecha, aprobado, minutos_vistos, marcado_por, marcado_en")
    .gte("fecha", desde)
    .lte("fecha", hasta);

  if (error) {
    if (esTablaFaltante(error, TABLA_APROBACIONES)) {
      return { filas: [], faltaTabla: true };
    }
    throw new Error(error.message);
  }
  return { filas: (data ?? []).map((f) => aDominio(f as FilaAprobacionDb)), faltaTabla: false };
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
 * Devuelve `false` si la tabla todavía no existe, para que la pantalla avise en
 * vez de decir "aprobado" sobre algo que no se guardó.
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
  aprobado: boolean;
  por: string;
  /** Momento en ISO. Entra por parámetro: nada de `new Date()` escondido. */
  cuando: string;
}): Promise<boolean> {
  const filas = opts.dias.map((d) => ({
    empleado_codigo: String(d.codigo).trim(),
    fecha: d.fecha,
    aprobado: opts.aprobado,
    minutos_vistos: Math.max(0, Math.round(Number(d.minutos) || 0)),
    marcado_por: opts.por,
    marcado_en: opts.cuando,
  }));
  if (filas.length === 0) return true;

  const { error } = await supabaseServer
    .from(TABLA_APROBACIONES)
    .upsert(filas, { onConflict: "empleado_codigo,fecha" });

  if (error) {
    if (esTablaFaltante(error, TABLA_APROBACIONES)) return false;
    throw new Error(error.message);
  }
  return true;
}
