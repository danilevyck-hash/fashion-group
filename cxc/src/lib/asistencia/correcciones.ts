/* ─────────────────────────────────────────────────────────────────────────────
 * CORREGIR UNA MARCACIÓN SIN TOCAR LA MARCACIÓN — el motor, PURO.
 *
 * Sin base, sin red, sin `new Date()` sobre el reloj de la máquina. Todo lo que
 * decide qué hora vale para el cálculo vive acá y se prueba sin Supabase.
 *
 * ── 🔴 LA REGLA QUE NO SE NEGOCIA ───────────────────────────────────────────
 *
 * `asistencia_marcaciones` es lo que dijo el reloj y es la única prueba de a qué
 * hora entró una persona — o sea que define un pago. NUNCA se edita ni se
 * borra. La corrección va ENCIMA: este módulo produce la lista de marcaciones
 * EFECTIVA (una copia, con las horas corregidas) y, al lado, el detalle de qué
 * se corrigió para que la pantalla pueda mostrar las DOS horas.
 *
 * ── LAS DOS FORMAS DE CORRECCIÓN, y por qué la segunda es la más usada ───────
 *
 *   1. PISAR la hora de una marcación que sí existe (`marcacionId` con valor).
 *   2. AGREGAR una marcación que el reloj nunca registró (`marcacionId` null).
 *
 * La 2 es el caso que Daniel no nombró y es el más común: quien OLVIDÓ marcar
 * no tiene registro que corregir. Medido en producción el 13-ago-2026 sobre las
 * 3.894 marcaciones cargadas: 231 de 1.020 días-persona mal marcados (22,6%),
 * 97 de ellos con un número IMPAR de marcas.
 *
 * ── 🔑 UNA CORRECCIÓN NO PUEDE MOVER UNA MARCACIÓN DE DÍA ───────────────────
 *
 * Para la forma 1 el día sale de la MARCACIÓN (`diaPanama(ocurrio_en)`), no del
 * campo `fecha` de la corrección. Así, corregir la hora no puede sacarle horas a
 * un día para metérselas a otro — que sería mover plata entre dos quincenas sin
 * que nada lo avise. El `fecha` guardado se valida contra eso al escribir.
 * ────────────────────────────────────────────────────────────────────────── */

import { diaPanama, type Marcacion } from "./reporte";

/** Panamá es UTC−5 fijo, sin horario de verano. La misma constante del motor. */
const PANAMA = "-05:00";

export const TABLA_CORRECCIONES = "asistencia_correcciones";
export const MIGRACION_CORRECCIONES = "20260813150000_asistencia_correcciones.sql";

/** El mensaje que ve la gente cuando falta correr el SQL. Sin jerga de base. */
export function avisoMigracionCorrecciones(): string {
  return `Todavía no se puede corregir marcaciones aquí. Pídele a Daniel que corra el archivo ${MIGRACION_CORRECCIONES} en Supabase.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS DATOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una marcación con su `id`.
 *
 * 🩸 El `id` no estaba en el `select` de ninguna ruta: se agregó para poder
 * atar la corrección a SU marcación. Es opcional en el tipo para que cualquier
 * consumidor viejo (y los tests del motor) sigan compilando sin tocarse.
 */
export interface MarcacionConId extends Marcacion {
  id?: string | null;
}

/** Una corrección guardada, ya viva (las anuladas no llegan hasta acá). */
export interface Correccion {
  id: string;
  /** `null` = marcación que el reloj nunca registró. */
  marcacionId: string | null;
  empleadoCodigo: string;
  /** YYYY-MM-DD, día-calendario de Panamá. */
  fecha: string;
  /** "HH:MM:SS". */
  hora: string;
  motivo: string;
  creadaPor: string;
  /** ISO. */
  creadaEn: string;
}

/**
 * Una corrección tal como se VE en el reporte: con la hora del reloj al lado,
 * para que nadie tenga que confiar en la corregida a ciegas.
 */
export interface CorreccionVisible {
  id: string;
  /** La hora que MANDA para el cálculo. "HH:MM:SS". */
  hora: string;
  /** Lo que dijo el reloj. `null` cuando la marcación fue AGREGADA. */
  relojHora: string | null;
  /** `true` = el reloj nunca registró esta marcación; se agregó a mano. */
  agregada: boolean;
  motivo: string;
  creadaPor: string;
  creadaEn: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN — la misma para la pantalla y para el servidor
//
// 🔑 Vive acá, en el módulo puro, y la usan LOS DOS. Si la pantalla validara por
// su cuenta, el botón se pondría verde y el servidor rechazaría igual (o, peor,
// al revés: la pantalla dejaría pasar algo que el servidor guarda mal).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Sirve este motivo?
 *
 * 🔴 VACÍO O SOLO ESPACIOS NO SIRVE, y no es una formalidad: `NOT NULL` en la
 * base deja pasar `""` y `"   "`, que es exactamente lo que teclea quien quiere
 * saltarse el campo. Es la misma condición que el CHECK de la migración.
 */
export function motivoValido(motivo: unknown): boolean {
  return typeof motivo === "string" && motivo.trim().length > 0;
}

/** El motivo como se guarda: sin espacios de sobra y acotado. */
export const MOTIVO_MAX = 300;
export function normalizarMotivo(motivo: unknown): string {
  return String(motivo ?? "").trim().slice(0, MOTIVO_MAX);
}

/**
 * "8:00" · "08:00" · "8:00:00" → "08:00:00". `null` si no es una hora del día.
 *
 * ⚠️ Acepta segundos porque el módulo mide al segundo: forzar "HH:MM" haría que
 * corregir una marcación le borrara los segundos, o sea que "corregir" perdería
 * precisión — justo lo contrario de para lo que existe.
 */
export function normalizarHora(hora: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(hora ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] === undefined ? 0 : Number(m[3]);
  if (h > 23 || mi > 59 || s > 59) return null;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(h)}:${p2(mi)}:${p2(s)}`;
}

