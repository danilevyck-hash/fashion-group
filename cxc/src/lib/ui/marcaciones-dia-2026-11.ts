// ─────────────────────────────────────────────────────────────────────────────
// ASISTENCIA › MARCACIONES, UN DÍA A LA VEZ (27-nov-2026).
//
// Daniel: ver por día, con un selector de fecha que muestra SOLO las
// marcaciones de ese día. Por defecto HOY en Panamá (`hoyPanama`), flechas
// ‹ › para el día anterior y el siguiente, y nunca después de hoy. La fecha va
// en la dirección (`?dia=AAAA-MM-DD`, replace: es un filtro del mismo nivel).
//
// 🔴 La pestaña sigue siendo SOLO de `admin`, en la pantalla y en el servidor
// (`MARCACIONES_ROLES` en `lib/asistencia/marcaciones-pestana.ts`, desde el
// 25-sep-2026). Esta regla no la cambia.
//
// ⚠️ `false` = la pestaña vuelve al período de quincena compartido con las
// demás pestañas, como hasta hoy.
// ─────────────────────────────────────────────────────────────────────────────

export const MARCACIONES_UN_DIA = true;

/** La clave en la dirección. */
export const PARAM_DIA = "dia";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** El día que se mira: el de la URL si es válido y no pasa de hoy; si no, hoy. */
export function diaElegido(crudo: string | null | undefined, hoy: string): string {
  const d = String(crudo ?? "").trim();
  if (!ISO.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) return hoy;
  return d > hoy ? hoy : d;
}

/** El día de al lado (`-1` anterior, `1` siguiente), sin pasar de hoy. */
export function diaVecino(dia: string, paso: -1 | 1, hoy: string): string {
  const t = new Date(`${dia}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + paso);
  const d = t.toISOString().slice(0, 10);
  return d > hoy ? hoy : d;
}

/** Lo que dice la pestaña cuando ese día nadie marcó desde el teléfono. */
export const SIN_MARCAS_DEL_DIA = "Ningún colaborador marcó desde el teléfono este día.";
