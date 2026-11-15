export function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtCompact(n: number | undefined | null): string {
  const v = n ?? 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/**
 * «5 abr 2026». Acepta «2026-04-05» y también una marca de tiempo completa
 * («2026-04-05T05:00:00+00:00», lo que PostgREST devuelve de un `timestamptz`):
 * se toma el DÍA escrito, sin pasar por la zona del navegador.
 * 🩸 Antes le pegaba «T12:00:00» a la marca de tiempo y salía «Invalid Date»
 * (búsqueda global › Ventas, `switch_facturas.fecha`). Sin fecha válida: "".
 */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const dia = /^\d{4}-\d{2}-\d{2}/.exec(String(d))?.[0];
  if (!dia) return "";
  try {
    const date = new Date(dia + "T12:00:00");
    if (Number.isNaN(date.getTime())) return "";
    return date
      .toLocaleDateString("es-PA", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
      .replace(".", "");
  } catch {
    return d;
  }
}

export function fmtGuia(numero: number): string {
  return `GT-${String(numero).padStart(3, "0")}`;
}
