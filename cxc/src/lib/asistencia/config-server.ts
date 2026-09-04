/* ─────────────────────────────────────────────────────────────────────────────
 * Leer la configuración de asistencia — el I/O de fichas, reglas,
 * justificaciones, vacaciones y repartos, en UN solo lugar.
 *
 * Historia (ago-2026): esto se escribió para leer SIN ASUMIR QUE LA MIGRACIÓN
 * YA CORRIÓ. En este proyecto los DDL los corre Daniel a mano, y varios se
 * quedaron "PENDIENTES" durante semanas. Si la pantalla de Configuración se
 * cayera hasta que alguien corriera el SQL, el síntoma sería "Asistencia está
 * rota" — nadie deduce de un 500 que falta un `CREATE TABLE`. Por eso acá se
 * DEGRADABA con un aviso concreto (el nombre del archivo que había que correr),
 * y solo cuando el error NOMBRABA la tabla o la columna. Era el criterio de
 * `catalogo/cols-opcionales.ts`, un escalón más arriba.
 *
 * 🔴 TOLERANCIA RETIRADA EL 3-SEP-2026. Las tablas y columnas que este archivo
 * toleraba existen todas en producción (verificado por PostgREST ese día):
 *   · `asistencia_reglas` y `asistencia_personas` — 20260806160000
 *   · fecha_ingreso / fecha_salida / motivo_salida   — 20260807120000
 *   · servicio_profesional                            — 20260813120000
 *   · paga_seguros                                    — 20260825120000
 *   · hora_desde / hora_hasta (justificaciones)       — 20260825140000
 *   · `asistencia_vacaciones`                         — 20260825160000
 *   · saldo_vacaciones_dias / _corte                  — 20260826040000
 *   · no_marca_reloj                                  — 20260826080000
 *   · seguros_base_quincena                           — 20260826120000
 *   · `asistencia_reparto_empresa`                    — 20260901120000
 * Con todas corridas, ese camino era RAMA MUERTA que solo podía esconder
 * errores reales: un permiso denegado, un timeout o un cambio de esquema que
 * devuelva el mismo código (`42P01`, `PGRST205`, `42703`, `PGRST204`) se leían
 * como «todavía no está instalado» y la planilla salía con TODOS activos, nadie
 * de vacaciones, nadie fuera de planilla, seguros sobre el bruto — o sea, con
 * plata mal pagada y una pantalla tranquila. Hoy cualquier error de la base se
 * PROPAGA y la ruta contesta 500 con el mensaje. Los campos `faltaMigracion`
 * que quedan en las respuestas están SIEMPRE en `false` y se conservan solo
 * porque los leen rutas de otra tanda (`reglas`, `justificaciones`,
 * `vacaciones`); los detectores (`esTablaFaltante`, `esColumna*Faltante`)
 * siguen vivos en sus módulos puros porque los usan otros archivos.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  reglasDesdeFila,
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
  MOTIVOS_SALIDA,
  type MotivoSalida,
  type Vigencia,
} from "./vigencia";
import { COLUMNA_SERVICIO_PROFESIONAL, esServicioProfesional } from "./participacion";
import { COLS_PERMISO_HORAS } from "./permiso-horas";
import { COLS_SALDO_VACACIONES, numeroDeDias, type DatosSaldo } from "./saldo-vacaciones";
import type { Justificacion } from "./reporte";
// 🔑 SOLO EL TIPO: `vacaciones.ts` es PURO y no puede importar de acá. Un
// import de valor armaría el ciclo al revés y sin necesidad.
import type { Vacacion } from "./vacaciones";
import { COLUMNA_PAGA_SEGUROS, pagaSeguros } from "./seguros";
import { COLUMNA_NO_MARCA_RELOJ, noMarcaReloj } from "./sueldo-fijo";
import { COLUMNA_BASE_SEGUROS, baseSeguros } from "./seguros-base";

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
  /**
   * SIEMPRE `false` desde el 3-sep-2026 (tolerancia a la DDL retirada: la
   * tabla existe desde 20260806160000). Se conserva porque lo leen
   * `configuracion/reglas/route.ts` y las rutas que pasan por
   * `leerPersonasDelModulo`; hoy un error de la base se propaga, no se
   * disfraza de «falta la migración».
   */
  faltaMigracion: boolean;
}

/**
 * Las reglas del cálculo.
 *
 * Historia: sin la migración corrida devolvía los valores por defecto (los que
 * confirmó la contable) para que el reporte siguiera saliendo. Tolerancia
 * retirada el 3-sep-2026: la tabla existe desde
 * 20260806160000_asistencia_configuracion.sql. Un error acá es un error —
 * seguir con los defaults pagaría con una tolerancia o una rata que la
 * contadora tal vez cambió, sin que nadie lo vea.
 */
