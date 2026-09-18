/* ─────────────────────────────────────────────────────────────────────────────
 * LOS HORARIOS — en UN solo lugar (18-sep-2026).
 *
 * 🩸 `asistencia_horarios` la leían TRES rutas con su propio `select` copiado
 * (`/reporte`, `/planilla` y `/horarios`), el patrón que en este proyecto ya
 * costó dos bugs caros: el día que una gana una columna y las otras no, el
 * mismo horario vale distinto según por dónde se lo mire. Con las tres
 * columnas nuevas (días laborables y el horario de afuera) eso sería la
 * diferencia entre «el sábado es ausencia» en la planilla y «no lo es» en el
 * Reporte. Acá hay UNA lectura y las tres rutas la llaman.
 *
 * 🔴 FALLA ABIERTA: con la migración `MIGRACION_HORARIO_CONFIGURABLE` sin
 * correr, el `select` con las columnas nuevas falla nombrándolas; se vuelve a
 * leer SOLO lo de siempre y se avisa (`faltaMigracion`). Un error que no
 * nombre esas columnas sí se propaga: una planilla armada con «nadie tiene
 * horario» porque un timeout devolvió otro código es plata mal pagada.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import type { HorarioPersona } from "./reporte";
import {
  COLUMNA_DIAS_LABORABLES,
  COLUMNA_ENTRADA_AFUERA,
  COLUMNA_SALIDA_AFUERA,
  esColumnaHorarioFaltante,
  limpiaHora,
  normalizarDiasLaborables,
} from "./horario-configurable";

export const TABLA_HORARIOS = "asistencia_horarios";

const COLS_BASE = "empleado_codigo, empleado_nombre, entrada, salida, almuerzo_minutos";
const COLS_CON_CONFIGURABLE =
  `${COLS_BASE}, ${COLUMNA_DIAS_LABORABLES}, ${COLUMNA_ENTRADA_AFUERA}, ${COLUMNA_SALIDA_AFUERA}`;

/** Una fila leída, ya en la forma que entiende el motor ("HH:MM"). */
export interface HorarioLeido extends HorarioPersona {
  empleado_nombre: string | null;
  /** Los días que la persona tiene escritos; `null` = manda la empresa. */
  dias_laborables: number[] | null;
  entrada_afuera: string | null;
  salida_afuera: string | null;
}

export interface HorariosLeidos {
  horarios: HorarioLeido[];
  /** `true` = las columnas nuevas no existen todavía: días y horario de afuera
   *  vienen vacíos y todo se comporta como siempre. */
  faltaMigracion: boolean;
}

interface FilaCruda {
  empleado_codigo: unknown;
  empleado_nombre?: unknown;
  entrada: unknown;
  salida: unknown;
  almuerzo_minutos?: unknown;
  dias_laborables?: unknown;
  entrada_afuera?: unknown;
  salida_afuera?: unknown;
}

function aHorario(f: FilaCruda): HorarioLeido {
  return {
    empleado_codigo: String(f.empleado_codigo ?? "").trim(),
    empleado_nombre: typeof f.empleado_nombre === "string" ? f.empleado_nombre : null,
    // Postgres devuelve `time` como "08:00:00"; el motor compara "HH:MM".
    entrada: String(f.entrada ?? "").slice(0, 5),
    salida: String(f.salida ?? "").slice(0, 5),
    almuerzo_minutos: Number(f.almuerzo_minutos ?? 30),
    dias_laborables: normalizarDiasLaborables(f.dias_laborables),
    entrada_afuera: limpiaHora(f.entrada_afuera),
    salida_afuera: limpiaHora(f.salida_afuera),
  };
}

/** TODOS los horarios guardados. Ver el encabezado. */
export async function leerHorarios(): Promise<HorariosLeidos> {
  const conNuevas = await supabaseServer.from(TABLA_HORARIOS).select(COLS_CON_CONFIGURABLE);
  if (!conNuevas.error) {
    return {
      horarios: ((conNuevas.data ?? []) as unknown as FilaCruda[]).map(aHorario),
      faltaMigracion: false,
    };
  }
  if (!esColumnaHorarioFaltante(conNuevas.error)) {
    throw new Error(`No se pudieron leer los horarios: ${conNuevas.error.message}`);
  }
  const base = await supabaseServer.from(TABLA_HORARIOS).select(COLS_BASE);
  if (base.error) throw new Error(`No se pudieron leer los horarios: ${base.error.message}`);
  return {
    horarios: ((base.data ?? []) as unknown as FilaCruda[]).map(aHorario),
    faltaMigracion: true,
  };
}
