// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CUÁNDO SE TRAJO ESTO DE SWITCH — la pantalla de Proveedores no lo decía
// NUNCA (20-sep-2026).
//
// 🩸 La lista mostraba $4.829.819,40 de deuda sin una sola palabra sobre de
// cuándo es ese número. El CxP se sincroniza 1×/día (09:30 UTC) y la contadora
// no tenía forma de saber si estaba mirando lo de hoy o lo de anteayer, ni
// siquiera después de tocar «Actualizar ahora».
//
// El prefijo es el MISMO que el del resto del sistema («Actualizado:», ver
// `components/shared/SyncStatus.tsx`): una cuarta forma de decir lo mismo no le
// enseña nada a nadie.
//
// 🔑 **Sin dato no se afirma nada**: devuelve `null` y la línea no se dibuja.
// Nunca «Actualizado: —», que suena a que el dato existe y está vacío.
// ─────────────────────────────────────────────────────────────────────────────

/** El mismo prefijo que usa todo el sistema. */
export const PREFIJO_ACTUALIZADO = "Actualizado:";

// Panamá, siempre. El servidor corre en UTC y la hora que hay que leer es la de
// quien mira la pantalla (`hoyPanama` es la misma regla, para fechas).
const FMT = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** «Actualizado: 20 sep 2026, 4:32 a m», o `null` si no hay fecha que decir. */
export function textoActualizado(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${PREFIJO_ACTUALIZADO} ${FMT.format(d).replace(/\./g, "")}`;
}
