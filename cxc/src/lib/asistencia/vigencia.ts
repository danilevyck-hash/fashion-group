/* ─────────────────────────────────────────────────────────────────────────────
 * ALTAS Y BAJAS — desde cuándo y hasta cuándo una ficha entra en una quincena.
 *
 * Módulo PURO: sin base, sin red y sin `new Date()`. El "hoy" entra por
 * parámetro para que los tests no dependan del reloj de la máquina.
 *
 * ── 🩸 POR QUÉ LA BAJA ES UNA FECHA Y NO UN BORRADO ──────────────────────────
 *
 * Borrar la ficha de quien se fue se lleva el nombre, el salario y la empresa:
 * o sea, TODO lo que hace falta para volver a armar una quincena vieja. Una
 * planilla cerrada tiene que poder reimprimirse igual dentro de dos años, y sin
 * ficha la de julio —en la que esa persona SÍ trabajó— saldría con "sin ficha en
 * Configuración" y sin un dólar calculado. La baja es un dato histórico.
 *
 * Y tampoco es un booleano `activo`: un booleano NO TIENE MEMORIA. Apagarlo
 * borraría a la persona de TODAS las quincenas, incluidas aquellas en las que
 * trabajó y se le debe la plata. Con una fecha, el MISMO dato responde las dos
 * preguntas —desaparece de las posteriores, sigue entera en las suyas— y por eso
 * dar de baja a alguien hoy no puede mover un solo número de una quincena vieja.
 *
 * ── 🩸 POR QUÉ ESTO NO VIVE EN `planilla.ts` ─────────────────────────────────
 *
 * `planilla.ts` es el MOTOR: convierte minutos en dólares. Quién entra a la
 * lista es una pregunta de otra capa —la que junta las fichas— y meterla adentro
 * del motor obligaría a que cada cálculo cargue con un concepto de calendario
 * que no usa para multiplicar nada. Acá se decide QUIÉNES; allá, CUÁNTO.
 *
 * ── ⚠️ EL MOTIVO SE GUARDA Y EL CÁLCULO LO IGNORA, A PROPÓSITO ───────────────
 *
 * Daniel, textual: *"normalmente nadie desaparece, o renuncia o lo despedimos"*.
 * Para la quincena los tres motivos son IDÉNTICOS: lo único que decide quién
 * entra es la fecha, y no hay un solo `if` por motivo en el camino del cálculo.
 * Se guarda para LA LIQUIDACIÓN, donde la diferencia sí es de plata (un despido
 * injustificado paga indemnización; una renuncia, no). Es un campo que se llena
 * hoy para el cálculo de mañana — no es un campo muerto.
 * ────────────────────────────────────────────────────────────────────────── */

import type { Resultado } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// EL DATO
// ─────────────────────────────────────────────────────────────────────────────

/** Los tres motivos que existen en el negocio. Lista cerrada: la liquidación va
 *  a preguntar exactamente esto, y un texto libre devuelve "renuncio", "RENUNCIA
 *  voluntaria" y "se fue" para la misma cosa. */
export const MOTIVOS_SALIDA = ["renuncia", "despido", "otro"] as const;
export type MotivoSalida = (typeof MOTIVOS_SALIDA)[number];

/** Cómo se le dice a cada motivo en la pantalla. En español simple. */
export const ETIQUETA_MOTIVO: Record<MotivoSalida, string> = {
  renuncia: "Renunció",
  despido: "Despedido",
  otro: "Salió",
};

/** Lo que se elige al dar de baja, dicho como lo diría Daniel. */
export const OPCION_MOTIVO: Record<MotivoSalida, string> = {
  renuncia: "Renunció",
  despido: "Lo despedimos",
  otro: "Otro",
};

/**
 * Desde cuándo y hasta cuándo trabaja una persona. Las dos vacías es el caso
 * normal y significa "trabaja acá desde siempre y sigue" — por eso la migración
 * se puede correr sin tocar ninguna de las 32 fichas que ya existen.
 */
export interface Vigencia {
  /** Primer día de trabajo (YYYY-MM-DD). `null` = desde siempre. */
  fechaIngreso: string | null;
  /** Último día de trabajo (YYYY-MM-DD). `null` = sigue trabajando. */
  fechaSalida: string | null;
  /** Por qué salió. Va SIEMPRE con la fecha: los dos, o ninguno. */
  motivoSalida: MotivoSalida | null;
}

