// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA LÍNEA DE FRESCURA, AL ESTILO MAIL DE APPLE (4-oct-2026, propuesta).
//
// Daniel, desde su iPhone: «no veo el refresh». «Actualizar ahora» quedó
// escondido en el «···» (Ventas, Comisiones) o al final de la hoja «Más»
// (Multifashion). La propuesta: una línea chica que dice cuándo se trajeron
// los datos y que, al tocarla, actualiza.
//   · Celular: «Actualizado 9:41 ↻» bajo el título o pegada a la línea gris.
//   · Computadora: «Actualizado hace 5 min · Actualizar» junto al título.
// El botón es el MISMO `SyncNowButton` (permisos, acelerador, avisos); aquí
// solo se escribe el texto.
//
// Interruptor `FRESCURA_VISIBLE_2026_10`: `false` = todo como hoy (el
// «Actualizar ahora» sigue en el «···» y en «Más»). NACE APAGADO; se prende
// solo con el «sí» de Daniel. Candado `frescura-visible.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** `false` = como hoy. Se prende con el «sí» de Daniel. */
export const FRESCURA_VISIBLE_2026_10 = false;

const HORA = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const DIA = new Intl.DateTimeFormat("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short" });
const DIA_ISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" });

/** Celular: «4:00 pm» si fue hoy en Panamá, «3 oct» si fue otro día. */
export function horaDeFrescura(iso: string, ahora: Date = new Date()): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (DIA_ISO.format(d) !== DIA_ISO.format(ahora)) return DIA.format(d).replace(/\./g, "");
  return HORA.format(d).replace(/\s*([ap])\.?\s?m\.?/i, (_, x: string) => ` ${x.toLowerCase()}m`).trim();
}

/** Computadora: «hace un momento», «hace 5 min», «hace 3 h», «hace 2 días». */
export function haceCuantoFrescura(iso: string, ahora: Date = new Date()): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.floor((ahora.getTime() - t) / 60_000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}
