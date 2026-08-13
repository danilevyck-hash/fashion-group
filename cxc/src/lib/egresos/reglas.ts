/**
 * Reglas de negocio de EGRESOS VARIOS (Caja y Bancos → Reportes → Egresos
 * Varios). Módulo PURO: recibe renglones ya parseados y devuelve el resumen. No
 * toca la base ni la red, así que se prueba entero contra el archivo real que
 * bajó Daniel (`src/__tests__/fixtures/egresos-vistana-2026.csv`).
 *
 * ── 🔑 LO MÁS IMPORTANTE: "SALIÓ PLATA" NO ES "GASTÉ" ───────────────────────
 *
 * El reporte trae TODO lo que sale de caja y banco, no solo los gastos. Medido
 * sobre los 378 renglones reales de Vistana (1-ene → 13-ago-2026, $243.342,48):
 *
 *   grupo 6  GASTOS      233 renglones  $118.753,76   ← esto es GASTO
 *   grupo 2  pasivos     101            $ 36.012,81   ← planilla por pagar, etc.
 *   grupo 1  activos      40            $ 83.439,75   ← transferencias, anticipos
 *   grupo 3  patrimonio    2            $  4.212,34
 *   grupo 5  costos        2            $    923,82
 *
 * Pintar los $243.342,48 como "gastos del mes" contaría como gasto una
 * transferencia entre cuentas propias y un préstamo devuelto — plata que salió
 * pero que no es un gasto. Por eso el resumen devuelve **los dos números** y la
 * pantalla los muestra separados: lo que SALIÓ y, de eso, lo que es GASTO.
 *
 * El criterio de "gasto" es EL MISMO del mayor (`esGasto` de `mayor/gastos.ts`,
 * grupo 6): dos definiciones de gasto en el mismo módulo serían dos totales
 * distintos para la misma pregunta.
 *
 * ── 🔴 ESTA FUENTE NO SE SUMA CON EL MAYOR. NUNCA ───────────────────────────
 *
 * Son dos formas de medir lo mismo, no dos pedazos de un total:
 *   · el MAYOR es contabilidad devengada (incluye depreciación, provisiones,
 *     planilla causada) y solo existe cuando la contadora cierra el mes;
 *   · EGRESOS VARIOS es caja: lo que efectivamente salió, al día.
 *
 * Enero-2026 de Vistana está en las DOS (el mayor tiene enero cerrado y el
 * reporte de caja también), así que sumarlas contaría enero dos veces. Y no hay
 * forma honesta de "restar la intersección": los montos ni siquiera coinciden
 * —enero por caja son 24 renglones de gasto por $11.862,74— porque miden cosas
 * distintas. Por eso la pantalla muestra UNA fuente a la vez, dice cuál es, y
 * `sumarFuentes` no existe. Un gasto contado dos veces es peor que uno que falta.
 */

import { esGasto } from "@/lib/mayor/gastos";
import {
  codigoVisible,
  nombreDeCuenta,
  type NombresDeCuentas,
} from "@/lib/cuentas/catalogo";
import type { EgresoLinea } from "./parser";

export { esGasto };

/** `"6.03.98.00.00"` → `"6.03.98"` (los 3 segmentos que se muestran). */
export function cuentaCorta(cuenta: string): string {
  return cuenta.split(".").slice(0, 3).join(".");
}

/** `"6.03.98.00.00"` → `"6"`. */
export function grupoDeCuenta(cuenta: string): string {
  return cuenta.split(".")[0] ?? "";
}

/**
 * En qué situación está el mes.
 *
 *  - `con_movimientos` → se pidió el mes y trajo egresos.
 *  - `sin_movimientos` → se pidió y volvió vacío. Legítimo: hay empresas que no
 *                        mueven caja todos los meses.
 *  - `sin_datos`       → ese mes nunca se pidió a Switch. No sabemos nada.
 *
 * ⚠️ `sin_movimientos` y `sin_datos` NO son lo mismo y no pueden verse iguales:
 * el primero autoriza a decir "no salió plata"; el segundo, solo a decir "no
 * sabemos". Es la misma distinción que sostiene el módulo del mayor.
 */
