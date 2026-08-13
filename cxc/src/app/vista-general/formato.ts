// Formato de plata y porcentajes de Vista General. Módulo PURO y COMPARTIDO
// entre la página y `RentabilidadPorEmpresa`: dos copias del mismo formateador
// es como el mismo número termina viéndose distinto en dos partes de la pantalla.

/** `-1234.5` → `"-$1,235"`. Negativo con signo, NUNCA valor absoluto: su firma
 *  es que la diferencia da exactamente el doble. */
export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** `-1234.5` → `"-$1k"`. La forma corta, para las tarjetas y las columnas. */
export function moneyK(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(0)}k`;
  return `${sign}$${a.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** `0.123` → `"12.3%"`. `null` → `"—"`: sin base no se inventa un porcentaje. */
export function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