export async function leerReglas(): Promise<ReglasLeidas> {
  const { data, error } = await supabaseServer
    .from(TABLA_REGLAS)
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudieron leer las reglas de asistencia: ${error.message}`);
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
  // Los campos de abajo siguen OPCIONALES en el tipo aunque el `select` los pida
  // siempre: los tests y los callers arman fichas parciales, y `null` sigue
  // siendo el valor normal de una ficha que no tiene el dato cargado.
  /** La baja (20260807120000). `null` = sigue trabajando. */
  fecha_ingreso?: string | null;
  fecha_salida?: string | null;
  motivo_salida?: string | null;
  /** Servicio profesional (20260813120000). `null` = va en planilla. */
  servicio_profesional?: boolean | null;
  /** Seguros (20260825120000). `null` = SÍ se le descuentan, que es como
   *  estaban las 38 fichas. */
  paga_seguros?: boolean | null;
  /** Sueldo fijo (20260826080000). `null` = SÍ marca el reloj, que es como
   *  estaban las 39 fichas. */
  no_marca_reloj?: boolean | null;
  /** Base propia de seguros (20260826120000). `null` = los seguros salen del
   *  TOTAL BRUTO, que es como estaban las 40 fichas. Es el monto de UNA
   *  QUINCENA — ver `seguros-base.ts`.
   *  ⚠️ `numeric` en la base, y PostgREST lo manda como TEXTO. Ver `baseSeguros`. */
  seguros_base_quincena?: number | string | null;
  /** El saldo de vacaciones (20260826040000). Los DOS o NINGUNO (lo obliga un
   *  CHECK). `null` = todavía no se cargó el saldo, y entonces la pantalla dice
   *  «Falta el saldo» y NO muestra número. */
  /** ⚠️ `numeric` en la base, y PostgREST lo manda como TEXTO. Ver
   *  `numeroDeDias` — el mismo motivo por el que `salario_mensual` se lee con
   *  un `Number(...)` unas líneas más arriba. */
  saldo_vacaciones_dias?: number | string | null;
  saldo_vacaciones_corte?: string | null;
}

export interface PersonasLeidas {
  filas: FilaPersonaDb[];
  /**
   * SIEMPRE `false` desde el 3-sep-2026 (tolerancia a la DDL retirada). Se
   * conserva porque viaja por `leerDirectorio` → `leerPersonasDelModulo` hasta
   * rutas de otra tanda (`justificaciones`, `vacaciones`). Hoy un error de la
   * base se propaga, no se disfraza de «falta la migración».
   *
   * Historia: hasta ese día acá venían además seis banderas `faltaColumna*`
   * (bajas, servicio profesional, seguros, sueldo fijo, base de seguros, saldo
   * de vacaciones), una por migración pendiente. Se quitaron con la escalera.
   */
  faltaMigracion: boolean;
}

/** Lo que se pedía antes de que existieran las altas y bajas. */
const COLS_BASE = "empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa";
/** Con las columnas de la baja. Salen de `vigencia.ts`: el `select` y el módulo
 *  que sabe leerlas no se pueden separar. */
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
/** Todo, con la base propia de seguros. Sale de `seguros-base.ts`, por lo mismo.
 *  Es LA lista que se pide: las de arriba solo documentan de dónde sale cada
 *  columna. */
const COLS_CON_BASE_SEGUROS = `${COLS_CON_RELOJ}, ${COLUMNA_BASE_SEGUROS}`;

/**
 * Las fichas guardadas — UN solo `select`, con todas las columnas.
 *
 * Historia (ago-2026): esto era una ESCALERA de siete peldaños que aguantaba
 * cada migración pendiente por separado (sin `seguros_base_quincena` → los
 * seguros del bruto; sin `no_marca_reloj` → todos marcan; sin el saldo → nadie
 * tiene; sin `paga_seguros` → a todos se les cobra; sin `servicio_profesional`
 * → nadie fuera de planilla; sin las columnas de baja → todos activos; sin la
 * tabla → lista vacía con aviso). Cada peldaño solo se bajaba cuando el error
 * NOMBRABA la columna, y lo específico se preguntaba antes que lo general
 * (7-ago-2026: preguntar primero por la tabla escondió 32 fichas reales).
 *
 * 🔴 Tolerancia retirada el 3-sep-2026: las siete migraciones existen en
 * producción (lista en el encabezado). Bajar un peldaño hoy no sería tolerar
 * una DDL pendiente: sería leer una planilla con TODOS activos, nadie de
 * vacaciones y seguros sobre el bruto porque un permiso o un timeout devolvió
 * el mismo código — plata mal pagada con la pantalla tranquila. Cualquier
 * error se propaga.
 */
export async function leerPersonas(): Promise<PersonasLeidas> {
  const { data, error } = await supabaseServer.from(TABLA_PERSONAS).select(COLS_CON_BASE_SEGUROS);
  if (error) {
    throw new Error(`No se pudieron leer las fichas de asistencia: ${error.message}`);
  }
  return {
    filas: (data ?? []) as unknown as FilaPersonaDb[],
    faltaMigracion: false,
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
  /** SIEMPRE `false` desde el 3-sep-2026 — ver `PersonasLeidas.faltaMigracion`. */
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

/** El traductor código → nombre. Sale de las MISMAS fichas que `leerPersonas`:
 *  si esa lectura falla, esto falla (tolerancia a la DDL retirada el 3-sep-2026). */
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
// LAS JUSTIFICACIONES — en UN solo lugar
//
// 🩸 Las leían TRES rutas con su propio `select` copiado (`/reporte`,
// `/planilla` y `/justificaciones`), que es exactamente el patrón que en este
// proyecto ya costó dos bugs caros: el día que una gana una columna y las otras
// no, la misma justificación vale distinto según por dónde se la mire — y acá
// eso es la diferencia entre «el día entero» y «un permiso de dos horas», o sea
// ocho horas de sueldo.
//
// Historia: hasta el 3-sep-2026 esto releía SIN `hora_desde`/`hora_hasta` cuando
// el error nombraba esas columnas (`faltaColumnasHoras: true` → todas de día
// entero). Tolerancia retirada: las columnas existen desde
// 20260825140000_asistencia_permiso_horas.sql. Releer hoy convertiría un
// permiso de dos horas en un día entero justificado por un timeout.
// ─────────────────────────────────────────────────────────────────────────────

export interface JustificacionesLeidas {
  filas: Justificacion[];
}

/** Las justificaciones que TOCAN el rango pedido (se solapan, no "están
 *  contenidas": unas vacaciones que arrancan antes cubren días de adentro). */
export async function leerJustificaciones(
  desde: string,
  hasta: string,
): Promise<JustificacionesLeidas> {
  const { data, error } = await supabaseServer
    .from("asistencia_justificaciones")
    .select(`empleado_codigo, desde, hasta, motivo, ${COLS_PERMISO_HORAS.join(", ")}`)
    .lte("desde", hasta)
    .gte("hasta", desde);

  if (error) {
    throw new Error(`No se pudieron leer las justificaciones: ${error.message}`);
  }
  return { filas: (data ?? []) as unknown as Justificacion[] };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS VACACIONES — en UN solo lugar
//
// 🩸 Mismo criterio que `leerJustificaciones`, y por el mismo motivo: las leen
// DOS rutas (`/reporte` y `/planilla`) más la pantalla de Vacaciones. Un
// `select` copiado en cada una es el patrón que en este módulo ya costó dos
// bugs caros — el día que una gane el interruptor y las otras no, el mismo día
// se paga en una pantalla y se descuenta en la otra.
//
// Historia: hasta el 3-sep-2026 «la tabla puede no existir todavía» y sin ella
// se devolvían CERO vacaciones con `faltaTabla: true`. Tolerancia retirada: la
// tabla existe desde 20260825160000. 🔴 Es la lectura que el motor honra pase
// lo que pase (`vacaciones-el-motor-las-honra.test.ts`): devolver vacío ante
// un error de la base convertiría los días de vacaciones en ausencias y
// comería una quincena en silencio. Hoy el error se propaga.
// ─────────────────────────────────────────────────────────────────────────────

/** El archivo que creó la tabla. Se conserva para el aviso de la ruta
 *  `vacaciones` (otra tanda), que sigue nombrándolo. */
export const MIGRACION_VACACIONES = "20260825160000_asistencia_vacaciones.sql";

/** El mensaje de la ruta `vacaciones` cuando su escritura detecta la tabla
 *  ausente. Sin jerga de base. Acá ya no se usa (3-sep-2026). */
export function avisoMigracionVacaciones(): string {
  return `Todavía no se pueden cargar vacaciones aquí. Pídele a Daniel que corra el archivo ${MIGRACION_VACACIONES} en Supabase.`;
}

export interface VacacionesLeidas {
  filas: Vacacion[];
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
    // 🔴 Nada de degradar a «nadie está de vacaciones»: esa mentira se paga —
    // los días volverían a contarse como ausencia.
    throw new Error(`No se pudieron leer las vacaciones: ${error.message}`);
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
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EL REPARTO DE UN SUELDO ENTRE DOS EMPRESAS — ver `reparto.ts`
// ─────────────────────────────────────────────────────────────────────────────

export interface RepartosLeidos {
  /** Todas las filas, sin validar. */
  filas: FilaReparto[];
}

/**
 * Los repartos guardados.
 *
 * Historia: hasta el 3-sep-2026, si el error NOMBRABA la tabla se devolvía
 * vacío con `faltaTabla: true` («nadie reparte, la planilla de hoy hasta el
 * centavo»). Tolerancia retirada: la tabla existe desde
 * 20260901120000_asistencia_reparto_empresa.sql. Degradar hoy convertiría un
 * permiso o un timeout en «nadie reparte su sueldo», y esa mentira se paga en
 * el neto: JULIO volvería a pagar el 11 % de seguros sobre sus horas extra sin
 * que nadie se entere. El error se propaga.
 *
 * 🩸 SE PAGINA AUNQUE HOY SEAN DOS FILAS. `db-max-rows` = 1000 corta EN
 * SILENCIO, y acá un truncado no da un error: da un reparto que **NO SUMA** el
 * salario de la ficha, así que `validarReparto` lo rechaza y la persona vuelve
 * a cobrar en una sola planilla. Se vería como «se deshizo solo».
 */
export async function leerRepartos(): Promise<RepartosLeidos> {
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
  return { filas };
}
