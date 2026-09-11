// ─────────────────────────────────────────────────────────────────────────────
// «datos de hoy 10:00 a.m.» — la línea de frescura de Ventas › Clientes
// (11-sep-2026). Módulo PURO: el «ahora» llega por parámetro.
//
// La pestaña lee una vista materializada; desde hoy se refresca con cada sync
// de facturas y deja una marca (`refrescar-vista-clientes.ts`). Esta función
// convierte esa marca en una frase corta, en hora de PANAMÁ (UTC−5 fijo):
//   · del mismo día      → «datos de hoy 10:00 a.m.»
//   · de otro día        → «datos del 10 sep, 6:15 p.m.»
// Sin marca no se dice nada: mejor callar que inventar una hora.
// ─────────────────────────────────────────────────────────────────────────────

const ZONA = "America/Panama";
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function partesPanama(d: Date): { dia: string; mes: number; diaNum: number; hora: string } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d); // YYYY-MM-DD
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(d); // "10:00 AM"
  const hora = h.replace(" AM", " a.m.").replace(" PM", " p.m.");
  return { dia: f, mes: Number(f.slice(5, 7)), diaNum: Number(f.slice(8, 10)), hora };
}

/** La frase, o null si no hay marca o no se puede leer. */
export function textoFrescura(iso: string | null | undefined, ahora: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = partesPanama(d);
  const hoy = partesPanama(ahora);
  if (p.dia === hoy.dia) return `datos de hoy ${p.hora}`;
  return `datos del ${p.diaNum} ${MES_CORTO[p.mes - 1]}, ${p.hora}`;
}
