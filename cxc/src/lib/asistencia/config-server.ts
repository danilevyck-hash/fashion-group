/* ─────────────────────────────────────────────────────────────────────────────
 * Leer la configuración de asistencia SIN ASUMIR QUE LA MIGRACIÓN YA CORRIÓ.
 *
 * 🩸 En este proyecto los DDL los corre Daniel a mano, y varios se quedaron
 * "PENDIENTES" durante semanas (hay media docena anotados así en CLAUDE.md). Si
 * la pantalla de Configuración se cayera hasta que alguien corra el SQL, el
 * síntoma sería "Asistencia está rota" — nadie deduce de un 500 que falta un
 * `CREATE TABLE`. Por eso acá se DEGRADA con un aviso concreto: se muestra el
 * nombre del archivo que hay que correr.
 *
 * Es el mismo criterio de `catalogo/cols-opcionales.ts`, un escalón más arriba:
 * allá falta una columna, acá falta la tabla entera.
 *
 * ⚠️ Igual que allá, la degradación solo ocurre cuando el error NOMBRA la tabla
 * (o trae el código de Postgres/PostgREST de "no existe"). Tragarse cualquier
 * error convertiría un problema real —permisos, red, RLS— en una pantalla que
 * miente diciendo "falta la migración".
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import {
  reglasDesdeFila,
  REGLAS_DEFAULT,
  esTablaFaltante,
  TABLA_PERSONAS,
  TABLA_REGLAS,
  type ReglasAsistencia,
} from "./config";

// Se re-exportan para que las rutas importen todo de un solo lugar. La
// DETECCIÓN es pura y vive en `config.ts`; acá solo está el I/O.
export {
  esTablaFaltante,
  avisoMigracion,
  MIGRACION_CONFIGURACION,
  TABLA_PERSONAS,
  TABLA_REGLAS,
} from "./config";

export interface ReglasLeidas {
  reglas: ReglasAsistencia;
  /** `true` = la tabla no existe todavía; se están usando los valores por defecto. */
  faltaMigracion: boolean;
}

/**
 * Las reglas del cálculo. Sin la migración corrida devuelve los valores por
 * defecto (que son los que confirmó la contable), así que el reporte sigue
 * saliendo igual que antes en vez de romperse.
 */
export async function leerReglas(): Promise<ReglasLeidas> {
  const { data, error } = await supabaseServer
    .from(TABLA_REGLAS)
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    if (esTablaFaltante(error, TABLA_REGLAS)) {
      return { reglas: { ...REGLAS_DEFAULT }, faltaMigracion: true };
    }
    throw new Error(error.message);
  }
  // Sin fila (tabla recién creada y el INSERT no corrió) tampoco es un error:
  // los defaults del código son los mismos que los de la tabla.
  return { reglas: reglasDesdeFila(data as Record<string, unknown> | null), faltaMigracion: false };
}

export interface FilaPersonaDb {
  empleado_codigo: string;
  nombre: string | null;
  salario_mensual: number | string | null;
  jornada_semanal: number | null;
  empresa: string | null;
}

export interface PersonasLeidas {
  filas: FilaPersonaDb[];
  faltaMigracion: boolean;
}

/** Las fichas guardadas. Sin la migración corrida devuelve la lista vacía. */
export async function leerPersonas(): Promise<PersonasLeidas> {
  const { data, error } = await supabaseServer
    .from(TABLA_PERSONAS)
    .select("empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa");

  if (error) {
    if (esTablaFaltante(error, TABLA_PERSONAS)) return { filas: [], faltaMigracion: true };
    throw new Error(error.message);
  }
  return { filas: (data ?? []) as FilaPersonaDb[], faltaMigracion: false };
}