export const VIGENCIA_ACTIVA: Vigencia = {
  fechaIngreso: null,
  fechaSalida: null,
  motivoSalida: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// FECHAS
//
// Se comparan como TEXTO y eso es correcto a propósito: en `YYYY-MM-DD` el orden
// alfabético es el orden cronológico, así que no hace falta construir un `Date`
// —que además metería la zona horaria en una comparación de días de calendario,
// que es justo el bug clásico de este repo (`timestamptz` vs `date` pelado)—.
// ─────────────────────────────────────────────────────────────────────────────

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * ¿Es una fecha de calendario de verdad? El formato no alcanza: `2026-02-31`
 * pasa la expresión regular y no existe. Se reconstruye y se compara.
 */
export function esFechaValida(v: unknown): v is string {
  const s = typeof v === "string" ? v.trim() : "";
  const m = FORMATO.exec(s);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (anio < 2000 || anio > 2099 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
  );
}

/** Los meses en español. 🔑 Son los mismos de `planilla.ts`, que no los exporta
 *  y no se toca por regla del módulo; son doce palabras, no una regla de negocio. */
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-08-12" → "12 de agosto de 2026". Lo que lee una persona, no una máquina. */
export function fechaLegible(fecha: string | null | undefined): string {
  if (!esFechaValida(fecha)) return "";
  const m = FORMATO.exec(String(fecha).trim())!;
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA REGLA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Esta ficha entra a la quincena `[desde, hasta]`?
 *
 * Entra SALVO que:
 *   · se haya ido ANTES de que empezara la quincena (`fechaSalida < desde`), o
 *   · haya entrado DESPUÉS de que terminara (`fechaIngreso > hasta`).
 *
 * 🔑 Las dos comparaciones son ESTRICTAS y de ahí sale lo que Daniel pidió: quien
 * sale el 20 y la quincena va del 16 al 31 **sigue apareciendo entera en ésa**
 * —se le deben esos días— y desaparece recién de la siguiente.
 *
 * Sin ficha (`null`) entra siempre: son los códigos que marcan y todavía no
 * tienen ficha (48 a 53). Filtrarlos acá los borraría de todas las pantallas.
 */
export function trabajaEnRango(
  v: Vigencia | null | undefined,
  desde: string,
  hasta: string,
): boolean {
  if (!v) return true;
  if (esFechaValida(v.fechaSalida) && v.fechaSalida! < desde) return false;
  if (esFechaValida(v.fechaIngreso) && v.fechaIngreso! > hasta) return false;
  return true;
}

/**
 * Los códigos que NO entran a esta quincena.
 *
 * Devuelve un conjunto en vez de filtrar el mapa a propósito: la capa que arma
 * la planilla tiene que sacar a esa gente de DOS listas —las fichas y lo que
 * salió del reloj— y con un solo conjunto no puede quedar una sí y otra no.
 */
export function codigosFueraDeRango(
  vigencias: ReadonlyMap<string, Vigencia>,
  desde: string,
  hasta: string,
): Set<string> {
  const fuera = new Set<string>();
  for (const [codigo, v] of vigencias) {
    if (!trabajaEnRango(v, desde, hasta)) fuera.add(codigo);
  }
  return fuera;
}

/** ¿Ya tiene fecha de salida puesta? (Aunque sea de mañana: la baja ya se cargó.) */
export function tieneBaja(v: Vigencia | null | undefined): boolean {
  return !!v && esFechaValida(v.fechaSalida);
}

/**
 * Cómo se lee la baja en Configuración: «Renunció el 12 de agosto de 2026».
 * `null` si la persona sigue trabajando.
 *
 * Con una fecha futura se dice en futuro —«Renuncia el 20 de agosto»— porque una
 * baja cargada por adelantado es un caso real (el aviso de renuncia se da antes)
 * y decir "renunció" de algo que todavía no pasó confunde a quien lo lee.
 */
export function fraseBaja(v: Vigencia | null | undefined, hoy: string): string | null {
  if (!tieneBaja(v)) return null;
  const fecha = v!.fechaSalida!;
  const motivo = v!.motivoSalida ?? "otro";
  const futura = esFechaValida(hoy) && fecha > hoy;
  const verbo =
    motivo === "renuncia"
      ? futura ? "Renuncia" : "Renunció"
      : motivo === "despido"
        ? futura ? "Lo despedimos" : "Despedido"
        : futura ? "Sale" : "Salió";
  return `${verbo} el ${fechaLegible(fecha)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL AVISO QUE NO SE PUEDE ESCONDER
// ─────────────────────────────────────────────────────────────────────────────

/** Una persona dada de baja que igual marcó después. */
export interface MarcaPosterior {
  /** Lo que se muestra: el nombre, o el código. Nunca vacío. */
  etiqueta: string;
  fechaSalida: string;
  /** El último día que marcó (YYYY-MM-DD). */
  ultimaMarca: string;
}

/**
 * ¿Marcó DESPUÉS de la fecha de salida?
 *
 * 🩸 Esto no se esconde nunca. Solo hay dos explicaciones y las dos importan:
 * o la persona volvió y hay que reactivarla —si no, la planilla le va a pagar
 * cero— o alguien más está usando su huella, que es un problema bastante peor.
 * Callarlo sería exactamente lo contrario de lo que hace este módulo: la baja
 * saca a la persona de la planilla, así que si sigue marcando, hay que decirlo.
 */
export function marcoDespuesDeLaBaja(
  v: Vigencia | null | undefined,
  ultimaMarca: string | null | undefined,
): boolean {
  if (!tieneBaja(v)) return false;
  if (!esFechaValida(ultimaMarca)) return false;
  return String(ultimaMarca).trim() > v!.fechaSalida!;
}

/**
 * El último día en que esa persona marcó algo, dentro de lo que se le pasa.
 * `null` si no marcó nada.
 *
 * 🔑 Un día SIN marcas no cuenta: el motor del reporte devuelve todos los días
 * del rango —incluidos los ausentes y los domingos— así que mirar la última
 * fecha de la lista diría "marcó el 31" de alguien que no aparece desde el 12.
 */
export function ultimoDiaConMarcas(
  dias: readonly { fecha: string; marcas: readonly string[] }[] | null | undefined,
): string | null {
  let ultimo: string | null = null;
  for (const d of dias ?? []) {
    if (!d?.marcas?.length) continue;
    if (ultimo === null || d.fecha > ultimo) ultimo = d.fecha;
  }
  return ultimo;
}

export interface AvisoMarcasPosteriores {
  titulo: string;
  detalle: string[];
}

/**
 * El aviso de Configuración. `null` cuando no hay nada que avisar — un cartel
 * permanente es un cartel que se deja de leer (misma regla que
 * `configuracion-avisos.ts`).
 */
export function avisoMarcasPosteriores(
  casos: readonly MarcaPosterior[],
): AvisoMarcasPosteriores | null {
  if (casos.length === 0) return null;
  const n = casos.length;
  const titulo =
    n === 1
      ? "1 persona dada de baja siguió marcando en el reloj."
      : `${n} personas dadas de baja siguieron marcando en el reloj.`;
  const detalle = casos.map(
    (c) =>
      `${c.etiqueta} salió el ${fechaLegible(c.fechaSalida)} y marcó el `
      + `${fechaLegible(c.ultimaMarca)}: o volvió a trabajar —hay que reactivarla o la `
      + "planilla le va a pagar cero— o alguien más está usando su huella.",
  );
  return { titulo, detalle };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN
//
// Mismo criterio que `config.ts`: el validador recibe `unknown` y convierte él.
// Con un `String(x)` afuera, un `null` llegaría como "null" y pasaría por fecha.
// ─────────────────────────────────────────────────────────────────────────────

function vacio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** Una fecha opcional. Vacía es un valor válido y significa "no aplica". */
export function validarFechaOpcional(v: unknown, que: string): Resultado<string | null> {
  if (vacio(v)) return { ok: true, valor: null };
  if (!esFechaValida(v)) {
    return { ok: false, error: `${que} tiene que ser una fecha como 2026-08-12.` };
  }
  return { ok: true, valor: String(v).trim() };
}

/**
 * La baja completa: fecha + motivo, o nada.
 *
 * 🔑 El motivo es OBLIGATORIO al dar de baja, no un campo que se puede dejar
 * vacío. Daniel: *"normalmente nadie desaparece, o renuncia o lo despedimos"*.
 * Una baja sin motivo es la mitad del dato que la liquidación va a necesitar, y
 * ese dato después no se reconstruye: nadie se acuerda por qué salió alguien
 * hace ocho meses.
 */
export function validarVigencia(body: unknown): Resultado<Vigencia> {
  const b = (body ?? {}) as Record<string, unknown>;

  const ingreso = validarFechaOpcional(b.fechaIngreso, "La fecha de entrada");
  if (!ingreso.ok) return ingreso;
  const salida = validarFechaOpcional(b.fechaSalida, "La fecha de salida");
  if (!salida.ok) return salida;

  const motivoTexto = typeof b.motivoSalida === "string" ? b.motivoSalida.trim() : "";
  const motivo = (MOTIVOS_SALIDA as readonly string[]).includes(motivoTexto)
    ? (motivoTexto as MotivoSalida)
    : null;

  if (salida.valor === null) {
    // Sin fecha no hay baja: el motivo se descarta en vez de guardarse suelto.
    // Es lo que hace que "reactivar" sea mandar la fecha vacía y nada más.
    return { ok: true, valor: { fechaIngreso: ingreso.valor, fechaSalida: null, motivoSalida: null } };
  }

  if (motivo === null) {
    return {
      ok: false,
      error: "Elige por qué salió: renunció, lo despedimos, u otro.",
    };
  }
  if (ingreso.valor !== null && salida.valor < ingreso.valor) {
    return {
      ok: false,
      error: "La fecha de salida no puede ser anterior a la de entrada.",
    };
  }

  return {
    ok: true,
    valor: { fechaIngreso: ingreso.valor, fechaSalida: salida.valor, motivoSalida: motivo },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿FALTA CORRER LA MIGRACIÓN?
//
// Mismo criterio que `config.ts` y `planilla-server.ts`: en este proyecto los
// DDL los corre Daniel a mano y varios se quedaron pendientes semanas. Sin las
// columnas, TODO lo demás del módulo sigue funcionando —nadie tiene baja, o sea
// que todos están activos, que es exactamente como está hoy— y la pantalla avisa
// qué archivo falta en vez de romperse.
// ─────────────────────────────────────────────────────────────────────────────

export const MIGRACION_BAJAS = "20260807120000_asistencia_altas_bajas.sql";

/** Las columnas nuevas. Se listan acá para que la detección y el `select` no se
 *  puedan separar: si mañana se agrega una tercera, se agrega en un solo lugar. */
export const COLUMNAS_BAJAS = ["fecha_ingreso", "fecha_salida", "motivo_salida"] as const;

interface ErrorPostgrest {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * ¿Este error es "todavía no existen las columnas de la baja"?
 *
 * Es el hermano de `esTablaFaltante` (`config.ts`) un escalón más abajo: allá
 * falta la tabla entera, acá tres columnas. No es una copia distraída —los
 * códigos son OTROS: `42703` es "undefined_column" de Postgres (lo tira el
 * `select`) y `PGRST204` es el de PostgREST cuando la columna no está en su
 * caché de esquema (lo tira el `upsert`).
 *
 * ⚠️ Igual que allá, el error tiene que NOMBRAR una de las columnas. Tragarse
 * cualquier error convertiría un problema real —permisos, red, RLS— en una
 * pantalla que miente diciendo "falta la migración".
 */
export function esColumnaDeBajaFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorPostgrest;
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (!COLUMNAS_BAJAS.some((c) => texto.includes(c))) return false;

  const code = String(e.code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  return /does not exist|no existe|schema cache|could not find/i.test(texto);
}

export function avisoMigracionBajas(): string {
  return (
    "Todavía no se puede dar de baja a nadie: falta preparar la base de datos. "
    + `Pídele a Daniel que corra el archivo ${MIGRACION_BAJAS} en Supabase. `
    + "Mientras tanto todo lo demás funciona igual y todas las personas aparecen como activas."
  );
}
