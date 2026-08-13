// Formas que viajan entre `/api/gastos-contabilidad/resumen` y la pantalla, y
// los formateadores de la pantalla. Módulo PURO: no importa nada del servidor,
// así que la ruta y el cliente pueden compartirlo sin arrastrar supabase al
// navegador.
//
// 🔴 Los montos viajan en CENTAVOS ENTEROS y se convierten a dólares UNA vez,
// acá, al pintarlos. Nada de sumar dólares en coma flotante por el camino.

import { centAUsd, type Aviso, type ResumenMes } from "@/lib/mayor/gastos";
import type { ResumenEgresosMes } from "@/lib/egresos/reglas";
import { fmt } from "@/lib/format";

export const API_BASE = "/api/gastos-contabilidad";

// ── Las DOS fuentes ──────────────────────────────────────────────────────────
//
// 🔴 NUNCA SE SUMAN. Son dos formas de medir lo mismo, no dos pedazos de un
// total: el MAYOR es contabilidad devengada (y solo existe cuando la contadora
// cierra el mes); EGRESOS VARIOS es caja (lo que salió, al día). Enero-2026 está
// en las dos, así que sumarlas contaría enero dos veces — y un gasto contado dos
// veces es peor que uno que falta. Por eso la pantalla muestra UNA a la vez y
// dice cuál. Ver `src/lib/egresos/reglas.ts`.

export type FuenteGastos = "egresos" | "mayor";

/** La fuente por defecto: la que está al día. */
export const FUENTE_POR_DEFECTO: FuenteGastos = "egresos";

export const esFuenteValida = (f: string): f is FuenteGastos =>
  f === "egresos" || f === "mayor";

export const FUENTES: ReadonlyArray<{
  clave: FuenteGastos;
  etiqueta: string;
  /** Qué es, en una línea, sin jerga contable. */
  explicacion: string;
}> = [
  {
    clave: "egresos",
    etiqueta: "Lo que salió de caja y banco",
    explicacion:
      "Cada pago que salió de caja o del banco, al día. Es lo que Switch llama Egresos Varios.",
  },
  {
    clave: "mayor",
    etiqueta: "Lo que cerró la contadora",
    explicacion:
      "El mayor contable: solo tiene los meses que la contadora ya cerró, así que va meses atrasado.",
  },
];

export interface EmpresaResumen {
  empresaKey: string;
  nombre: string;
  resumen: ResumenMes;
  avisos: Aviso[];
  /** Último mes CERRADO que tiene esa empresa (`YYYY-MM`), o `null`. */
  ultimoMesCerrado: string | null;
}

export interface RespuestaResumen {
  /** `false` mientras la migración del mayor no haya corrido. */
  instalado: boolean;
  mes: string;
  empresas: EmpresaResumen[];
}

// ── Egresos varios ───────────────────────────────────────────────────────────

export interface EmpresaEgresosResumen {
  empresaKey: string;
  nombre: string;
  resumen: ResumenEgresosMes;
  /** Último mes con movimientos de esa empresa (`YYYY-MM`), o `null`. */
  ultimoMesConMovimientos: string | null;
}

export interface RespuestaEgresos {
  /** `false` mientras la migración de egresos no haya corrido. */
  instalado: boolean;
  mes: string;
  empresas: EmpresaEgresosResumen[];
}

// ── Meses ────────────────────────────────────────────────────────────────────

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const mesValido = (m: string): boolean => MES_RE.test(m);

/** `"2026-07"` → `"julio 2026"`. Tabla fija: el mismo texto en todo navegador. */
export function mesLargo(mes: string): string {
  if (!mesValido(mes)) return mes;
  const [y, m] = mes.split("-");
  return `${MESES[Number(m) - 1]} ${y}`;
}

/** Mes en curso en hora Panamá (UTC-5 fijo, sin horario de verano). */
export function mesActual(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" })
    .format(now)
    .slice(0, 7);
}

export function mesMas(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  return `${ny}-${String(nm + 1).padStart(2, "0")}`;
}

// ── Dinero ───────────────────────────────────────────────────────────────────

/**
 * Centavos → `"$1,234.56"`. Los NEGATIVOS se muestran negativos (`"-$127.78"`):
 * son reversos y ajustes reales de la contabilidad, y taparlos con valor
 * absoluto es el error clásico de este negocio (su firma es que la diferencia da
 * exactamente el doble).
 */
export function usd(cent: number): string {
  const v = centAUsd(cent);
  return `${v < 0 ? "-" : ""}$${fmt(Math.abs(v))}`;
}

/** Lo que se muestra cuando el dato todavía no está conectado. */
export const SIN_DATO = "—";