export type EstadoEgresos = "con_movimientos" | "sin_movimientos" | "sin_datos";

export const ETIQUETA_ESTADO_EGRESOS: Record<EstadoEgresos, string> = {
  con_movimientos: "Al día",
  sin_movimientos: "Sin movimientos",
  sin_datos: "No traído",
};

/** Una cuenta con lo que salió por ella en el mes. */
export interface CuentaEgreso {
  /** Código completo de 5 segmentos: la llave contra la contabilidad. */
  cuenta: string;
  /** Los 3 segmentos que agrupan la cuenta ("6.03.98"). Es la llave de las
   *  reglas de negocio (ISR, cuentas sin salida de caja), NO lo que se pinta. */
  corta: string;
  /** El código como lo enseña Switch, sin los ceros de relleno del final y
   *  nunca por debajo de 3 segmentos ("2.01.04.02"). Es lo que se PINTA, y va
   *  al mismo nivel que `nombre` para que código y nombre no se contradigan. */
  visible: string;
  /** Nombre de la cuenta, del catálogo de Switch (o del mayor, como respaldo).
   *  `null` cuando no se sabe: **nunca se inventa** — ver `lib/cuentas/catalogo`. */
  nombre: string | null;
  /** Grupo contable ("6" = gasto). */
  grupo: string;
  /** ¿Es gasto? (grupo 6). Mismo criterio que el mayor. */
  esGasto: boolean;
  totalCent: number;
  renglones: number;
  /** Hasta 3 referencias, para saber de qué se trata sin abrir nada más. */
  ejemplos: string[];
}

/** ¿Qué rangos se le pidieron a Switch? Cada uno es un `[desde, hasta]` ISO. */
export interface Cobertura {
  desde: string;
  hasta: string;
}

export interface ResumenEgresosMes {
  mes: string;
  estado: EstadoEgresos;
  /** TODO lo que salió de caja y banco. */
  totalSalidaCent: number;
  /** De eso, lo que es GASTO (grupo 6). */
  totalGastoCent: number;
  /** De eso, lo que NO es gasto (transferencias, pasivos, patrimonio, costos). */
  totalNoGastoCent: number;
  /** Cuentas de GASTO, de mayor a menor. */
  cuentasGasto: CuentaEgreso[];
  /** Cuentas que NO son gasto, de mayor a menor. */
  cuentasNoGasto: CuentaEgreso[];
  /** Nº de renglones del mes. */
  renglones: number;
  /** Nº de documentos DISTINTOS (`N.INTERNO`). Si difiere de `renglones`, hay
   *  egresos repartidos en más de una cuenta — que es legítimo y hay que poder
   *  verlo, no un duplicado. */
  documentos: number;
}

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const mesEgresosValido = (m: string): boolean => MES_RE.test(m);

