export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getStartOfWeek(todayISO: string): string {
  // Lunes de la semana actual. JS getUTCDay(): 0=domingo, 1=lunes...6=sábado
  const d = new Date(todayISO + "T00:00:00Z");
  const dayOfWeek = d.getUTCDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setUTCDate(d.getUTCDate() - daysFromMonday);
  return d.toISOString().slice(0, 10);
}

export function getEndOfWeek(todayISO: string): string {
  // Domingo de la semana actual.
  return addDaysISO(getStartOfWeek(todayISO), 6);
}

export function getVencenSemanaRange(todayISO: string): { start: string; end: string } {
  // "Vencen esta semana" = desde hoy hasta el domingo de esta semana calendario.
  // Razón: no incluir días ya pasados en el count.
  return { start: todayISO, end: getEndOfWeek(todayISO) };
}

export function isVencenSemana(fechaDeposito: string, todayISO: string): boolean {
  const { start, end } = getVencenSemanaRange(todayISO);
  return fechaDeposito >= start && fechaDeposito <= end;
}
