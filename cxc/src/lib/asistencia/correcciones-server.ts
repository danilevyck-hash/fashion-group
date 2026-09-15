/* ─────────────────────────────────────────────────────────────────────────────
 * CORRECCIONES DE MARCACIÓN — el I/O.
 *
 * Todo lo que decide QUÉ hora vale vive en `correcciones.ts` (puro). Acá solo
 * está el viaje a la base.
 *
 * ⚠️ DEGRADA SIN LA MIGRACIÓN CORRIDA, igual que `config-server.ts`: en este
 * proyecto los DDL los corre Daniel a mano y varios se quedaron pendientes
 * semanas. Si el reporte y la planilla se cayeran hasta que alguien corra el
 * SQL, el síntoma sería «Asistencia está rota» — y encima sobre las dos
 * pantallas que hoy funcionan perfectamente sin esta tabla. Sin la tabla:
 * CERO correcciones, o sea exactamente los mismos números de siempre.
 *
 * 🔴 Y la degradación solo ocurre cuando el error NOMBRA la tabla. Tragarse
 * cualquier error convertiría un problema real —permisos, red, RLS— en una
 * planilla que se paga con las correcciones silenciosamente ignoradas.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esTablaFaltante } from "./config";
import {
  TABLA_CORRECCIONES,
  type Correccion,
} from "./correcciones";
import { desdeDeLaVentana, motivosFrecuentes } from "./motivos-frecuentes";
import { hoyPanama } from "@/lib/fecha-panama";

/** Las columnas que se leen. Una sola lista, para que no se puedan separar. */
const COLS_BASE =
  "id, marcacion_id, empleado_codigo, fecha, hora, motivo, creada_por, creada_en";

/**
 * 🩸 `quita` SE LEE APARTE, Y NO ES UN CAPRICHO (14-sep-2026). Si la migración
 * `20261128120000` no corrió, PostgREST contesta «column
 * asistencia_correcciones.quita does not exist» — un mensaje que NOMBRA LA
 * TABLA y dice «does not exist», o sea exactamente lo que `esTablaFaltante`
 * busca. Sin este apartado, faltar UNA COLUMNA se leería como «falta la tabla»
 * y el resultado sería CERO correcciones en silencio: la planilla se pagaría
 * con las horas del reloj, que es justo lo que alguien corrigió. Se memoriza
 * para no pagar dos consultas por lectura.
 */
let hayColumnaQuita: boolean | null = null;

function cols(): string {
  return hayColumnaQuita === false ? COLS_BASE : `${COLS_BASE}, quita`;
}

/** ¿Este error es «esa COLUMNA no existe»? Se mira el nombre de la columna. */
function esColumnaFaltante(err: unknown, columna: string): boolean {
  if (!err) return false;
  const e = err as { code?: string | null; message?: string | null };
  const texto = String(e.message ?? "");
  if (!texto.includes(columna)) return false;
  return (
    String(e.code ?? "") === "42703" ||
    String(e.code ?? "") === "PGRST204" ||
    /does not exist|no existe|could not find|schema cache/i.test(texto)
  );
}

interface FilaCorreccion {
  id: string;
  marcacion_id: string | null;
  empleado_codigo: string;
  fecha: string;
  hora: string | null;
  motivo: string;
  creada_por: string;
  creada_en: string;
  quita?: boolean | null;
}

function aCorreccion(f: FilaCorreccion): Correccion {
  return {
    id: String(f.id),
    marcacionId: f.marcacion_id ? String(f.marcacion_id) : null,
    empleadoCodigo: String(f.empleado_codigo ?? "").trim(),
    fecha: String(f.fecha).slice(0, 10),
    // Postgres devuelve `time` como "08:00:00"; con milisegundos vendría
    // "08:00:00.5". Se corta a los segundos, que es la unidad del módulo.
    // ⚠️ Una corrección que QUITA no tiene hora: la columna viene NULL.
    hora: String(f.hora ?? "").slice(0, 8),
    motivo: String(f.motivo ?? ""),
    creadaPor: String(f.creada_por ?? ""),
    creadaEn: String(f.creada_en ?? ""),
    quita: Boolean(f.quita),
  };
}

export interface CorreccionesLeidas {
  correcciones: Correccion[];
  /** `true` = la tabla todavía no existe. Se calcula SIN correcciones. */
  faltaMigracion: boolean;
}

/**
 * Las correcciones VIVAS de un rango de días.
 *
 * ⚠️ `anulada_en IS NULL`: una corrección deshecha queda en la tabla —el rastro
 * no se pierde— pero deja de mandar, y el cálculo vuelve a lo que dijo el reloj.
 *
 * ⚠️ Paginado y verificado contra el COUNT: PostgREST corta en 1.000 filas EN
 * SILENCIO, y una planilla a la que se le caigan correcciones sin avisar se
 * paga igual — con las horas del reloj, que es justo lo que se corrigió.
 */
