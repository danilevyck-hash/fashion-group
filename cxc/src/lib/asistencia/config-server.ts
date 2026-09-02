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
  TABLA_VACACIONES,
  type ReglasAsistencia,
} from "./config";
import { TABLA_REPARTO, type FilaReparto } from "./reparto";
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
import {
  COLUMNA_SERVICIO_PROFESIONAL,
  esColumnaServicioProfesionalFaltante,
  esServicioProfesional,
} from "./participacion";
import { COLS_PERMISO_HORAS, esColumnaPermisoHorasFaltante } from "./permiso-horas";
import {
  COLS_SALDO_VACACIONES,
  esColumnaSaldoVacacionesFaltante,
  numeroDeDias,
  type DatosSaldo,
} from "./saldo-vacaciones";
import type { Justificacion } from "./reporte";
// 🔑 SOLO EL TIPO: `vacaciones.ts` es PURO y no puede importar de acá. Un
// import de valor armaría el ciclo al revés y sin necesidad.
import type { Vacacion } from "./vacaciones";
import {
  COLUMNA_PAGA_SEGUROS,
  esColumnaPagaSegurosFaltante,
  pagaSeguros,
} from "./seguros";
import {
  COLUMNA_NO_MARCA_RELOJ,
  esColumnaNoMarcaRelojFaltante,
  noMarcaReloj,
} from "./sueldo-fijo";
import {
  COLUMNA_BASE_SEGUROS,
  baseSeguros,
  esColumnaBaseSegurosFaltante,
} from "./seguros-base";

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
  /** Opcional: no existe hasta que se corra `MIGRACION_SERVICIO_PROFESIONAL`. */
  servicio_profesional?: boolean | null;
  /** Opcional: no existe hasta que se corra `MIGRACION_SEGUROS`. Ausente o
   *  `null` = SÍ se le descuentan, que es como estaban las 38 fichas. */
  paga_seguros?: boolean | null;
  /** Opcional: no existe hasta que se corra `MIGRACION_NO_MARCA_RELOJ`. Ausente
   *  o `null` = SÍ marca el reloj, que es como estaban las 39 fichas. */
  no_marca_reloj?: boolean | null;
  /** Opcional: no existe hasta que se corra `MIGRACION_BASE_SEGUROS`. Ausente o
   *  `null` = los seguros salen del TOTAL BRUTO, que es como estaban las 40
   *  fichas. Es el monto de UNA QUINCENA — ver `seguros-base.ts`.
   *  ⚠️ `numeric` en la base, y PostgREST lo manda como TEXTO. Ver `baseSeguros`. */
  seguros_base_quincena?: number | string | null;
  /** Opcionales: no existen hasta que se corra `MIGRACION_SALDO_VACACIONES`.
   *  Los DOS o NINGUNO (lo obliga un CHECK). `null` = todavía no se cargó el
   *  saldo, y entonces la pantalla dice «Falta el saldo» y NO muestra número. */
  /** ⚠️ `numeric` en la base, y PostgREST lo manda como TEXTO. Ver
   *  `numeroDeDias` — el mismo motivo por el que `salario_mensual` se lee con
   *  un `Number(...)` unas líneas más arriba. */
  saldo_vacaciones_dias?: number | string | null;
  saldo_vacaciones_corte?: string | null;
}

