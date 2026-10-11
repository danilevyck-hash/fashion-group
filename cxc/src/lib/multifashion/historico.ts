// ─────────────────────────────────────────────────────────────────────────────
// MULTIFASHION › «Últimos 12 meses» — dos datos de la tienda, PUROS (11-oct-2026).
//
// Daniel, sobre la línea gris «Dom es el día fuerte…»: «¿no sería mejor quitarla
// y poner esos datos históricos y que se vaya actualizando?»; y después: «Lo de
// 12 meses con la info de los últimos 12 meses, ¿no? ¿Y por qué muestra mejores
// horas solo rango de una hora?».
//
// La ventana: los 365 días que terminan AYER (Panamá). Se corre sola cada día y
// HOY nunca entra. Todo es venta retail neta (`is_wholesale = false`, las notas
// de crédito restan), la misma del número del mes.
//
//   · Día de mayor venta     → el día de la semana que más vendió EN TOTAL en la
//     ventana, con su parte de la venta. 🩸 Por promedio de los días con venta
//     ganaba «domingo» con 6 domingos abiertos en el año.
//   · Horario de mayor venta → las 3 horas SEGUIDAS que más vendieron en total,
//     con su parte de la venta.
// Lo que no se puede calcular no se dibuja: nunca un $0 ni un 0 % como dato.
//
// 🔴 Sin SQL nuevo. De dónde sale cada cosa lo arma la ruta
// (`api/multifashion/historico`): los días, del detalle del mes; las horas, del
// procedimiento de horas en los meses enteros y de las facturas de esos días en
// los dos meses de los bordes.
// ─────────────────────────────────────────────────────────────────────────────

import type { HoraMes } from "./patrones";

export const DIAS_DEL_HISTORICO = 365;
export const TITULO_HISTORICO = "Últimos 12 meses";
export const HORAS_DEL_BLOQUE = 3;

const DIA_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const p2 = (n: number) => String(n).padStart(2, "0");
const MS_DIA = 86_400_000;
const masDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * MS_DIA).toISOString().slice(0, 10);

/** Primer y último día de la ventana: 365 días que terminan AYER. */
export function ventanaDelHistorico(hoyIso: string): { desde: string; hasta: string } {
  return { desde: masDias(hoyIso, -DIAS_DEL_HISTORICO), hasta: masDias(hoyIso, -1) };
}

export interface MesDelHistorico {
  anio: number;
  mes: number;
  /** La parte del mes que cae en la ventana. */
  desde: string;
  hasta: string;
  /** El mes entra completo (sirve el total por hora del mes). */
  entero: boolean;
}

/** Los meses que toca la ventana, del más viejo al más nuevo. */
export function mesesDelHistorico(hoyIso: string): MesDelHistorico[] {
  const v = ventanaDelHistorico(hoyIso);
  const out: MesDelHistorico[] = [];
  let anio = Number(v.desde.slice(0, 4));
  let mes = Number(v.desde.slice(5, 7));
  for (;;) {
    const primero = `${anio}-${p2(mes)}-01`;
    if (primero > v.hasta) break;
    const ultimo = `${anio}-${p2(mes)}-${p2(new Date(Date.UTC(anio, mes, 0)).getUTCDate())}`;
    const desde = primero < v.desde ? v.desde : primero;
    const hasta = ultimo > v.hasta ? v.hasta : ultimo;
    out.push({ anio, mes, desde, hasta, entero: desde === primero && hasta === ultimo });
    if (mes === 12) { anio += 1; mes = 1; } else mes += 1;
  }
  return out;
}

/** Las facturas de unos días, sumadas por hora de PANAMÁ (UTC−5 fijo). */
export function horasDeFacturas(filas: readonly { fecha_ts: string; subtotal: number | string | null }[]): HoraMes[] {
  const porHora = new Map<number, number>();
  for (const f of filas) {
    const t = Date.parse(f.fecha_ts);
    if (!Number.isFinite(t)) continue;
    const hora = new Date(t - 5 * 3_600_000).getUTCHours();
    porHora.set(hora, (porHora.get(hora) ?? 0) + (Number(f.subtotal) || 0));
  }
  return [...porHora.entries()].map(([hora, ventas]) => ({ hora, ventas }));
}

