// ─────────────────────────────────────────────────────────────────────────────
// VENTAS Y COMISIÓN POR VENDEDOR, DE UNA FECHA A OTRA. (módulo PURO)
//
// Daniel, 1-oct-2026: *«quiero poder ver comisiones de x fecha a x fecha, a ver
// ventas de las vendedoras, porque mis preguntas a veces son ¿cuánto vendieron
// el último mes? ¿últimos 3 meses? ¿última semana? ¿últimos 6 meses?»*.
//
// 🔴 EL RANGO ES PARA CONSULTAR; LO QUE SE PAGA SIGUE SIENDO EL MES CERRADO.
// Por eso el rango no lleva descuentos fijos (son del mes de pago), ni PDF, ni
// Excel, y los meses de siempre no cambian un centavo (agosto 2026 =
// $5.978,55 en el grupo y $255,27 en Multifashion).
//
// 🔴 LAS MISMAS REGLAS DE SIEMPRE, SIN UNA SEGUNDA FÓRMULA:
//   · grupo: un mes ENTERO dentro del rango sale de la MISMA RPC del mes
//     (`leerComision`); un mes PARTIDO sale del detalle de esa misma RPC
//     (`comision_b2b_detalle`, documento por documento) recortado a las fechas.
//     0,5 % sobre la venta con utilidad > 20, notas de crédito restan, DEFAULT y
//     DANIEL LEVY se calculan pero no se pagan.
//   · Multifashion: 0,5 % del contado (`subtotal_comision` de su vista), nunca
//     sumado con el grupo.
// ─────────────────────────────────────────────────────────────────────────────

import { estaRetirado } from "./retirados";
import { variacionPct } from "@/lib/variacion";

/** El interruptor. `false` = el selector de período de siempre, sin atajos. */
export const VENDEDORES_RANGO_2026_10 = true;

export type ClaveAtajo = "semana" | "mes" | "3m" | "6m" | "anio";

export const ATAJOS_RANGO: readonly { clave: ClaveAtajo; rotulo: string }[] = [
  { clave: "semana", rotulo: "Última semana" },
  { clave: "mes", rotulo: "Último mes" },
  { clave: "3m", rotulo: "Últimos 3 meses" },
  { clave: "6m", rotulo: "Últimos 6 meses" },
  { clave: "anio", rotulo: "Este año" },
];

export const ROTULO_RANGO_LIBRE = "Rango…";

/** Lo que se está consultando. `atajo` null = rango libre del calendario. */
export interface RangoConsulta {
  desde: string;
  hasta: string;
  atajo: ClaveAtajo | null;
}

/** Tope del rango libre: más de dos años son cientos de llamadas a la RPC. */
export const MAX_DIAS_RANGO = 731;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const esFechaIso = (s: string | null | undefined): s is string =>
  !!s && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

const aFecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
const aIso = (d: Date) => d.toISOString().slice(0, 10);
export function sumarDias(iso: string, n: number): string {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aIso(d);
}
export function diasDelRango(desde: string, hasta: string): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000) + 1;
}
/** Mismo día N meses atrás; si ese mes es más corto, su último día. */
function restarMeses(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) - n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return aIso(new Date(Date.UTC(ny, nm, Math.min(d, ultimo))));
}

/** Las fechas de un atajo, terminando HOY (Panamá). */
export function rangoDeAtajo(clave: ClaveAtajo, hoy: string): RangoConsulta {
  const meses = { mes: 1, "3m": 3, "6m": 6 } as const;
  const desde =
    clave === "semana" ? sumarDias(hoy, -6)
    : clave === "anio" ? `${hoy.slice(0, 4)}-01-01`
    : sumarDias(restarMeses(hoy, meses[clave]), 1);
  return { desde, hasta: hoy, atajo: clave };
}

/**
 * El período anterior EQUIVALENTE, contra el que se mide la variación:
 *   · «Este año» → los MISMOS DÍAS del año pasado (regla de la casa para todo
 *     «vs año pasado»; 29-feb cae a 28-feb).
 *   · lo demás → los mismos días de largo, justo antes.
 */
export function periodoAnterior(r: RangoConsulta): { desde: string; hasta: string } {
  if (r.atajo === "anio") {
    const y = Number(r.desde.slice(0, 4)) - 1;
    const hasta = r.hasta.slice(5) === "02-29" ? `${y}-02-28` : `${y}${r.hasta.slice(4)}`;
    return { desde: `${y}-01-01`, hasta };
  }
  const n = diasDelRango(r.desde, r.hasta);
  return { desde: sumarDias(r.desde, -n), hasta: sumarDias(r.desde, -1) };
}

/** Un mes del rango: ENTERO (sale de la RPC del mes) o PARTIDO (del detalle). */
export interface PiezaMes {
  year: number;
  mes: number;
  desde: string;
  hasta: string;
  entero: boolean;
}