export interface PersonasLeidas {
  filas: FilaPersonaDb[];
  faltaMigracion: boolean;
  /** `true` = la tabla existe pero le faltan las columnas de la baja. Todas las
   *  personas se leen como activas, que es exactamente como estaban antes. */
  faltaColumnasBajas: boolean;
  /** `true` = falta la columna de servicio profesional. Todo el mundo se lee
   *  como "va en planilla", que es exactamente como estaba antes. */
  faltaColumnaServicioProfesional: boolean;
  /** `true` = falta la columna de los seguros. A todo el mundo se le descuentan
   *  el social y el educativo, que es exactamente como estaba antes. */
  faltaColumnaPagaSeguros: boolean;
  /** `true` = falta la columna del sueldo fijo. Todo el mundo se lee como que
   *  marca el reloj, que es exactamente como estaba antes. */
  faltaColumnaNoMarcaReloj: boolean;
  /** `true` = falta la columna de la base propia de seguros. A todo el mundo se
   *  le calculan sobre el bruto, que es exactamente como estaba antes. */
  faltaColumnaBaseSeguros: boolean;
  /** `true` = faltan las columnas del saldo de vacaciones. Nadie tiene saldo
   *  inicial, o sea que la pestaña Vacaciones dice «Falta el saldo» y no
   *  muestra ningún número — que es exactamente como estaba antes. */
  faltaColumnasSaldoVacaciones: boolean;
}

/** Lo que se pedía antes de que existieran las altas y bajas. */
const COLS_BASE = "empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa";
/** Con las columnas de la baja. Salen de `vigencia.ts` para que el `select` y la
 *  detección del error no se puedan separar. */
const COLS_CON_BAJAS = `${COLS_BASE}, ${COLUMNAS_BAJAS.join(", ")}`;
/** Todo. La columna nueva sale de `participacion.ts`, por lo mismo.
 *
 *  ⚠️ Armado al ejecutar, así que los tipos generados de Supabase no pueden
 *  seguirlo y el resultado llega sin forma: por eso las lecturas de abajo
 *  castean `as unknown as FilaPersonaDb[]`. Se prefiere el cast a repetir los
 *  nombres de las columnas en dos lugares —esa es la duplicación que en este
 *  proyecto ya costó dos bugs caros. */
const COLS_CON_SERVICIO = `${COLS_CON_BAJAS}, ${COLUMNA_SERVICIO_PROFESIONAL}`;
/** Todo, con el interruptor de los seguros. Sale de `seguros.ts` por lo mismo. */
const COLS_TODO = `${COLS_CON_SERVICIO}, ${COLUMNA_PAGA_SEGUROS}`;
/** Todo, con el saldo de vacaciones. Salen de `saldo-vacaciones.ts`, por lo mismo. */
const COLS_CON_SALDO = `${COLS_TODO}, ${COLS_SALDO_VACACIONES.join(", ")}`;
/** Todo, con el sueldo fijo. Sale de `sueldo-fijo.ts`, por lo mismo. */
const COLS_CON_RELOJ = `${COLS_CON_SALDO}, ${COLUMNA_NO_MARCA_RELOJ}`;
/** Todo, con la base propia de seguros. Sale de `seguros-base.ts`, por lo mismo. */
const COLS_CON_BASE_SEGUROS = `${COLS_CON_RELOJ}, ${COLUMNA_BASE_SEGUROS}`;

/**
 * Las fichas guardadas.
 *
 * 🩸 AGUANTA CADA MIGRACIÓN PENDIENTE POR SEPARADO, y no es teoría: en este
 * proyecto los DDL los corre Daniel a mano y varios se quedaron pendientes
 * semanas. Una lista explícita de columnas hace que PostgREST rechace el select
 * ENTERO, así que sin esta escalera Asistencia no cargaría NI UNA ficha hasta
 * que alguien corriera el SQL — y el síntoma sería "Asistencia está rota".
 *
 * La escalera va de lo nuevo a lo viejo, y cada peldaño solo se baja cuando el
 * error NOMBRA la columna que ese peldaño quita:
 *   1. todo                        → lo normal;
 *   2. sin `seguros_base_quincena` → los seguros salen del bruto (como hoy);
 *   3. sin `no_marca_reloj`        → todo el mundo marca el reloj (como hoy);
 *   4. sin el saldo de vacaciones  → nadie tiene saldo inicial (como hoy);
 *   5. sin `paga_seguros`          → a todo el mundo se le cobran (como hoy);
 *   6. sin `servicio_profesional`  → nadie está fuera de planilla (como hoy);
 *   7. sin las columnas de baja    → todo el mundo activo (como estaba antes);
 *   8. sin la tabla                → lista vacía y la pantalla nombra el archivo.
 *
 * ⚠️ Releer ante CUALQUIER error convertiría un problema real —permisos, red,
 * RLS— en una lectura incompleta que nadie notaría.
 */