export interface HistoricoVentas {
  desde: string;
  hasta: string;
  /** Un renglón por día de la semana (0 = domingo): total y días con venta. */
  semana: { dow: number; total: number; dias: number }[];
  /** Venta por hora de Panamá, 0–23. */
  horas: { hora: number; ventas: number }[];
}

export function historicoDeVentas(
  dias: readonly { fecha: string; ventas: number }[],
  horas: readonly HoraMes[],
  hoyIso: string,
): HistoricoVentas {
  const v = ventanaDelHistorico(hoyIso);
  const semana = Array.from({ length: 7 }, (_, dow) => ({ dow, total: 0, dias: 0 }));
  for (const d of dias) {
    const ventas = Number(d.ventas) || 0;
    if (d.fecha < v.desde || d.fecha > v.hasta || ventas === 0) continue; // fuera de la ventana (y HOY) no entra
    const s = semana[new Date(`${d.fecha}T12:00:00Z`).getUTCDay()];
    s.total += ventas;
    if (ventas > 0) s.dias += 1;
  }
  const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, ventas: 0 }));
  for (const h of horas) if (porHora[h.hora]) porHora[h.hora].ventas += Number(h.ventas) || 0;
  return { ...v, semana, horas: porHora };
}

const pct = (parte: number, todo: number) => Math.round((parte / todo) * 100);

/** El día de la semana que más vendió en total, y su parte de la venta. */
export function diaDeMayorVenta(h: HistoricoVentas): { dow: number; pct: number } | null {
  const todo = h.semana.reduce((s, d) => s + d.total, 0);
  const mejor = h.semana.reduce((a, d) => (d.total > a.total ? d : a), h.semana[0]);
  return todo > 0 && mejor && mejor.total > 0 ? { dow: mejor.dow, pct: pct(mejor.total, todo) } : null;
}

/** Las `n` horas seguidas que más vendieron: de `desde` a `hasta` (hora de cierre del bloque). */
export function bloqueDeHoras(h: HistoricoVentas, n: number = HORAS_DEL_BLOQUE): { desde: number; hasta: number; pct: number } | null {
  const todo = h.horas.reduce((s, x) => s + x.ventas, 0);
  let mejor: { desde: number; suma: number } | null = null;
  for (let i = 0; i + n <= 24; i++) {
    const suma = h.horas.slice(i, i + n).reduce((s, x) => s + x.ventas, 0);
    if (!mejor || suma > mejor.suma) mejor = { desde: i, suma };
  }
  return todo > 0 && mejor && mejor.suma > 0 ? { desde: mejor.desde, hasta: mejor.desde + n, pct: pct(mejor.suma, todo) } : null;
}

/** «4–7 pm» · «11 am–2 pm». */
export function etiquetaHoras(desde: number, hasta: number): string {
  const hr = (x: number) => (x % 12 === 0 ? 12 : x % 12);
  const per = (x: number) => (x % 24 < 12 ? "am" : "pm");
  return per(desde) === per(hasta) ? `${hr(desde)}–${hr(hasta)} ${per(hasta)}` : `${hr(desde)} ${per(desde)}–${hr(hasta)} ${per(hasta)}`;
}

/**
 * Las dos líneas grises bajo la gráfica, chicas y sin caja:
 *   «Últimos 12 meses · día de mayor venta: sábado (22 %)»
 *   «Horario de mayor venta: 4–7 pm (38 %)»
 * El % es la parte de la venta de la ventana. Lo que no se puede calcular se
 * omite; sin ninguno, `[]`. La ventana se nombra en la primera que salga.
 */
export function lineasDelHistorico(h: HistoricoVentas): string[] {
  const dia = diaDeMayorVenta(h);
  const bloque = bloqueDeHoras(h);
  const partes: string[] = [];
  if (dia) partes.push(`día de mayor venta: ${DIA_LARGO[dia.dow]} (${dia.pct} %)`);
  if (bloque) partes.push(`horario de mayor venta: ${etiquetaHoras(bloque.desde, bloque.hasta)} (${bloque.pct} %)`);
  return partes.map((p, i) => (i === 0 ? `${TITULO_HISTORICO} · ${p}` : p.charAt(0).toUpperCase() + p.slice(1)));
}
