/* ─────────────────────────────────────────────────────────────────────────────
 * COMPENSACIÓN DE TARDANZA — la casilla de la ficha (9-oct-2026).
 *
 * Daniel aprobó «Repone tardanza», por colaborador: quien la tiene prendida
 * puede reponer la tardanza quedándose más tarde ESE MISMO DÍA, sin que se le
 * descuente y sin cobrar extra por esos minutos.
 *
 * Módulo PURO: sin base, sin red. La regla vive acá (`compensarTardanza`); el
 * motor (`reporte.ts`) solo le pregunta, y el I/O está en `config-server.ts`.
 *
 * ── LAS REGLAS, todas de Daniel ─────────────────────────────────────────────
 *
 *   1. Por colaborador, en su ficha. Por omisión APAGADA: nadie cambia hasta
 *      que Daniel se la prenda a alguien.
 *   2. Sin límite: se repone toda la tardanza, la que sea.
 *   3. Solo el mismo día.
 *   4. Minuto por minuto: lo que se queda después de su hora de salida BORRA
 *      tardanza de la entrada, y esos minutos NO son hora extra.
 *   5. Lo que sobre sigue la regla de siempre de la hora extra: la puerta de
 *      los 10 minutos (con menos no cuenta nada), 1,25 / 1,50 según la hora y
 *      la aprobación en Aprobaciones. *«si sale 4 minutos después no cuenta
 *      como extra, ¿verdad?»* — correcto.
 *   6. Llegó tarde y salió a su hora: se descuenta como siempre.
 *   7. La tardanza repuesta no se anota: si se repuso, no existe.
 *   8. La tolerancia de la entrada no cambia.
 *
 * ── 🔑 LA TOLERANCIA DECIDE UNA SOLA VEZ, AL ENTRAR (decisión 9-oct-2026) ───
 *
 * ⚠️ Daniel todavía puede cambiarla: vive SOLO en `compensarTardanza`, abajo
 * (la tardanza que entra ya pasó por la gracia). Para re-aplicar la gracia al
 * resto bastaría con devolver 0 cuando lo que queda es ≤ la tolerancia.
 *
 * 9:15 → 18:05 descuenta 10 minutos, no 0. La tolerancia CLASIFICA la llegada
 * (9:15 es tarde, y desde ahí cuenta todo desde las 9:00: 15 minutos) y la
 * compensación resta después, minuto por minuto. Volver a aplicar la
 * tolerancia al resto convertiría los 10 minutos en un perdón real para quien
 * tiene la casilla —el de 9:15 que sale 18:05 pagaría 0 y el de 9:11 que sale
 * 18:00 pagaría 11— y es justo lo que la regla de hoy evita (*«si al que llega
 * 8:11 le contaras 1 minuto, le enseñas que la entrada es 8:10»*).
 *
 * ── ⚠️ SOLO LA ENTRADA ───────────────────────────────────────────────────────
 *
 * Compensa la tardanza de ENTRADA (ya neta de permisos). El exceso de almuerzo
 * y la salida temprana siguen como siempre. Un día con una sola marca no tiene
 * salida: no hay nada con qué compensar.
 * ────────────────────────────────────────────────────────────────────────── */

import type { Resultado } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// LAS PALABRAS
// ─────────────────────────────────────────────────────────────────────────────

/** El rótulo en la ficha (nombre de ERP, `docs/nombres-erp.md`). */
export const PREGUNTA_REPONE_TARDANZA = "Compensación de tardanza";
export const ETIQUETA_NO_REPONE_TARDANZA = "No, la tardanza se descuenta";
export const ETIQUETA_REPONE_TARDANZA = "Sí, con tiempo después de la salida";

/** Qué significa prenderla, dicho UNA sola vez. */
export const EXPLICACION_REPONE_TARDANZA =
  "Los minutos después de la hora de salida compensan la tardanza del mismo día y no son hora extra. "
  + "Lo que sobre se paga como hora extra con la regla de siempre.";

/** La etiqueta de excepción en la ficha. */
export const CHIP_REPONE_TARDANZA = "Compensación de tardanza";

// ─────────────────────────────────────────────────────────────────────────────
// EL DATO
// ─────────────────────────────────────────────────────────────────────────────

export const COLUMNA_REPONE_TARDANZA = "repone_tardanza";
export const MIGRACION_REPONE_TARDANZA = "20270110120000_asistencia_repone_tardanza.sql";

/** 🔑 SOLO `true` cuenta: `null`, ausente o la columna sin crear = apagada, como hoy. */
export function reponeTardanza(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

/** El cuerpo de un PUT. Ausente = `false`, el valor que deja todo como hoy. */
export function validarReponeTardanza(body: unknown): Resultado<boolean> {
  const v = ((body ?? {}) as Record<string, unknown>).reponeTardanza;
  if (v === undefined || v === null || v === "") return { ok: true, valor: false };
  if (v === true || v === false) return { ok: true, valor: v };
  if (v === "true" || v === "false") return { ok: true, valor: v === "true" };
  return { ok: false, error: "Selecciona si aplica compensación de tardanza o no." };
}

/** ¿El error de PostgREST es «la columna no existe»? (migración sin aplicar). */
export function esColumnaReponeTardanzaFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  if (!texto.includes(COLUMNA_REPONE_TARDANZA)) return false;
  const code = String(e.code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  return /does not exist|no existe|schema cache|could not find/i.test(texto);
}

export function avisoMigracionReponeTardanza(): string {
  return `Lo demás de la ficha quedó guardado, pero la compensación de tardanza no: falta aplicar ${MIGRACION_REPONE_TARDANZA}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA REGLA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compensa la tardanza del día con el tiempo después de la salida.
 *
 * Entra la tardanza YA decidida (tolerancia y permiso aplicados) y el bruto de
 * la salida en segundos; sale lo que queda de cada uno. La puerta del mínimo de
 * la hora extra se aplica DESPUÉS, sobre el bruto que queda: es la regla 5.
 * Con `aplica = false` devuelve lo mismo que entró — el día de siempre.
 */
export function compensarTardanza(
  aplica: boolean, tardeMin: number, brutoSeg: number,
): { tardeMin: number; brutoSeg: number } {
  if (!aplica || tardeMin <= 0 || brutoSeg <= 0) return { tardeMin, brutoSeg };
  const tardeSeg = tardeMin * 60;
  if (brutoSeg >= tardeSeg) return { tardeMin: 0, brutoSeg: brutoSeg - tardeSeg };
  return { tardeMin: (tardeSeg - brutoSeg) / 60, brutoSeg: 0 };
}