export async function leerPersonas(): Promise<PersonasLeidas> {
  // 🔴 EL ORDEN DE LAS PREGUNTAS NO ES ESTÉTICO, Y COSTÓ UNA VERIFICACIÓN EN EL
  // NAVEGADOR (7-ago-2026). Postgres dice «column asistencia_personas.
  // fecha_ingreso does not exist»: ese texto NOMBRA la tabla y trae "does not
  // exist", así que `esTablaFaltante` lo daría por bueno. Preguntando primero
  // por la tabla, faltar unas columnas se leía como «falta la tabla entera» y la
  // pantalla escondía las 32 fichas reales detrás de un aviso equivocado.
  // Lo específico se pregunta antes que lo general.
  const intentos: Array<{
    cols: string;
    faltaColumnasBajas: boolean;
    faltaColumnaServicioProfesional: boolean;
    faltaColumnaPagaSeguros: boolean;
    faltaColumnasSaldoVacaciones: boolean;
    faltaColumnaNoMarcaReloj: boolean;
    faltaColumnaBaseSeguros: boolean;
    /** ¿Este error justifica bajar un peldaño? */
    reintentar: (err: unknown) => boolean;
  }> = [
    {
      cols: COLS_CON_BASE_SEGUROS,
      faltaColumnasBajas: false,
      faltaColumnaServicioProfesional: false,
      faltaColumnaPagaSeguros: false,
      faltaColumnasSaldoVacaciones: false,
      faltaColumnaNoMarcaReloj: false,
      faltaColumnaBaseSeguros: false,
      reintentar: (e) =>
        esColumnaBaseSegurosFaltante(e)
        || esColumnaNoMarcaRelojFaltante(e)
        || esColumnaSaldoVacacionesFaltante(e)
        || esColumnaPagaSegurosFaltante(e)
        || esColumnaServicioProfesionalFaltante(e)
        || esColumnaDeBajaFaltante(e),
    },
    {
      cols: COLS_CON_RELOJ,
      faltaColumnasBajas: false,
      faltaColumnaServicioProfesional: false,
      faltaColumnaPagaSeguros: false,
      faltaColumnasSaldoVacaciones: false,
      faltaColumnaNoMarcaReloj: false,
      faltaColumnaBaseSeguros: true,
      reintentar: (e) =>
        esColumnaNoMarcaRelojFaltante(e)
        || esColumnaSaldoVacacionesFaltante(e)
        || esColumnaPagaSegurosFaltante(e)
        || esColumnaServicioProfesionalFaltante(e)
        || esColumnaDeBajaFaltante(e),
    },
    {
      cols: COLS_CON_SALDO,
      faltaColumnasBajas: false,
      faltaColumnaServicioProfesional: false,
      faltaColumnaPagaSeguros: false,
      faltaColumnasSaldoVacaciones: false,
      faltaColumnaNoMarcaReloj: true,
      faltaColumnaBaseSeguros: true,
      reintentar: (e) =>
        esColumnaSaldoVacacionesFaltante(e)
        || esColumnaPagaSegurosFaltante(e)
        || esColumnaServicioProfesionalFaltante(e)
        || esColumnaDeBajaFaltante(e),
    },
    {
      cols: COLS_TODO,
      faltaColumnasBajas: false,
      faltaColumnaServicioProfesional: false,
      faltaColumnaPagaSeguros: false,
      faltaColumnasSaldoVacaciones: true,
      faltaColumnaNoMarcaReloj: true,
      faltaColumnaBaseSeguros: true,
      reintentar: (e) =>
        esColumnaPagaSegurosFaltante(e)
        || esColumnaServicioProfesionalFaltante(e)
        || esColumnaDeBajaFaltante(e),
    },
    {
      cols: COLS_CON_SERVICIO,
      faltaColumnasBajas: false,
      faltaColumnaServicioProfesional: false,
      faltaColumnaPagaSeguros: true,
      faltaColumnasSaldoVacaciones: true,
      faltaColumnaNoMarcaReloj: true,
      faltaColumnaBaseSeguros: true,
      reintentar: (e) => esColumnaServicioProfesionalFaltante(e) || esColumnaDeBajaFaltante(e),
    },
    {
      cols: COLS_CON_BAJAS,
      faltaColumnasBajas: false,
      faltaColumnaServicioProfesional: true,
      faltaColumnaPagaSeguros: true,
      faltaColumnasSaldoVacaciones: true,
      faltaColumnaNoMarcaReloj: true,
      faltaColumnaBaseSeguros: true,
      reintentar: esColumnaDeBajaFaltante,
    },
    {
      cols: COLS_BASE,
      faltaColumnasBajas: true,
      faltaColumnaServicioProfesional: true,
      faltaColumnaPagaSeguros: true,
      faltaColumnasSaldoVacaciones: true,
      faltaColumnaNoMarcaReloj: true,
      faltaColumnaBaseSeguros: true,
      reintentar: () => false,
    },
  ];

  for (const intento of intentos) {
    const { data, error } = await supabaseServer.from(TABLA_PERSONAS).select(intento.cols);
    if (!error) {
      return {
        filas: (data ?? []) as unknown as FilaPersonaDb[],
        faltaMigracion: false,
        faltaColumnasBajas: intento.faltaColumnasBajas,
        faltaColumnaServicioProfesional: intento.faltaColumnaServicioProfesional,
        faltaColumnaPagaSeguros: intento.faltaColumnaPagaSeguros,
        faltaColumnaNoMarcaReloj: intento.faltaColumnaNoMarcaReloj,
        faltaColumnaBaseSeguros: intento.faltaColumnaBaseSeguros,
        faltaColumnasSaldoVacaciones: intento.faltaColumnasSaldoVacaciones,
      };
    }
    if (intento.reintentar(error)) continue;
    if (esTablaFaltante(error, TABLA_PERSONAS)) {
      return {
        filas: [],
        faltaMigracion: true,
        faltaColumnasBajas: true,
        faltaColumnaServicioProfesional: true,
        faltaColumnaPagaSeguros: true,
        faltaColumnasSaldoVacaciones: true,
        faltaColumnaNoMarcaReloj: true,
        faltaColumnaBaseSeguros: true,
      };
    }
    throw new Error(error.message);
  }

  // Inalcanzable: el último intento nunca reintenta. Está para que el tipo
  // cierre sin un `!` que después se lea como una promesa que no se cumple.
  return {
    filas: [],
    faltaMigracion: true,
    faltaColumnasBajas: true,
    faltaColumnaServicioProfesional: true,
    faltaColumnaPagaSeguros: true,
    faltaColumnasSaldoVacaciones: true,
    faltaColumnaNoMarcaReloj: true,
    faltaColumnaBaseSeguros: true,
  };
}