/** "2026-08-07" y que sea una fecha de verdad (no "2026-02-31"). */
export function fechaValida(fecha: unknown): boolean {
  const s = String(fecha ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return (
    dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/**
 * Día de Panamá + hora → el instante ISO que entiende el motor.
 *
 * 🔑 El motor lee `segundosDelDia(iso)` restándole 5 horas fijas al instante, así
 * que este ida-y-vuelta es exacto: lo que se guarda como 08:00:00 se calcula
 * como las 8:00:00 de Panamá, sin importar dónde corra el servidor.
 */
export function instantePanama(fecha: string, hora: string): string {
  return new Date(Date.parse(`${fecha}T${hora}${PANAMA}`)).toISOString();
}

/** El instante de una marcación, como "HH:MM:SS" de Panamá. */
export function horaPanamaConSegundos(iso: string): string {
  const d = new Date(Date.parse(iso) - 5 * 3600_000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** La llave del índice por día: código de la persona + día de Panamá. */
export function llaveDia(codigo: string, fecha: string): string {
  return `${codigo}|${fecha}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// APLICAR
// ─────────────────────────────────────────────────────────────────────────────

export interface MarcacionesEfectivas {
  /** La lista que va al motor: una COPIA con las horas corregidas. */
  marcaciones: MarcacionConId[];
  /** `codigo|fecha` → qué se corrigió ese día. Para que el reporte lo muestre. */
  porDia: Map<string, CorreccionVisible[]>;
}

/**
 * La lista de marcaciones EFECTIVA: lo que dijo el reloj, con las correcciones
 * encima.
 *
 * 🔴 NO MUTA NADA de lo que recibe. La marcación original se copia y se le
 * cambia `ocurrio_en` en la copia: el arreglo que entró queda intacto, igual que
 * la fila de la base.
 *
 * ⚠️ Una corrección cuyo `marcacionId` no está en la lista se IGNORA — es una
 * marcación fuera del rango que se pidió, no un error.
 */
export function aplicarCorrecciones(
  marcaciones: readonly MarcacionConId[],
  correcciones: readonly Correccion[],
): MarcacionesEfectivas {
  const porId = new Map<string, Correccion>();
  const agregadas: Correccion[] = [];
  for (const c of correcciones) {
    if (c.marcacionId) porId.set(c.marcacionId, c);
    else agregadas.push(c);
  }

  const porDia = new Map<string, CorreccionVisible[]>();
  const anotar = (codigo: string, fecha: string, v: CorreccionVisible) => {
    const k = llaveDia(codigo, fecha);
    const lista = porDia.get(k);
    if (lista) lista.push(v);
    else porDia.set(k, [v]);
  };

  const salida: MarcacionConId[] = [];
  for (const m of marcaciones) {
    const c = m.id ? porId.get(String(m.id)) : undefined;
    if (!c || !m.ocurrio_en) {
      salida.push(m);
      continue;
    }
    // 🔑 EL DÍA SALE DE LA MARCACIÓN, no de la corrección. Ver el encabezado:
    // corregir la hora no puede mover horas de una quincena a otra.
    const dia = diaPanama(m.ocurrio_en);
    salida.push({ ...m, ocurrio_en: instantePanama(dia, c.hora) });
    anotar((m.empleado_codigo ?? c.empleadoCodigo ?? "").trim(), dia, {
      id: c.id,
      hora: c.hora,
      relojHora: horaPanamaConSegundos(m.ocurrio_en),
      agregada: false,
      motivo: c.motivo,
      creadaPor: c.creadaPor,
      creadaEn: c.creadaEn,
    });
  }

  for (const c of agregadas) {
    salida.push({
      // 🩸 Sin `id` a propósito: esta marcación NO existe en
      // `asistencia_marcaciones` y darle uno inventado la haría parecer real.
      empleado_codigo: c.empleadoCodigo,
      empleado_nombre: null,
      ocurrio_en: instantePanama(c.fecha, c.hora),
    });
    anotar(c.empleadoCodigo, c.fecha, {
      id: c.id,
      hora: c.hora,
      relojHora: null,
      agregada: true,
      motivo: c.motivo,
      creadaPor: c.creadaPor,
      creadaEn: c.creadaEn,
    });
  }

  // Las correcciones de un día se leen en orden de hora: es como se lee el día.
  for (const lista of porDia.values()) lista.sort((a, b) => a.hora.localeCompare(b.hora));

  return { marcaciones: salida, porDia };
}

/**
 * Cuántas correcciones vivas hay en el mapa. Es lo que la pantalla pinta arriba
 * de la tabla para que nadie lea un total sin enterarse de que hay horas
 * tocadas a mano.
 */
export function contarCorrecciones(porDia: ReadonlyMap<string, readonly CorreccionVisible[]>): {
  correcciones: number;
  dias: number;
  agregadas: number;
} {
  let correcciones = 0;
  let agregadas = 0;
  let dias = 0;
  for (const lista of porDia.values()) {
    if (lista.length === 0) continue;
    dias += 1;
    correcciones += lista.length;
    agregadas += lista.filter((c) => c.agregada).length;
  }
  return { correcciones, dias, agregadas };
}
