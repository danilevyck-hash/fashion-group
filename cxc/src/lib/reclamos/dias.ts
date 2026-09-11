// Días entre una fecha (YYYY-MM-DD) y «hoy» (YYYY-MM-DD, el de Panamá). Puro:
// el «hoy» entra como parámetro para que los tests usen fechas fijas.

export function diasDesde(fecha: string | null | undefined, hoy: string): number | null {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}/.test(fecha)) return null;
  const a = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10));
  const b = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
  return Math.floor((b - a) / 86_400_000);
}
