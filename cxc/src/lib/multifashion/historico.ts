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
//   · mayor venta (día)     → el día de la semana con el promedio más alto; el
//     promedio es por día CON venta (> 0), la misma definición del detalle del mes.
//   · mayor venta (hora)    → la hora con más venta neta sumada (`agregarPatrones`).
//   · máximo diario         → el día con más venta neta.
// 🔴 HOY no entra en los dos primeros de día (se filtra por fecha).
// ponytail: la hora suma los meses enteros que da el procedimiento, así que lo
// vendido HOY entra en esa suma (1 día de ~345); sacarlo pide SQL nuevo.
// Lo que no se puede calcular no se dibuja: nunca un $0 como dato.
// ─────────────────────────────────────────────────────────────────────────────

import { agregarPatrones, mesesDeLaVentana, type HoraMes } from "./patrones";

export const MESES_DEL_HISTORICO = 12;
export const TITULO_HISTORICO = `Últimos ${MESES_DEL_HISTORICO} meses`;

const DIA_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
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

/**
 * UNA línea gris bajo la gráfica (Daniel, 11-oct-2026: «en una línea, sin tanto
 * protagonismo»): «Últimos 12 meses · mayor venta: domingo y 5–6 pm». Medido a
 * 402 px (370 útiles, 14 px): 343 px, y 349 con «miércoles». Con el promedio
 * («domingo (promedio $5,412)») mide 473 y no cabe en una línea.
 * Lo que no se puede calcular se omite; sin ninguno, `null`. `hora` llega ya
 * escrita («5–6 pm»). `mejorDia` y el promedio se siguen calculando, sin uso aquí.
 */
export function lineaDelHistorico(h: HistoricoVentas, hora: string | null): string | null {
  const mayor: string[] = [];
  if (h.diaSemana && h.diaSemana.promedio > 0) mayor.push(DIA_LARGO[h.diaSemana.dow].toLowerCase());
  if (hora) mayor.push(hora);
  return mayor.length ? `${TITULO_HISTORICO} · mayor venta: ${mayor.join(" y ")}` : null;
}
