// ─────────────────────────────────────────────────────────────────────────────
// MULTIFASHION › «Últimos 12 meses» — tres datos de la tienda, PUROS (11-oct-2026).
//
// Daniel, sobre la línea gris «Dom es el día fuerte…»: «¿no sería mejor quitarla
// y poner esos datos históricos y que se vaya actualizando?».
//
// La ventana: el mes en curso de Panamá HASTA AYER y los 11 meses anteriores.
// Se corre sola cada día. 🔴 Sin SQL nuevo: son los MISMOS dos procedimientos del
// detalle del mes (`multifashion_detalle_mensual_v3` y `multifashion_horas_pico_v1`,
// retail, `is_wholesale = false`), uno por mes de la ventana.
//
//   · Día de mayor venta    → el día de la semana con el promedio más alto; el
//     promedio es por día CON venta (> 0), la misma definición del detalle del mes.
//   · Hora de mayor venta   → la hora con más venta neta sumada (`agregarPatrones`).
//   · Venta diaria más alta → el día con más venta neta.
// 🔴 HOY no entra en los dos primeros de día (se filtra por fecha).
// ponytail: la hora suma los meses enteros que da el procedimiento, así que lo
// vendido HOY entra en esa suma (1 día de ~345); sacarlo pide SQL nuevo.
// Lo que no se puede calcular no se dibuja: nunca un $0 como dato.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtMoneyCompact } from "@/lib/ventas/format";
import { agregarPatrones, mesesDeLaVentana, type HoraMes } from "./patrones";

export const MESES_DEL_HISTORICO = 12;
export const TITULO_HISTORICO = `Últimos ${MESES_DEL_HISTORICO} meses`;
export const ROTULO_DIA_SEMANA = "Día de mayor venta";
export const ROTULO_HORA = "Hora de mayor venta";
export const ROTULO_MEJOR_DIA = "Venta diaria más alta";

const DIA_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const p2 = (n: number) => String(n).padStart(2, "0");

export interface MesHistorico {
  anio: number;
  mes: number;
  dias: { dia: number; ventas: number }[];
  horas: HoraMes[];
}

export interface HistoricoVentas {
  /** Primer y último día de la ventana (`YYYY-MM-DD`); el último es AYER. */
  desde: string;
  hasta: string;
  diaSemana: { dow: number; promedio: number; dias: number } | null;
  horaPico: number | null;
  mejorDia: { fecha: string; ventas: number } | null;
}

/** Los meses de la ventana que termina en el mes de `hoyIso`. */
export function mesesDelHistorico(hoyIso: string): { anio: number; mes: number }[] {
  return mesesDeLaVentana(Number(hoyIso.slice(0, 4)), Number(hoyIso.slice(5, 7)), MESES_DEL_HISTORICO);
}

export function historicoDeVentas(meses: readonly MesHistorico[], hoyIso: string): HistoricoVentas {
  const ventana = mesesDelHistorico(hoyIso);
  const ayer = new Date(Date.parse(`${hoyIso}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const porDow = new Map<number, { suma: number; dias: number }>();
  let mejorDia: HistoricoVentas["mejorDia"] = null;

  for (const m of meses) {
    for (const d of m.dias ?? []) {
      const fecha = `${m.anio}-${p2(m.mes)}-${p2(d.dia)}`;
      const ventas = Number(d.ventas) || 0;
      if (fecha >= hoyIso || ventas <= 0) continue; // hoy no entra; un día sin venta no es divisor
      const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay();
      const acc = porDow.get(dow) ?? { suma: 0, dias: 0 };
      porDow.set(dow, { suma: acc.suma + ventas, dias: acc.dias + 1 });
      if (!mejorDia || ventas > mejorDia.ventas) mejorDia = { fecha, ventas };
    }
  }

  let diaSemana: HistoricoVentas["diaSemana"] = null;
  for (const [dow, v] of porDow) {
    const promedio = v.suma / v.dias;
    if (!diaSemana || promedio > diaSemana.promedio) diaSemana = { dow, promedio, dias: v.dias };
  }

  return {
    desde: `${ventana[0].anio}-${p2(ventana[0].mes)}-01`,
    hasta: ayer,
    diaSemana,
    horaPico: agregarPatrones(meses.map((m) => ({ heatmap: [], horas: m.horas ?? [] }))).horaPico,
    mejorDia,
  };
}

/** «nov 2025 – 10 oct 2026»: la ventana de verdad, al lado del título. */
export function rangoDelHistorico(h: Pick<HistoricoVentas, "desde" | "hasta">): string {
  const [ad, md] = h.desde.split("-").map(Number);
  const [ah, mh, dh] = h.hasta.split("-").map(Number);
  return `${MES_CORTO[md - 1]} ${ad} – ${dh} ${MES_CORTO[mh - 1]} ${ah}`;
}

/** Las filas que SÍ se pueden decir, en orden. `hora` llega ya escrita («3–4 pm»). */
export function filasDelHistorico(h: HistoricoVentas, hora: string | null): { rotulo: string; valor: string }[] {
  const filas: { rotulo: string; valor: string }[] = [];
  if (h.diaSemana && h.diaSemana.promedio > 0) {
    filas.push({ rotulo: ROTULO_DIA_SEMANA, valor: `${DIA_LARGO[h.diaSemana.dow]} · promedio ${fmtMoneyCompact(h.diaSemana.promedio)}` });
  }
  if (hora) filas.push({ rotulo: ROTULO_HORA, valor: hora });
  if (h.mejorDia && h.mejorDia.ventas > 0) {
    const [a, m, d] = h.mejorDia.fecha.split("-").map(Number);
    filas.push({ rotulo: ROTULO_MEJOR_DIA, valor: `${fmtMoneyCompact(h.mejorDia.ventas)} · ${d} ${MES_CORTO[m - 1]} ${a}` });
  }
  return filas;
}
