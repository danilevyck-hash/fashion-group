// ─────────────────────────────────────────────────────────────────────────────
// LOS DOS DATOS DE LA FICHA QUE SOLO EXISTEN PARA EL PAPEL.
//
// Módulo PURO. Mismo patrón que `seguros-base.ts` o `sueldo-fijo.ts`: el nombre
// de la columna y el módulo que la sabe leer viven juntos, para que un `select`
// no pueda quedarse atrás de la migración.
//
// ── 🩸 POR QUÉ HACÍAN FALTA ─────────────────────────────────────────────────
//
// El comprobante de pago que la contadora arma a mano imprime «POSICION
// DESEMPEÑADA» y, al pie, la cédula de quien firma. Los dos salen impresos en
// las 34 hojas de julio de 2026 y **ninguno de los dos existía en el sistema**.
// Sin ellos el papel saldría con dos renglones que nadie puede llenar desde la
// app — y llenarlos adivinando («Asistente» porque el nombre suena a bodega) es
// exactamente lo que este repo no hace.
//
// 🔴 NINGUNO TOCA EL CÁLCULO. No entran en la rata, ni en el bruto, ni en el
// neto. Son dos textos que se imprimen.
//
// 🔴 LA FOTO DE LA CÉDULA SE CARGA UNA SOLA VEZ, EN LA FICHA (Daniel), y de ahí
// se usa siempre. Por eso vive con la persona y no con la quincena.
// ─────────────────────────────────────────────────────────────────────────────

/** El cargo que sale impreso en «POSICION DESEMPEÑADA». */
export const COLUMNA_POSICION = "posicion";
/** La cédula, para el pie del comprobante. */
export const COLUMNA_CEDULA = "cedula";
/** La ruta en Storage de la foto de la cédula. */
export const COLUMNA_CEDULA_FOTO = "cedula_foto_path";

/** Las tres, para el `select`. Un solo lugar. */
export const COLUMNAS_DEL_PAPEL = [
  COLUMNA_POSICION,
  COLUMNA_CEDULA,
  COLUMNA_CEDULA_FOTO,
] as const;

/** Cuánto se admite. Un cargo de 200 letras no es un cargo. */
export const POSICION_MAX = 60;
export const CEDULA_MAX = 30;

/**
 * Limpia un texto de la ficha.
 *
 * 🔴 VACÍO ES `null`, NUNCA `""`. La base tiene un CHECK que rechaza la cadena
 * vacía, y con razón: `""` es un dato cargado que no dice nada, y en el papel se
 * leería igual que «todavía no se cargó» sin serlo.
 *
 * ⚠️ NO se capitaliza ni se corrige nada. Lo que la contadora escriba es lo que
 * sale impreso: es su papel.
 */
export function textoDeFicha(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.slice(0, max);
}

export function posicionDeFicha(v: unknown): string | null {
  return textoDeFicha(v, POSICION_MAX);
}

export function cedulaDeFicha(v: unknown): string | null {
  return textoDeFicha(v, CEDULA_MAX);
}

/**
 * Lo que el comprobante escribe en «POSICION DESEMPEÑADA» cuando la ficha no
 * lo trae.
 *
 * 🔑 UN GUION, no una invención y no un renglón escondido. El renglón se dibuja
 * igual —es la regla del papel— y el guion dice, sin ambigüedad, que ese dato
 * todavía no está cargado.
 */
export const SIN_POSICION = "—";
