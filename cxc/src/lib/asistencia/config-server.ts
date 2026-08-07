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
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  reglasDesdeFila,
  REGLAS_DEFAULT,
  esTablaFaltante,
  TABLA_PERSONAS,
  TABLA_REGLAS,
  type ReglasAsistencia,
} from "./config";
import {
  crearDirectorio,
  armarPersonas,
  type Directorio,
  type PersonaListada,
} from "./directorio";

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

// ─────────────────────────────────────────────────────────────────────────────
// EL DIRECTORIO — código del reloj → nombre, en UN solo lugar.
//
// 🩸 El reloj manda códigos pelados: `empleado_nombre` viene vacío en las 3.287
// marcaciones cargadas. Los nombres viven en `asistencia_personas` y NADA MÁS
// que estas dos funciones los leen. Cuatro pantallas repitiendo la misma
// consulta es el patrón que en este proyecto ya costó dos bugs caros (las
// empresas de Switch en tres archivos, los roles de Asistencia en siete).
//
// La regla de respaldo —sin nombre se muestra el código— vive en `directorio.ts`
// porque es pura y se prueba sin base.
// ─────────────────────────────────────────────────────────────────────────────

export interface DirectorioLeido {
  directorio: Directorio;
  /** `true` = la migración `20260806160000` no corrió; todo cae al código. */
  faltaMigracion: boolean;
}

/** El traductor código → nombre. Sin la migración corrida devuelve uno vacío,
 *  que responde el código para cualquier persona en vez de romper la pantalla. */
export async function leerDirectorio(): Promise<DirectorioLeido> {
  const { filas, faltaMigracion } = await leerPersonas();
  return { directorio: crearDirectorio(filas), faltaMigracion };
}

/** Ventana de marcaciones para saber quién existe. Medio año cubre de sobra lo
 *  cargado (julio y agosto de 2026) sin traer la tabla entera. */
export const DIAS_VENTANA_PERSONAS = 180;

/**
 * Los códigos que marcaron en el reloj.
 *
 * ⚠️ Paginado y verificado contra el COUNT: PostgREST corta en 1.000 filas EN
 * SILENCIO y hay 3.287 marcaciones — sin paginar, los códigos de los últimos
 * días simplemente no aparecerían en ningún desplegable.
 */
export async function leerCodigosConMarcaciones(
  dias = DIAS_VENTANA_PERSONAS,
): Promise<Set<string>> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const filas = await leerTodoPaginado<{ empleado_codigo: string | null }>(
    "asistencia_marcaciones (directorio)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("asistencia_marcaciones")
        .select("empleado_codigo", pedirCount ? { count: "exact" } : {})
        .gte("ocurrio_en", desde)
        .order("ocurrio_en", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  );
  const out = new Set<string>();
  for (const f of filas) {
    const c = (f.empleado_codigo ?? "").trim();
    if (c) out.add(c);
  }
  return out;
}

export interface PersonasDelModulo {
  personas: PersonaListada[];
  directorio: Directorio;
  faltaMigracion: boolean;
}

/**
 * El universo de personas del módulo, ordenado y listo para un desplegable:
 * fichas guardadas ∪ códigos que marcaron.
 *
 * Es LA fuente de las listas de personas de Asistencia. Cada pantalla que
 * necesite "elegir una persona" llama acá y no arma su propia lista.
 */
export async function leerPersonasDelModulo(
  dias = DIAS_VENTANA_PERSONAS,
): Promise<PersonasDelModulo> {
  const [{ directorio, faltaMigracion }, codigos] = await Promise.all([
    leerDirectorio(),
    leerCodigosConMarcaciones(dias),
  ]);
  return { personas: armarPersonas(directorio, codigos), directorio, faltaMigracion };
}
