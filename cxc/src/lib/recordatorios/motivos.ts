/**
 * LOS MOTIVOS DE UN RECORDATORIO — **módulo PURO** (sin base, sin React).
 *
 * ── DE DÓNDE SALE, TEXTUAL ───────────────────────────────────────────────────
 *
 * Daniel, 22-sep-2026: ***«cheque es un motivo de recordatorio»***.
 *
 * Con esa frase el módulo deja de ser dos cosas pegadas que no se conocen —un
 * botón «Nuevo Cheque» arriba a la derecha y una caja «¿Qué te recuerdo?» que
 * se llevaba todo el ancho y nueve botones— y pasa a ser UNA puerta: se toca
 * «＋ Recordar», se elige el MOTIVO, y el formulario pide lo que ese motivo
 * necesita.
 *
 * ── 🔴 EL FRENO MÁS IMPORTANTE: NADA SE FUSIONA ──────────────────────────────
 *
 * Lo que se unificó es **la PANTALLA y el FORMULARIO**, no el almacenamiento.
 * `cheques` y `recordatorios` siguen existiendo tal cual, con sus columnas y sus
 * filas: **el motivo es lo que decide en cuál se guarda**, y esa decisión vive
 * acá, en `TABLA_DE_MOTIVO`, una sola vez. No hay migración, no hay columna
 * nueva y no se dropea nada — el motivo se DERIVA de en qué tabla vive la fila
 * (`motivoDeItem`), que es un dato que ya existe y no se puede desincronizar.
 *
 * ── 🔴 POR QUÉ SON DOS Y NO CINCO ────────────────────────────────────────────
 *
 * Los motivos que existen hoy son **dos**: `cheque` y `nota`. Se le preguntó a
 * Daniel qué otros usaría y **todavía no contestó**, así que **no se inventa
 * ninguno**. Lo que sí se construyó es el mecanismo: agregar un motivo es
 * agregar una entrada a `FICHA_MOTIVO` (label, icono, tabla, qué pide) y el
 * formulario que lo atiende. La puerta, la lista, los iconos y el cron salen de
 * esta lista, no de un `if` repartido por la pantalla.
 *
 * ── LA LISTA ES UNA SOLA ─────────────────────────────────────────────────────
 *
 * Los dos motivos conviven en la MISMA lista (`agenda.ts`), ordenados por fecha,
 * y lo único que los distingue es el ICONO de esta ficha. Que la lista se vuelva
 * a partir en dos es exactamente lo que los candados de este archivo impiden.
 */

/** Los motivos que existen, en el orden en que se ofrecen. Lista CERRADA. */
export const MOTIVOS = ["cheque", "nota"] as const;
export type Motivo = (typeof MOTIVOS)[number];

/** Las DOS tablas del módulo. Ninguna se fusiona con la otra. */
export const TABLAS_DEL_MODULO = ["cheques", "recordatorios"] as const;
export type TablaDelModulo = (typeof TABLAS_DEL_MODULO)[number];

/**
 * 🔴 EN QUÉ TABLA SE GUARDA CADA MOTIVO. Una sola vez, acá.
 *
 * Escrito en cada formulario por su lado, el día que se agregue un motivo nuevo
 * alguien lo va a mandar a la tabla equivocada y nadie se va a enterar hasta que
 * el aviso de las 9:00 deje de nombrarlo.
 */
export const TABLA_DE_MOTIVO: Record<Motivo, TablaDelModulo> = {
  cheque: "cheques",
  nota: "recordatorios",
};

/** A qué ruta le escribe cada motivo. Se deriva de la tabla, no se repite. */
export const RUTA_DE_TABLA: Record<TablaDelModulo, string> = {
  cheques: "/api/cheques",
  recordatorios: "/api/recordatorios",
};

export interface FichaMotivo {
  motivo: Motivo;
  /** Lo que se lee en la puerta y en la lista. Español simple, tuteo. */
  label: string;
  /** El icono que dice el motivo de un vistazo, en la puerta y en la fila. */
  icono: string;
  /** Dónde se guarda. Ver `TABLA_DE_MOTIVO`. */
  tabla: TablaDelModulo;
  /** Una línea que dice qué va a pasar si se elige. Sin jerga. */
  queHace: string;
  /** Lo que el formulario pide, con el nombre que se lee en pantalla. */
  pide: readonly string[];
}

export const FICHA_MOTIVO: Record<Motivo, FichaMotivo> = {
  cheque: {
    motivo: "cheque",
    label: "Cheque",
    icono: "💵",
    tabla: TABLA_DE_MOTIVO.cheque,
    queHace: "Te aviso el día que se puede depositar.",
    pide: ["Cliente", "Monto", "Fecha en que se puede depositar"],
  },
  nota: {
    motivo: "nota",
    label: "Nota",
    icono: "🔔",
    tabla: TABLA_DE_MOTIVO.nota,
    queHace: "Te aviso el día que elijas, a las 9:00 de la mañana.",
    pide: ["Qué hay que recordar", "Fecha"],
  },
};

/** Las fichas, en el orden en que se ofrecen. Deriva de `MOTIVOS`. */
export const MOTIVOS_EN_ORDEN: readonly FichaMotivo[] = MOTIVOS.map((m) => FICHA_MOTIVO[m]);

export function esMotivo(v: unknown): v is Motivo {
  return typeof v === "string" && (MOTIVOS as readonly string[]).includes(v);
}

export function tablaDelMotivo(m: Motivo): TablaDelModulo {
  return TABLA_DE_MOTIVO[m];
}

export function rutaDelMotivo(m: Motivo): string {
  return RUTA_DE_TABLA[tablaDelMotivo(m)];
}

/**
 * El motivo de una fila de la agenda. Se DERIVA de qué clase de fila es —o sea,
 * de en qué tabla vive—, nunca de una columna guardada: una columna `motivo` se
 * podría contradecir con la tabla y habría que elegir a cuál creerle.
 */
export function motivoDeItem(item: { tipo: "cheque" | "recordatorio" }): Motivo {
  return item.tipo === "cheque" ? "cheque" : "nota";
}

/** El icono que le toca a una fila de la agenda. */
export function iconoDeItem(item: { tipo: "cheque" | "recordatorio" }): string {
  return FICHA_MOTIVO[motivoDeItem(item)].icono;
}