/**
 * ¿Esta ficha va en la planilla?
 *
 * Sin la columna corrida —o con `null`— la respuesta es SÍ, que es como estaban
 * las 38 fichas antes de este cambio. Ante la duda nadie sale del cálculo:
 * sacar a alguien de la planilla por accidente es dejar de pagarle.
 */
export function servicioProfesionalDeFila(f: FilaPersonaDb): boolean {
  return esServicioProfesional(f.servicio_profesional);
}

/**
 * ¿A esta ficha se le descuentan los seguros?
 *
 * Sin la columna corrida —o con `null`— la respuesta es SÍ, que es como estaban
 * las 38 fichas antes de este cambio: la planilla se las cobraba a todas. Ante
 * la duda se retiene; ver `seguros.ts` para por qué la asimetría va para ese
 * lado.
 */
export function pagaSegurosDeFila(f: FilaPersonaDb): boolean {
  return pagaSeguros(f.paga_seguros);
}

/**
 * ¿Esta ficha cobra fijo sin pasar por el reloj?
 *
 * Sin la columna corrida —o con `null`— la respuesta es NO, que es como estaban
 * las 39 fichas antes de este cambio: a todas se les medían las marcaciones.
 * Ante la duda se mira el reloj; ver `sueldo-fijo.ts` para por qué la asimetría
 * va para ese lado.
 */
