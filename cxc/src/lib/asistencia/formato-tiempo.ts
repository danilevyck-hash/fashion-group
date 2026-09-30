/* ─────────────────────────────────────────────────────────────────────────────
 * CÓMO SE MUESTRAN LOS MINUTOS EN LA TABLA DE ASISTENCIA (29-sep-2026). PURO.
 *
 * Daniel, sobre «Min tarde 721.75 · No trabajado 958.23 · Extras 175.08»:
 * *«aplícalo y en configuración que se pueda configurar cómo mostrarlo»*.
 *
 *   · "hmm" (por defecto) → 721.75 → «12:02»: se redondea al MINUTO y se parte
 *     en horas y minutos.
 *   · "min"               → 721.75 → «721.75»: exactamente `fmtMin` de
 *     `reporte.ts` (candado en el test; no se importa para no arrastrar el motor
 *     entero a Configuración).
 *
 * 🔴 SOLO CAMBIA CÓMO SE VE. El motor, el Excel, el PDF y la planilla siguen en
 * minutos al segundo. ⚠️ En "hmm" cada celda va redondeada al minuto, así que
 * la columna puede no sumar exacto el total de abajo (que también se redondea).
 * ────────────────────────────────────────────────────────────────────────── */

export type ModoTiempo = "hmm" | "min";

export const MODO_TIEMPO_POR_DEFECTO: ModoTiempo = "hmm";

export function formatoTiempo(minutos: number, modo: ModoTiempo): string {
  if (modo === "min") {
    if (!Number.isFinite(minutos)) return "0";
    const r = Math.round(minutos * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2);
  }
  if (!Number.isFinite(minutos)) return "0:00";
  const total = Math.round(Math.abs(minutos));
  const signo = minutos < 0 && total > 0 ? "-" : "";
  return `${signo}${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Lo guardado → un modo válido. Cualquier basura cae al de por defecto. */
export function modoTiempoValido(v: unknown): ModoTiempo {
  return v === "min" || v === "hmm" ? v : MODO_TIEMPO_POR_DEFECTO;
}
