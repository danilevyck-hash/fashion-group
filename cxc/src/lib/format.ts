export function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(d: string): string {
  if (!d) return "";
  try {
    const date = new Date(d + "T12:00:00");
    return date.toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }
}

export function fmtGuia(numero: number): string {
  return `GT-${String(numero).padStart(3, "0")}`;
}