export function noMarcaRelojDeFila(f: FilaPersonaDb): boolean {
  return noMarcaReloj(f.no_marca_reloj);
}

/**
 * ¿Sobre qué monto se le calculan los seguros? `null` = sobre el TOTAL BRUTO.
 *
 * Sin la columna corrida —o con `null`— la respuesta es «sobre el bruto», que
 * es como estaban las 40 fichas antes de este cambio. Es el monto de UNA
 * QUINCENA; ver `seguros-base.ts` para por qué la unidad es ésa y no la mensual.
 *
 * 🩸 `baseSeguros` y no un `Number(...)` pelado: la columna es `numeric` y
 * PostgREST la manda como TEXTO. Es el mismo modo de fallo que ya costó una vez
 * con el saldo de vacaciones — y acá la base perdida en silencio le devolvería
 * a Rodrigo el 9,75 % sobre su bruto sin que nadie se entere.
 */
export function baseSegurosDeFila(f: FilaPersonaDb): number | null {
  return baseSeguros(f.seguros_base_quincena);
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

/**
 * Lo que la ficha aporta al saldo de vacaciones.
 *
 * Sin las columnas corridas —o con la migración pendiente— sale «no se cargó»,
 * que es el estado real de las 39 fichas y lo que hace que la pantalla diga
 * «Falta el saldo» en vez de mostrar un número que engaña.
 */
export function datosSaldoDeFila(f: FilaPersonaDb): DatosSaldo {
  return {
    fechaIngreso: f.fecha_ingreso ?? null,
    // 🩸 `numeroDeDias` y no un `typeof === "number"`: la columna es `numeric` y
    // PostgREST la manda como TEXTO. Ver la nota de esa función.
    saldoInicial: numeroDeDias(f.saldo_vacaciones_dias),
    corte: f.saldo_vacaciones_corte ?? null,
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
  /**
   * Las fichas crudas con las que se armó el directorio.
   *
   * 🔑 Viajan de vuelta para que quien necesite OTRO campo de la ficha —la
   * `fecha_ingreso` del saldo de vacaciones, por ejemplo— no tenga que volver a
   * leer `asistencia_personas`. Dos lecturas de la misma tabla en la misma
   * petición es la forma de que una traiga una columna que la otra no.
   */
  filas: FilaPersonaDb[];
}

/** El traductor código → nombre. Sin la migración corrida devuelve uno vacío,
 *  que responde el código para cualquier persona en vez de romper la pantalla. */
export async function leerDirectorio(): Promise<DirectorioLeido> {
  const { filas, faltaMigracion } = await leerPersonas();
  return { directorio: crearDirectorio(filas), faltaMigracion, filas };
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
  /** Las fichas crudas. Ver `DirectorioLeido.filas`: es la MISMA lectura. */
  filas: FilaPersonaDb[];
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
  const [{ directorio, faltaMigracion, filas }, codigos] = await Promise.all([
    leerDirectorio(),
    leerCodigosConMarcaciones(dias),
  ]);
  return { personas: armarPersonas(directorio, codigos), directorio, faltaMigracion, filas };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS JUSTIFICACIONES — en UN solo lugar, y sin asumir que el DDL corrió
//
// 🩸 Las leían TRES rutas con su propio `select` copiado (`/reporte`,
// `/planilla` y `/justificaciones`), que es exactamente el patrón que en este
// proyecto ya costó dos bugs caros: el día que una gana una columna y las otras
// no, la misma justificación vale distinto según por dónde se la mire — y acá
// eso es la diferencia entre «el día entero» y «un permiso de dos horas», o sea
// ocho horas de sueldo.
// ─────────────────────────────────────────────────────────────────────────────

export interface JustificacionesLeidas {
  filas: Justificacion[];
  /** `true` = falta `MIGRACION_PERMISO_HORAS`. Todas se leen como de DÍA
   *  ENTERO, que es exactamente como se comportan hoy. */
  faltaColumnasHoras: boolean;
}

/** Las justificaciones que TOCAN el rango pedido (se solapan, no "están
 *  contenidas": unas vacaciones que arrancan antes cubren días de adentro). */
export async function leerJustificaciones(
  desde: string,
  hasta: string,
): Promise<JustificacionesLeidas> {
  const BASE = "empleado_codigo, desde, hasta, motivo";
  const pedir = (cols: string) =>
    supabaseServer
      .from("asistencia_justificaciones")
      .select(cols)
      .lte("desde", hasta)
      .gte("hasta", desde);

  const conHoras = await pedir(`${BASE}, ${COLS_PERMISO_HORAS.join(", ")}`);
  if (!conHoras.error) {
    return {
      filas: (conHoras.data ?? []) as unknown as Justificacion[],
      faltaColumnasHoras: false,
    };
  }
  // ⚠️ Solo se relee si el error NOMBRA las columnas. Tragarse cualquier error
  // convertiría un problema real —permisos, red, RLS— en una lectura incompleta
  // que nadie notaría, y con ella una justificación que deja de justificar.
  if (!esColumnaPermisoHorasFaltante(conHoras.error)) throw new Error(conHoras.error.message);

  const sinHoras = await pedir(BASE);
  if (sinHoras.error) throw new Error(sinHoras.error.message);
  return {
    filas: (sinHoras.data ?? []) as unknown as Justificacion[],
    faltaColumnasHoras: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS VACACIONES — en UN solo lugar, y sin asumir que el DDL corrió
//
// 🩸 Mismo criterio que `leerJustificaciones`, y por el mismo motivo: las leen
// DOS rutas (`/reporte` y `/planilla`) más la pantalla de Vacaciones. Un
// `select` copiado en cada una es el patrón que en este módulo ya costó dos
// bugs caros — el día que una gane el interruptor y las otras no, el mismo día
// se paga en una pantalla y se descuenta en la otra.
//
// ⚠️ LA TABLA PUEDE NO EXISTIR TODAVÍA: los DDL los corre Daniel a mano. Sin
// ella se devuelven CERO vacaciones y `faltaTabla`, y TODO el módulo se
// comporta EXACTAMENTE como antes de que las vacaciones existieran.
// ─────────────────────────────────────────────────────────────────────────────

/** El archivo que Daniel tiene que correr para que exista la tabla. */
export const MIGRACION_VACACIONES = "20260825160000_asistencia_vacaciones.sql";

/** El mensaje que ve la gente cuando falta correr el SQL. Sin jerga de base. */
export function avisoMigracionVacaciones(): string {
  return `Todavía no se pueden cargar vacaciones aquí. Pídele a Daniel que corra el archivo ${MIGRACION_VACACIONES} en Supabase.`;
}

export interface VacacionesLeidas {
  filas: Vacacion[];
  /** `true` = falta correr `MIGRACION_VACACIONES`. Nadie está de vacaciones. */
  faltaTabla: boolean;
}

/**
 * Las vacaciones que TOCAN el rango pedido.
 *
 * 🔑 Se SOLAPAN, no "están contenidas": unas vacaciones que arrancan antes del
 * rango igual cubren días de adentro. Es el mismo criterio que ya usan las
 * justificaciones, y el de Eloyn (16-jul → 13-ago) es justamente el caso.
 */
export async function leerVacaciones(
  desde: string,
  hasta: string,
): Promise<VacacionesLeidas> {
  const { data, error } = await supabaseServer
    .from(TABLA_VACACIONES)
    .select("empleado_codigo, desde, hasta, ya_pagadas")
    .eq("deleted", false)
    .lte("desde", hasta)
    .gte("hasta", desde);

  if (error) {
    // ⚠️ Solo se degrada si el error NOMBRA la tabla. Tragarse cualquier error
    // convertiría un permiso o un timeout en «nadie está de vacaciones», y esa
    // mentira se paga: los días volverían a contarse como ausencia.
    if (esTablaFaltante(error, TABLA_VACACIONES)) return { filas: [], faltaTabla: true };
    throw new Error(error.message);
  }

  return {
    filas: (data ?? []).map((f) => ({
      empleado_codigo: String((f as { empleado_codigo: unknown }).empleado_codigo),
      desde: String((f as { desde: unknown }).desde),
      hasta: String((f as { hasta: unknown }).hasta),
      // 🔑 `=== true`, no truthy: la columna nace en `false` y un valor raro
      // tiene que caer del lado de «se paga», que es el default.
      ya_pagadas: (f as { ya_pagadas: unknown }).ya_pagadas === true,
    })),
    faltaTabla: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EL REPARTO DE UN SUELDO ENTRE DOS EMPRESAS — ver `reparto.ts`
// ─────────────────────────────────────────────────────────────────────────────

export interface RepartosLeidos {
  /** Todas las filas, sin validar. Vacío si la tabla todavía no existe. */
  filas: FilaReparto[];
  /**
   * `true` = falta correr `MIGRACION_REPARTO`. Nadie tiene reparto, o sea la
   * planilla de hoy hasta el centavo, y la pantalla dice qué archivo falta.
   */
  faltaTabla: boolean;
}

/**
 * Los repartos guardados.
 *
 * ⚠️ Solo se degrada si el error NOMBRA la tabla. Tragarse cualquier error
 * convertiría un permiso o un timeout en «nadie reparte su sueldo», y esa
 * mentira se paga en el neto: JULIO volvería a pagar el 11 % de seguros sobre
 * sus horas extra sin que nadie se entere.
 *
 * 🩸 SE PAGINA AUNQUE HOY SEAN DOS FILAS. `db-max-rows` = 1000 corta EN
 * SILENCIO, y acá un truncado no da un error: da un reparto que **NO SUMA** el
 * salario de la ficha, así que `validarReparto` lo rechaza y la persona vuelve
 * a cobrar en una sola planilla. Se vería como «se deshizo solo».
 */
export async function leerRepartos(): Promise<RepartosLeidos> {
  try {
    const filas = await leerTodoPaginado<FilaReparto>(
      TABLA_REPARTO,
      (pedirCount, from, to) =>
        supabaseServer
          .from(TABLA_REPARTO)
          .select(
            "empleado_codigo, empresa, salario_mensual, paga_seguros, paga_horas_extra, orden",
            pedirCount ? { count: "exact" } : {},
          )
          // 🔑 Orden TOTAL y estable: sin él, dos filas empatadas pueden
          // repetirse o saltearse entre páginas. La llave es (código, empresa).
          .order("empleado_codigo", { ascending: true })
          .order("empresa", { ascending: true })
          .range(from, to),
    );
    return { filas, faltaTabla: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 🔑 `leerTodoPaginado` prefija su etiqueta pero CONSERVA el mensaje de
    // PostgREST, así que la detección de «falta la tabla» sigue funcionando.
    if (esTablaFaltante({ message: msg }, TABLA_REPARTO)) {
      return { filas: [], faltaTabla: true };
    }
    throw e;
  }
}