export function piezasPorMes(desde: string, hasta: string): PiezaMes[] {
  const piezas: PiezaMes[] = [];
  let ini = desde;
  while (ini <= hasta) {
    const year = Number(ini.slice(0, 4));
    const mes = Number(ini.slice(5, 7));
    const primero = `${ini.slice(0, 7)}-01`;
    const ultimo = aIso(new Date(Date.UTC(year, mes, 0)));
    const fin = ultimo < hasta ? ultimo : hasta;
    piezas.push({ year, mes, desde: ini, hasta: fin, entero: ini === primero && fin === ultimo });
    ini = sumarDias(fin, 1);
  }
  return piezas;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** El detalle de UN vendedor en UN mes, como lo devuelve `comision_b2b_detalle`. */
export interface DetalleComision {
  tasa_venta: number;
  tasa_cobro: number;
  ventas: { fecha: string; subtotal: number }[];
  cobros: { fecha: string; monto: number }[];
}

/**
 * La comisión de un mes PARTIDO: los documentos del detalle dentro de las
 * fechas, con la MISMA cuenta de la RPC (cada parte redondeada y después
 * sumada). Con el mes entero da exactamente `comision_total` de la RPC.
 */
export function comisionDeDetalle(d: DetalleComision, desde: string, hasta: string): number {
  const dentro = (f: string) => {
    const dia = String(f).slice(0, 10);
    return dia >= desde && dia <= hasta;
  };
  const baseV = d.ventas.filter((x) => dentro(x.fecha)).reduce((a, x) => a + Number(x.subtotal), 0);
  const baseC = d.cobros.filter((x) => dentro(x.fecha)).reduce((a, x) => a + Number(x.monto), 0);
  return round2(baseV * Number(d.tasa_venta)) + round2(baseC * Number(d.tasa_cobro));
}

/** Una fila cruda del servidor: una persona en una empresa. */
export interface FilaRango {
  empresa_key: string;
  vendedor: string;
  ventas: number;
  comision: number;
}

export interface FilaVendedor {
  vendedor: string;
  ventas: number;
  comision: number;
  ventasAnterior: number;
  /** Variación de VENTAS contra el período anterior (`variacionPct`). null = sin base para comparar. */
  variacion: number | null;
}

const clave = (v: string) => v.trim().toUpperCase();

/**
 * Junta las filas por persona (la empresa, si se pide, filtra antes), le pega
 * el período anterior y ordena por ventas. Nunca mezcla grupo y Multifashion:
 * cada uno llega en su propia respuesta.
 */
export function porVendedor(
  actual: readonly FilaRango[],
  anterior: readonly FilaRango[],
  empresa: string | null = null,
): FilaVendedor[] {
  const sirve = (f: FilaRango) => !empresa || f.empresa_key === empresa;
  const m = new Map<string, FilaVendedor>();
  for (const f of actual.filter(sirve)) {
    const k = clave(f.vendedor);
    const x = m.get(k) ?? { vendedor: f.vendedor.trim(), ventas: 0, comision: 0, ventasAnterior: 0, variacion: null };
    x.ventas = round2(x.ventas + Number(f.ventas));
    x.comision = round2(x.comision + Number(f.comision));
    m.set(k, x);
  }
  for (const f of anterior.filter(sirve)) {
    const x = m.get(clave(f.vendedor));
    if (x) x.ventasAnterior = round2(x.ventasAnterior + Number(f.ventas));
  }
  return [...m.values()]
    // Los retirados salen de la tabla Y del total, igual que en la matriz del mes.
    .filter((x) => !estaRetirado(x.vendedor) && (x.ventas !== 0 || x.comision !== 0))
    .map((x) => ({ ...x, variacion: variacionPct(x.ventas, x.ventasAnterior) }))
    .sort((a, b) => b.ventas - a.ventas || a.vendedor.localeCompare(b.vendedor));
}

/** Una fila de `_multifashion_sf_vw`, lo mínimo que hace falta. */
export interface FilaMultifashion {
  vendedor: string | null;
  vendedor_canonico: string | null;
  subtotal: number;
  subtotal_comision: number;
}

/**
 * Multifashion, mismos filtros que `multifashion_vendedoras_v5`: sin vendedor
 * vacío ni DEFAULT, por persona (`vendedor_canonico`), ventas = subtotal
 * firmado y comisión = 0,5 % del CONTADO (`subtotal_comision`).
 */
export function vendedorasDeFilas(filas: readonly FilaMultifashion[]): FilaRango[] {
  const base = new Map<string, { ventas: number; base: number }>();
  for (const f of filas) {
    const v = (f.vendedor ?? "").trim();
    if (!v || v.toUpperCase() === "DEFAULT" || !f.vendedor_canonico) continue;
    const x = base.get(f.vendedor_canonico) ?? { ventas: 0, base: 0 };
    x.ventas += Number(f.subtotal ?? 0);
    x.base += Number(f.subtotal_comision ?? 0);
    base.set(f.vendedor_canonico, x);
  }
  return [...base.entries()].map(([vendedor, x]) => ({
    empresa_key: "american_classic",
    vendedor,
    ventas: round2(x.ventas),
    comision: round2(x.base * 0.005),
  }));
}
