// ─────────────────────────────────────────────────────────────────────────────
// DESDE CUÁNDO Y HASTA CUÁNDO se resta un descuento de comisión.
//
// 🩸 POR QUÉ (6-sep-2026). `comision_descuentos_fijos` tenía OCHO columnas y
// NINGUNA de fecha: `id · vendedor_nombre · empresa_key · concepto · monto ·
// activo · created_at · updated_at`. Sin fecha, el descuento se resta en TODOS
// los meses, para siempre y hacia atrás. Medido contra producción: las dos
// filas de Reynaldo en Fashion Shoes («Descuento» $1.400,00 + «Descuento de
// adelanto» $173,08 = $1.573,08) se crearon el **8-jul-2026** y se estaban
// restando también en enero, febrero, marzo, abril, mayo y junio — SEIS meses
// anteriores al día en que el descuento existió. En 2026 iban $14.157,72
// (9 meses × $1.573,08).
//
// Daniel, textual: «no sé [qué era] pero hay que descontarlo así mensual», y
// eligió que **empiece en julio de 2026**.
//
// LA REGLA, en un solo lugar:
//   · `desde` = primer mes que lo lleva. Sin `desde`, la fila se comporta como
//     hasta ahora (siempre): así una fila vieja no cambia de conducta mientras
//     la DDL no corra, ni un `null` apaga plata en silencio.
//   · `hasta` = último mes que lo lleva, **INCLUSIVE** — el mismo criterio del
//     «Hasta…» de Recordatorios, para no tener dos formas de leer una fecha
//     final en el mismo sistema. Sin `hasta`, no termina.
//
// El grano es el MES, no el día: el descuento se resta de la comisión de un
// mes entero. Una fecha a mitad de mes cuenta por su mes (2026-07-15 → julio).
// ─────────────────────────────────────────────────────────────────────────────

/** El mes se guarda como el día 1 (columna `date`). */
export function mesISO(year: number, mes: number): string {
  return `${year}-${String(mes).padStart(2, "0")}-01`;
}

/** «2026-07-15» → 202607. Lo que no se puede leer es `null`, nunca un 0. */
export function claveMes(iso: string | null | undefined): number | null {
  const s = (iso ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const mes = Number(m[2]);
  if (!Number.isInteger(year) || mes < 1 || mes > 12) return null;
  return year * 100 + mes;
}

export interface Vigencia {
  /** Primer mes que lleva el descuento (YYYY-MM-DD). `null` = desde siempre. */
  desde?: string | null;
  /** Último mes que lo lleva, INCLUSIVE. `null` = no termina. */
  hasta?: string | null;
}

/**
 * ¿Este descuento se resta en (year, mes)?
 *
 * Fail-OPEN a propósito: una fecha ilegible o ausente se lee como «sin límite».
 * Un descuento que deja de restarse en silencio le paga de más a alguien y
 * nadie lo nota; uno que se resta de más se ve en la pantalla el mismo día.
 */
export function descuentoVigente(v: Vigencia, year: number, mes: number): boolean {
  const k = year * 100 + mes;
  const desde = claveMes(v.desde);
  const hasta = claveMes(v.hasta);
  if (desde !== null && k < desde) return false;
  if (hasta !== null && k > hasta) return false;
  return true;
}

export type ValidacionVigencia =
  | { ok: true; valor: { desde: string | null; hasta: string | null } }
  | { ok: false; error: string };

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** «Hasta» antes de «Desde» no es una fila a medias: es un error con texto. */
export function validarVigencia(desdeRaw: unknown, hastaRaw: unknown): ValidacionVigencia {
  const leer = (v: unknown): string | null | undefined => {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || !ES_FECHA.test(v.trim())) return undefined;
    return v.trim();
  };
  const desde = leer(desdeRaw);
  const hasta = leer(hastaRaw);
  if (desde === undefined) return { ok: false, error: "La fecha de «Desde» no es válida" };
  if (hasta === undefined) return { ok: false, error: "La fecha de «Hasta» no es válida" };
  const kd = claveMes(desde);
  const kh = claveMes(hasta);
  if (kd !== null && kh !== null && kh < kd) {
    return { ok: false, error: "«Hasta» no puede ser antes que «Desde»" };
  }
  return { ok: true, valor: { desde, hasta } };
}
