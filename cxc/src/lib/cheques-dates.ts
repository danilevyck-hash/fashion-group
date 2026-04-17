export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getVencenSemanaRange(todayISO: string): { start: string; end: string } {
  return { start: todayISO, end: addDaysISO(todayISO, 7) };
}

export function isVencenSemana(fechaDeposito: string, todayISO: string): boolean {
  const { start, end } = getVencenSemanaRange(todayISO);
  return fechaDeposito >= start && fechaDeposito <= end;
}
