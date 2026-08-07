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
import {
  COLUMNAS_BAJAS,
  esColumnaDeBajaFaltante,
  MOTIVOS_SALIDA,
  type MotivoSalida,
  type Vigencia,
} from "./vigencia";

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
  /** Opcionales: no existen hasta que se corra `MIGRACION_BAJAS`. */
  fecha_ingreso?: string | null;
  fecha_salida?: string | null;
  motivo_salida?: string | null;
}

export interface PersonasLeidas {
  filas: FilaPersonaDb[];
  faltaMigracion: boolean;
  /** `true` = la tabla existe pero le faltan las columnas de la baja. Todas las
   *  personas se leen como activas, que es exactamente como estaban antes. */
  faltaColumnasBajas: boolean;
}

/** Lo que se pedía antes de que existieran las altas y bajas. */
const COLS_BASE = "empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa";
/** Lo que se pide ahora. Las columnas nuevas salen de `vigencia.ts` para que el
 *  `select` y la detección del error no se puedan separar.
 *
 *  ⚠️ Armado al ejecutar, así que los tipos generados de Supabase no pueden
 *  seguirlo y el resultado llega sin forma: por eso las dos lecturas de abajo
 *  castean `as unknown as FilaPersonaDb[]`. Se prefiere el cast a repetir los
 *  nombres de las columnas en dos lugares —esa es la duplicación que en este
 *  proyecto ya costó dos bugs caros. */
const COLS_CON_BAJAS = `${COLS_BASE}, ${COLUMNAS_BAJAS.join(", ")}`;

/**
 * Las fichas guardadas.
 *
 * Aguanta DOS grados de migración pendiente, y los dos pasaron de verdad en este
 * proyecto:
 *   · sin la tabla  → lista vacía y `faltaMigracion` (la pantalla nombra el SQL);
 *   · con la tabla y SIN las columnas de la baja → se relee sin ellas y todo el
 *     mundo queda activo, que es como está hoy. Una lista explícita de columnas
 *     hace que PostgREST rechace el select ENTERO: sin este reintento, Asistencia
 *     no cargaría ni una ficha hasta que alguien corriera el DDL.
 */
export async function leerPersonas(): Promise<PersonasLeidas> {
  const { data, error } = await supabaseServer.from(TABLA_PERSONAS).select(COLS_CON_BAJAS);

  if (!error) {
    return {
      filas: (data ?? []) as unknown as FilaPersonaDb[],
      faltaMigracion: false,
      faltaColumnasBajas: false,
    };
  }
  // 🔴 EL ORDEN DE ESTOS DOS `if` NO ES ESTÉTICO, Y COSTÓ UNA VERIFICACIÓN EN
  // EL NAVEGADOR (7-ago-2026). Postgres dice «column asistencia_personas.
  // fecha_ingreso does not exist»: ese texto NOMBRA la tabla y trae "does not
  // exist", así que `esTablaFaltante` lo da por bueno. Preguntando primero por
  // la tabla, faltar TRES COLUMNAS se leía como «falta la tabla entera» y la
  // pantalla escondía las 32 fichas reales detrás de un aviso equivocado —
  // medido: las 37 personas salían «sin configurar», sin nombre y sin salario.
  // Lo específico se pregunta antes que lo general.
  //
  // ⚠️ Y solo se reintenta cuando el error NOMBRA una columna de la baja: releer
  // ante cualquier error convertiría un problema real en una lectura incompleta.
  if (!esColumnaDeBajaFaltante(error)) {
    if (esTablaFaltante(error, TABLA_PERSONAS)) {
      return { filas: [], faltaMigracion: true, faltaColumnasBajas: true };
    }
    throw new Error(error.message);
  }

  const segunda = await supabaseServer.from(TABLA_PERSONAS).select(COLS_BASE);
  if (segunda.error) {
    if (esTablaFaltante(segunda.error, TABLA_PERSONAS)) {
      return { filas: [], faltaMigracion: true, faltaColumnasBajas: true };
    }
    throw new Error(segunda.error.message);
  }
  return {
    filas: (segunda.data ?? []) as FilaPersonaDb[],
    faltaMigracion: false,
    faltaColumnasBajas: true,
  };
}

/** La vigencia de una ficha leída. Sin las columnas —o con la migración sin
 *  correr— sale «activa», que es el estado real de las 32 fichas de hoy. */
export function vigenciaDeFila(f: FilaPersonaDb): Vigencia {
  const motivo = typeof f.motivo_salida === "string" ? f.motivo_salida.trim() : "";
  return {
    fechaIngreso: f.fecha_ingreso ?? null,
    fechaSalida: f.fecha_salida ?? null,
    motivoSalida: (MOTIVOS_SALIDA as readonly string[]).includes(motivo)
      ? (motivo as MotivoSalida)
      : null,
  };
}

/** código → vigencia, que es lo que necesita el filtro de la planilla. */
export function vigenciasDeFilas(filas: readonly FilaPersonaDb[]): Map<string, Vigencia> {
  return new Map(filas.map((f) => [String(f.empleado_codigo), vigenciaDeFila(f)]));
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