/** `"2026-02"` → `"2026-02-28"`. */
export function ultimoDiaDelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes}-${String(d).padStart(2, "0")}`;
}

/**
 * ¿El mes cae dentro de algún rango traído?
 *
 * ⚠️ A DIFERENCIA DEL MAYOR, alcanza con que el rango pedido TOQUE el mes, no
 * que lo cubra entero. El mes en curso nunca puede estar cubierto hasta el 31
 * (el rango se pide hasta hoy), y exigir cobertura completa lo dejaría siempre
 * en "no traído" — o sea, el mes que más se mira sería el único invisible.
 */
export function mesTocado(mes: string, coberturas: readonly Cobertura[]): boolean {
  const primero = `${mes}-01`;
  const ultimo = ultimoDiaDelMes(mes);
  return coberturas.some((c) => c.desde <= ultimo && c.hasta >= primero);
}

const MAX_EJEMPLOS = 3;

/**
 * Resume UN mes a partir de sus renglones.
 *
 * `nombres` es el diccionario de esa EMPRESA (código completo → nombre). Es
 * opcional: sin él las cuentas salen con `nombre: null` y la pantalla muestra el
 * código pelado, que es como se veía antes de que existiera el catálogo.
 */
export function resumirMesEgresos(
  mes: string,
  lineasDelMes: readonly EgresoLinea[],
  coberturas: readonly Cobertura[],
  nombres: NombresDeCuentas = new Map(),
): ResumenEgresosMes {
  const estado: EstadoEgresos =
    lineasDelMes.length > 0
      ? "con_movimientos"
      : mesTocado(mes, coberturas)
        ? "sin_movimientos"
        : "sin_datos";

  const porCuenta = new Map<string, CuentaEgreso>();
  for (const l of lineasDelMes) {
    const prev = porCuenta.get(l.cuenta);
    if (prev) {
      prev.totalCent += l.totalCent;
      prev.renglones += 1;
      if (prev.ejemplos.length < MAX_EJEMPLOS && l.referencia && !prev.ejemplos.includes(l.referencia)) {
        prev.ejemplos.push(l.referencia);
      }
    } else {
      porCuenta.set(l.cuenta, {
        cuenta: l.cuenta,
        corta: cuentaCorta(l.cuenta),
        visible: codigoVisible(l.cuenta),
        nombre: nombreDeCuenta(l.cuenta, nombres),
        grupo: grupoDeCuenta(l.cuenta),
        esGasto: esGasto(l.cuenta),
        totalCent: l.totalCent,
        renglones: 1,
        ejemplos: l.referencia ? [l.referencia] : [],
      });
    }
  }

  const todas = [...porCuenta.values()];
  // De mayor a menor. Un egreso negativo (reverso) queda al final, que es donde
  // se lo quiere ver. NUNCA valor absoluto: es el error clásico de este negocio.
  const porMonto = (a: CuentaEgreso, b: CuentaEgreso) => b.totalCent - a.totalCent;
  const cuentasGasto = todas.filter((c) => c.esGasto).sort(porMonto);
  const cuentasNoGasto = todas.filter((c) => !c.esGasto).sort(porMonto);

  const suma = (xs: readonly CuentaEgreso[]) => xs.reduce((acc, c) => acc + c.totalCent, 0);
  const totalGastoCent = suma(cuentasGasto);
  const totalNoGastoCent = suma(cuentasNoGasto);

  return {
    mes,
    estado,
    totalSalidaCent: totalGastoCent + totalNoGastoCent,
    totalGastoCent,
    totalNoGastoCent,
    cuentasGasto,
    cuentasNoGasto,
    renglones: lineasDelMes.length,
    documentos: new Set(lineasDelMes.map((l) => l.nInterno)).size,
  };
}

// ── Anti-duplicado ───────────────────────────────────────────────────────────

/**
 * Renglones que comparten LA MISMA identidad exacta.
 *
 * La identidad de un renglón es `(N.INTERNO, cuenta, fecha, monto)`, **no
 * `N.INTERNO` a secas**: un mismo egreso puede repartirse legítimamente en
 * varias cuentas contables, y colapsarlo por documento PERDERÍA plata — que es
 * el error simétrico y también caro. Con esta llave, dos renglones iguales solo
 * pueden ser el MISMO renglón contado dos veces.
 *
 * Se REPORTA, no se descarta en silencio: en los 378 renglones reales de Vistana
 * no hay ni uno, así que si algún día aparece hay que mirarlo, no taparlo.
 */
export function duplicadosExactos(lineas: readonly EgresoLinea[]): EgresoLinea[] {
  const vistos = new Set<string>();
  const repetidos: EgresoLinea[] = [];
  for (const l of lineas) {
    const clave = claveIdentidad(l);
    if (vistos.has(clave)) repetidos.push(l);
    else vistos.add(clave);
  }
  return repetidos;
}

/** La llave de identidad de un renglón. Un solo lugar. */
export function claveIdentidad(l: Pick<EgresoLinea, "nInterno" | "cuenta" | "fecha" | "totalCent">): string {
  return `${l.nInterno}|${l.cuenta}|${l.fecha}|${l.totalCent}`;
}

/** Centavos enteros → dólares con 2 decimales exactos. */
export function centAUsd(cent: number): number {
  return Math.round(cent) / 100;
}
