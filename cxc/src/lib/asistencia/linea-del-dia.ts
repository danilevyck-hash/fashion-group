/* ─────────────────────────────────────────────────────────────────────────────
 * UNA SOLA LÍNEA DEBAJO DEL DÍA (25-sep-2026). Módulo PURO: sin base, sin red,
 * sin `new Date()` y sin un solo número de plata.
 *
 * Daniel, textual, mirando el colaborador abierto: *«¿estas informaciones se
 * pueden resumir? quitar lo obvio, para no ensuciar tanto la pantalla»*.
 *
 * ── 🩸 LO QUE HABÍA ─────────────────────────────────────────────────────────
 *
 * Debajo de CADA día salía una línea POR MARCA, y otra por cada repetida:
 *
 *     Entrada 8:58 a. m. · Marcada sin señal · el teléfono la envió 09:01 · Ver la selfie y el mapa
 *     Salida 6:00 p. m.  · Marcada sin señal · el teléfono la envió 09:01 · Ver la selfie y el mapa
 *     Marca repetida: 18:01:25 — repetida, 12 s después de 18:01:13 — no cuenta
 *
 * Las horas **ya están arriba**, en las cuatro columnas del día (Entrada · Sale
 * almz. · Vuelve · Salida): la sub-fila las repetía una por una. Y «Ver la
 * selfie y el mapa» salía tantas veces como marcas tuviera el día.
 *
 * ── 🔴 LA REGLA ─────────────────────────────────────────────────────────────
 *
 *   1. **Las horas no se repiten.** Están en la fila.
 *   2. **UNA línea por día, y solo si hay algo que decir.** Un día marcado
 *      entero desde el reloj, sin repetidas, **no dibuja nada**.
 *   3. **Las repetidas se cuentan, no se listan**: «· 2 repetidas». El detalle
 *      sigue entero en el Excel (`textoTodasLasMarcasConRepetidas`) y al pasar
 *      el cursor por la línea.
 *   4. **«ver fotos», UNA vez por día.** Son fotos DEL LUGAR, no selfies —
 *      Daniel, 24-sep-2026: *«sus fotos son del lugar, no de su cara»*—, así que
 *      el rótulo «selfie» se fue de la pantalla.
 *
 * 🔴 LA PALABRA «llegó» SIGUE PROHIBIDA. Se dice **«enviada N después»**: la
 * contadora leería «llegó con 3 h de atraso» como que la persona llegó tarde a
 * trabajar, y no — a esa hora el teléfono recién encontró señal. Misma regla y
 * mismo candado que `lib/marcacion/en-el-reporte.ts`.
 *
 * 🔑 NINGÚN NÚMERO CAMBIA: acá no se mide un minuto de planilla, se redacta una
 * línea.
 * ────────────────────────────────────────────────────────────────────────── */

import { cuantoCorrido } from "@/lib/marcacion/marcacion";

/**
 * Desde cuánto atraso se dice que el teléfono tardó en mandarla. Cinco minutos,
 * el MISMO umbral con el que ya se dice que el reloj del teléfono está corrido
 * (`DESFASE_QUE_SE_DICE_MS`): por debajo de eso el envío es instantáneo y
 * decirlo es una palabra de más pegada a un dato.
 */
export const MINUTOS_DE_ATRASO_QUE_SE_DICEN = 5;

/** Lo mínimo que esta regla le pide a una marca del teléfono. */
export interface MarcaParaResumir {
  /** La marcó sin señal: la hora que entró es la del teléfono. */
  sinSenal?: boolean;
  /** Minutos entre la marca y el momento en que el teléfono la mandó. */
  atrasoMin?: number | null;
  /** La deshizo desde su teléfono dentro de los 2 minutos: NO cuenta. */
  quitada?: boolean;
  /** «el reloj de su teléfono está corrido 2 h», o `null`. */
  relojCorrido?: string | null;
  /** Tiene foto del lugar o coordenada: hay algo que abrir. */
  conFoto?: boolean;
}

export interface LineaDelDia {
  /** Lo que se dibuja, en gris, debajo del día. Nunca vacío. */
  texto: string;
  /** Hay fotos o mapa que abrir: se dibuja «ver fotos» al final. */
  verFotos: boolean;
  /** `true` cuando hay algo que mirar (sin señal, atraso, repetidas, deshechas):
   *  la línea va en ámbar en vez de gris. */
  llamaLaAtencion: boolean;
}

/** El rótulo del enlace, en UN solo lugar. Fotos del lugar, nunca «selfie». */
export const VER_FOTOS = "ver fotos";

/** «2 repetidas» · «1 repetida». */
export function textoRepetidas(cuantas: number): string {
  const n = Math.max(0, Math.trunc(cuantas || 0));
  return n === 1 ? "1 repetida" : `${n} repetidas`;
}

/** «1 deshecha» · «2 deshechas». ⚠️ Exportada desde el 25-sep-2026: la línea
 *  del REPORTE (`panel-del-dia.ts`) la reusa sin volver a escribirla. */
export function textoDeshechas(cuantas: number): string {
  return cuantas === 1 ? "1 deshecha" : `${cuantas} deshechas`;
}

/**
 * La línea del día, o `null` cuando no hay nada que decir.
 *
 * 🔴 `null` es el caso NORMAL: un día marcado en el reloj de la oficina, con sus
 * cuatro marcas y sin repetidas, no dibuja una sola palabra.
 */
export function lineaDelDia(opts: {
  marcas?: readonly MarcaParaResumir[] | null;
  /** Cuántas marcas se olvidaron por repetidas (≤ 60 s de la anterior). */
  repetidas?: number | null;
}): LineaDelDia | null {
  const marcas = (opts.marcas ?? []).filter(Boolean);
  const repetidas = Math.max(0, Math.trunc(opts.repetidas ?? 0));
  if (marcas.length === 0 && repetidas === 0) return null;

  const vivas = marcas.filter((m) => !m.quitada);
  const deshechas = marcas.length - vivas.length;

  // Lo del teléfono, todo junto en una frase: «sin señal, enviada 3 h después».
  const detalles: string[] = [];
  if (vivas.some((m) => m.sinSenal)) detalles.push("sin señal");
  const atrasos = vivas
    .map((m) => (typeof m.atrasoMin === "number" && Number.isFinite(m.atrasoMin) ? m.atrasoMin : null))
    .filter((m): m is number => m !== null);
  // 🔴 EL MAYOR ATRASO DEL DÍA, no el de la primera marca: es el que dice cuánto
  // se tardó en saber lo que pasó ese día.
  const peorAtraso = atrasos.length ? Math.max(...atrasos) : 0;
  if (peorAtraso >= MINUTOS_DE_ATRASO_QUE_SE_DICEN) {
    detalles.push(`enviada ${cuantoCorrido(peorAtraso * 60_000)} después`);
  }
  const corrido = vivas.map((m) => m.relojCorrido).find((c) => !!c) ?? null;
  if (corrido) detalles.push(corrido);

  const partes: string[] = [];
  if (marcas.length > 0) {
    partes.push(detalles.length > 0 ? `Teléfono · ${detalles.join(", ")}` : "Teléfono");
  }
  if (deshechas > 0) partes.push(textoDeshechas(deshechas));
  if (repetidas > 0) partes.push(textoRepetidas(repetidas));

  return {
    texto: partes.join(" · "),
    verFotos: vivas.some((m) => m.conFoto) || marcas.some((m) => m.conFoto),
    llamaLaAtencion: detalles.length > 0 || deshechas > 0 || repetidas > 0,
  };
}