export async function leerCorrecciones(
  desde: string,
  hasta: string,
): Promise<CorreccionesLeidas> {
  try {
    const filas = await leerTodoPaginado<FilaCorreccion>(
      `${TABLA_CORRECCIONES} (rango)`,
      (pedirCount, from, to) =>
        supabaseServer
          .from(TABLA_CORRECCIONES)
          .select(cols(), pedirCount ? { count: "exact" } : {})
          .is("anulada_en", null)
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("fecha", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    );
    hayColumnaQuita = hayColumnaQuita ?? true;
    return { correcciones: filas.map(aCorreccion), faltaMigracion: false };
  } catch (e) {
    const err = errorDeLectura(e);
    // 🔴 PRIMERO la columna, DESPUÉS la tabla. Al revés, faltar `quita` se
    // leería como faltar la tabla entera y se perderían TODAS las correcciones.
    if (hayColumnaQuita !== false && esColumnaFaltante(err, "quita")) {
      hayColumnaQuita = false;
      return leerCorrecciones(desde, hasta);
    }
    if (esTablaFaltante(err, TABLA_CORRECCIONES)) {
      return { correcciones: [], faltaMigracion: true };
    }
    throw e;
  }
}

/**
 * 🩸 `leerTodoPaginado` envuelve el error de PostgREST en un `Error` con su
 * etiqueta delante y pierde el `code`. `esTablaFaltante` mira código Y texto, y
 * el texto de PostgREST SÍ nombra la tabla, así que se le pasa el mensaje como
 * si fuera el error. Sin esto, faltar la tabla se leería como un fallo real y
 * el reporte moriría en 500 hasta que alguien corriera el SQL.
 *
 * 🔴 SE LE QUITA LA ETIQUETA PRIMERO, y no es cosmético: la etiqueta lleva el
 * nombre de la tabla adentro, así que dejarla haría que CUALQUIER error de esta
 * lectura —una caída de red, un timeout— pasara el «¿nombra la tabla?» y
 * quedara a un paso de leerse como «falta la migración». Quitándola, el nombre
 * tiene que venir del mensaje de PostgREST, que es quien sabe la verdad.
 */
function errorDeLectura(e: unknown): { code?: string; message: string } {
  const crudo = e instanceof Error ? e.message : String(e);
  return { message: crudo.replace(`${TABLA_CORRECCIONES} (rango): `, "") };
}

/** Todas las correcciones de una persona en un día, ANULADAS INCLUIDAS. Es el
 *  historial que se muestra al corregir: quién tocó qué y quién lo deshizo. */
export interface CorreccionHistorial extends Correccion {
  anuladaEn: string | null;
  anuladaPor: string | null;
}

export async function leerHistorialDelDia(
  codigo: string,
  fecha: string,
): Promise<{ historial: CorreccionHistorial[]; faltaMigracion: boolean }> {
  const { data, error } = await supabaseServer
    .from(TABLA_CORRECCIONES)
    .select(`${cols()}, anulada_en, anulada_por`)
    .eq("empleado_codigo", codigo)
    .eq("fecha", fecha)
    .order("creada_en", { ascending: false });

  if (error) {
    // El mismo orden que arriba: la columna antes que la tabla.
    if (hayColumnaQuita !== false && esColumnaFaltante(error, "quita")) {
      hayColumnaQuita = false;
      return leerHistorialDelDia(codigo, fecha);
    }
    if (esTablaFaltante(error, TABLA_CORRECCIONES)) {
      return { historial: [], faltaMigracion: true };
    }
    throw new Error(error.message);
  }
  const filas = (data ?? []) as unknown as Array<
    FilaCorreccion & { anulada_en: string | null; anulada_por: string | null }
  >;
  return {
    historial: filas.map((f) => ({
      ...aCorreccion(f),
      anuladaEn: f.anulada_en ?? null,
      anuladaPor: f.anulada_por ?? null,
    })),
    faltaMigracion: false,
  };
}

/**
 * Los motivos más usados de los últimos 90 días, para los botones de la ventana
 * (11-sep-2026). SOLO LECTURA de `motivo` y `creada_en`; la regla entera vive
 * en `motivos-frecuentes.ts`. Sin la tabla (o si falla la lectura) devuelve
 * vacío: la ventana sigue sirviendo con el campo libre, que es lo que se guarda.
 */
export async function leerMotivosFrecuentes(hoy = hoyPanama()): Promise<string[]> {
  try {
    const { data, error } = await supabaseServer
      .from(TABLA_CORRECCIONES)
      .select("motivo, creada_en")
      .gte("creada_en", `${desdeDeLaVentana(hoy)}T00:00:00-05:00`)
      .order("creada_en", { ascending: false })
      .limit(1000);
    if (error) {
      if (esTablaFaltante(error, TABLA_CORRECCIONES)) return [];
      throw new Error(error.message);
    }
    const filas = (data ?? []) as Array<{ motivo: string; creada_en: string }>;
    return motivosFrecuentes(
      filas.map((f) => ({ motivo: String(f.motivo ?? ""), creadaEn: String(f.creada_en ?? "") })),
      hoy,
    );
  } catch (e) {
    console.error("[asistencia/correcciones motivos]", e instanceof Error ? e.message : String(e));
    return [];
  }
}

export interface NuevaCorreccion {
  marcacionId: string | null;
  empleadoCodigo: string;
  fecha: string;
  /** `null` SOLO con `quita`: una marcación que se quita no tiene hora nueva. */
  hora: string | null;
  motivo: string;
  creadaPor: string;
  /** 🔴 La tercera forma: la marcación deja de contar. Exige `marcacionId`. */
  quita?: boolean;
}

export type ResultadoEscritura =
  | { ok: true; id: string }
  | { ok: false; faltaMigracion: true }
  | { ok: false; faltaMigracion: false; error: string };

/**
 * Guardar una corrección.
 *
 * 🔴 Es un INSERT y nada más: esta función NO puede tocar
 * `asistencia_marcaciones`, y hay un barrido estático que pone el build rojo si
 * alguien la hace tocarla.
 */
export async function crearCorreccion(c: NuevaCorreccion): Promise<ResultadoEscritura> {
  const { data, error } = await supabaseServer
    .from(TABLA_CORRECCIONES)
    .insert({
      marcacion_id: c.marcacionId,
      empleado_codigo: c.empleadoCodigo,
      fecha: c.fecha,
      hora: c.hora,
      motivo: c.motivo,
      creada_por: c.creadaPor,
      // ⚠️ La columna viaja SOLO cuando se quita. Mandar `quita: false` en toda
      // corrección rompería el alta mientras la migración no corra, y hoy se
      // corrigen horas todos los días.
      ...(c.quita ? { quita: true } : {}),
    })
    .select("id")
    .single();

  if (error) {
    if (esTablaFaltante(error, TABLA_CORRECCIONES)) {
      return { ok: false, faltaMigracion: true };
    }
    // 23505 = unique_violation. Es el índice que garantiza UNA corrección viva
    // por marcación; se traduce a algo que una persona entiende.
    if (String(error.code) === "23505") {
      return {
        ok: false,
        faltaMigracion: false,
        error: "Esa marcación ya tiene una corrección. Deshaz la anterior antes de poner otra.",
      };
    }
    return { ok: false, faltaMigracion: false, error: error.message };
  }
  return { ok: true, id: String((data as { id: string }).id) };
}

/**
 * Deshacer: la corrección se ANULA, nunca se borra.
 *
 * 🔴 Un UPDATE sobre `asistencia_correcciones` —NO sobre las marcaciones—, y
 * solo sobre las columnas de la anulación. La hora corregida, el motivo y la
 * firma original quedan: sin eso, deshacer borraría la prueba de que alguien
 * corrigió, que es la mitad de para lo que existe la tabla.
 */
export async function anularCorreccion(
  id: string,
  quien: string,
): Promise<ResultadoEscritura> {
  const { data, error } = await supabaseServer
    .from(TABLA_CORRECCIONES)
    .update({ anulada_en: new Date().toISOString(), anulada_por: quien })
    .eq("id", id)
    .is("anulada_en", null)
    .select("id")
    .maybeSingle();

  if (error) {
    if (esTablaFaltante(error, TABLA_CORRECCIONES)) {
      return { ok: false, faltaMigracion: true };
    }
    return { ok: false, faltaMigracion: false, error: error.message };
  }
  if (!data) {
    return {
      ok: false,
      faltaMigracion: false,
      error: "Esa corrección ya se había deshecho.",
    };
  }
  return { ok: true, id: String((data as { id: string }).id) };
}

/** La marcación que se quiere corregir, para poder validar contra ella. */
export interface MarcacionParaCorregir {
  id: string;
  empleadoCodigo: string;
  ocurrioEn: string;
}

/**
 * Leer UNA marcación. Solo lectura — es lo único que este módulo le hace a
 * `asistencia_marcaciones`, y es lo que permite validar que la corrección
 * apunta a la persona y al día que dice.
 */
export async function leerMarcacion(id: string): Promise<MarcacionParaCorregir | null> {
  const { data, error } = await supabaseServer
    .from("asistencia_marcaciones")
    .select("id, empleado_codigo, ocurrio_en")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const f = data as { id: string; empleado_codigo: string | null; ocurrio_en: string };
  return {
    id: String(f.id),
    empleadoCodigo: String(f.empleado_codigo ?? "").trim(),
    ocurrioEn: String(f.ocurrio_en),
  };
}
