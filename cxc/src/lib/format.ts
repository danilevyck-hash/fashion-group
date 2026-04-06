export function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
