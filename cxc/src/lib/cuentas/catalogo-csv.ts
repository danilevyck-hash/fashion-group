/**
 * Parser del CSV del CATÁLOGO DE CUENTAS de Switch (Contabilidad → Catálogo de
 * cuentas → Excel). Módulo PURO: se prueba entero contra el archivo real que
 * bajó Daniel (`src/__tests__/fixtures/catalogo-cuentas-vistana.csv`).
 *
 * ── EL FORMATO, MEDIDO SOBRE EL ARCHIVO REAL (13-ago-2026, Vistana) ─────────
 *
 *   CLASE;GRUPO;CUENTA;SUBCUENTA;AUXILIAR; NOMBRE  CUENTA
 *   "1";"01";"01";"00";"00"; CAJA    MENUDA
 *
 * 147 filas. Separador `;`, los CINCO campos del código entre comillas y el
 * nombre SIN comillas. El código NO viene armado: se arma uniendo los cinco con
 * puntos → `1.01.01.00.00`, que es exactamente la llave de
 * `egresos_varios.cuenta` y de `mayor_lineas.cuenta`.
 *
 * ⚠️ **LOS NOMBRES VIENEN CON ESPACIOS DE MÁS**, y no es una rareza aislada:
 * `" CAJA    MENUDA "`, `" SERVICIOS    PROFESIONALES "`,
 * `" CUENTAS  POR  PAGAR  MULTI  FASHION  HOLDING "`. El encabezado mismo dice
 * `" NOMBRE  CUENTA "`. Se guardan **los dos**: el normalizado (que es el que se
 * pinta) y el CRUDO tal como vino, que es con lo que se audita contra el panel
 * de Switch si algún día un nombre no cuadra.
 *
 * ⚠️ El archivo es ASCII puro (verificado byte a byte), pero se lee tolerando
 * latin-1 igual que el resto de los CSV de Switch: el día que aparezca una `Ñ`
 * no puede convertirse en un nombre roto guardado para siempre.
 */

import { normalizarNombreCuenta } from "./catalogo";

/** Una fila del CSV, ya armada. */
export interface CuentaCsv {
  /** Código de 5 segmentos: `"6.02.01.00.00"`. */
  cuenta: string;
  /** Nombre listo para pintar (espacios colapsados, sin bordes). */
  nombre: string;
  /** El nombre TAL COMO vino, para poder auditarlo contra Switch. */
  nombreCrudo: string;
  /** Cuántos segmentos significan algo (1..5): el último que no es `"00"`. */
  nivel: number;
}

export interface ParseoCatalogoCsv {
  cuentas: CuentaCsv[];
  /** Filas que no se pudieron leer, con el número de línea y el porqué. Se
   *  REPORTAN: una fila del catálogo que se descarta en silencio es una cuenta
   *  que va a salir sin nombre y nadie va a saber por qué. */
  errores: Array<{ linea: number; motivo: string }>;
}

const COLUMNAS = 6;
const SEGMENTOS = 5;
const SEGMENTO_RE = /^\d+$/;

/** Quita las comillas que envuelven un campo, si las tiene. */
function sinComillas(s: string): string {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

/**
 * ¿Esto que llegó es el CSV del catálogo y no un HTML de error?
 *
 * Switch responde HTTP 200 con su página de excepción cuando la ruta no existe,
 * así que el código de estado NO sirve para distinguir: hay que mirar el
 * contenido. Mismo criterio que `pareceCsvDelMayor` y `pareceCsvDeEgresos`.
 */
export function pareceCsvDeCuentas(texto: string): boolean {
  const primera = texto.replace(/^﻿/, "").split(/\r\n|\n|\r/)[0] ?? "";
  if (primera.includes("<") || /<!DOCTYPE|<html/i.test(texto.slice(0, 400))) return false;
  const cols = primera.split(";").map((c) => c.replace(/\s+/g, " ").trim().toLowerCase());
  return (
    cols.includes("clase") &&
    cols.includes("grupo") &&
    cols.includes("cuenta") &&
    cols.includes("subcuenta") &&
    cols.includes("auxiliar")
  );
}

/** El nivel de un código: el último segmento que no es `"00"`, mínimo 1. */
export function nivelDeSegmentos(segmentos: readonly string[]): number {
  let nivel = 1;
  for (let i = 1; i < segmentos.length; i++) {
    if (segmentos[i] !== "00") nivel = i + 1;
  }
  return nivel;
}

/** Lee el CSV entero. NUNCA lanza: lo que no se puede leer va a `errores`. */
export function parsearCatalogoCsv(texto: string): ParseoCatalogoCsv {
  const cuentas: CuentaCsv[] = [];
  const errores: Array<{ linea: number; motivo: string }> = [];
  const vistas = new Set<string>();

  const lineas = texto.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  // La primera línea es el encabezado.
  for (let i = 1; i < lineas.length; i++) {
    const cruda = lineas[i];
    if (cruda.trim() === "") continue;

    const campos = cruda.split(";");
    if (campos.length < COLUMNAS) {
      errores.push({ linea: i + 1, motivo: `tiene ${campos.length} columnas y se esperaban ${COLUMNAS}` });
      continue;
    }

    const segmentos = campos.slice(0, SEGMENTOS).map(sinComillas);
    if (!segmentos.every((s) => SEGMENTO_RE.test(s))) {
      errores.push({ linea: i + 1, motivo: `el código no son 5 números (${segmentos.join(";")})` });
      continue;
    }

    // El nombre puede llevar `;` adentro: se rearma con el resto de los campos.
    const nombreCrudo = campos.slice(SEGMENTOS).join(";");
    const nombre = normalizarNombreCuenta(nombreCrudo);
    if (!nombre) {
      errores.push({ linea: i + 1, motivo: "vino sin nombre" });
      continue;
    }

    const cuenta = segmentos.join(".");
    if (vistas.has(cuenta)) {
      errores.push({ linea: i + 1, motivo: `código repetido (${cuenta})` });
      continue;
    }
    vistas.add(cuenta);

    cuentas.push({ cuenta, nombre, nombreCrudo, nivel: nivelDeSegmentos(segmentos) });
  }

  return { cuentas, errores };
}
