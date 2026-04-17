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

export function fmtDate(d: string): string {
  if (!d) return "";
  try {
    const date = new Date(d + "T12:00:00");
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
