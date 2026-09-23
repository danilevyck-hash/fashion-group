// ============================================================================
// Marketing — EL PERÍODO DE UNA MARCA: dos estados y nada más. Módulo PURO.
//
// Daniel (22-sep-2026): *«no quiero pipeline, cuando lo cierro es porque lo
// cobré»*. El contenedor es la MARCA y su PERÍODO: es lo que se le manda y lo
// que la marca reconoce. Abierto → Cerrado. Cerrar = llegó la nota de crédito.
// Al cerrar LE PONE EL NOMBRE ÉL, y el siguiente SE ABRE SOLO.
//
// 🔴 LA NOTA DE CRÉDITO ES UN TEXTO, Y NO SE CALCULA NADA CON ELLA. Daniel:
// *«si te respondo que sí al 50 % harás toda una cosa innecesariamente»*. Acá
// no hay `Number(notaCredito)`, ni porcentaje, ni resta contra el total, y hay
// candado que lo barre.
//
// 🔴 QUÉ SUMA EN EL PERÍODO: solo lo que `se_reporta`. Lo apagado se guarda,
// se ve en la tienda marcado, no va al ZIP y NO SUMA. Y los gastos de las
// marcas NUNCA se suman entre sí: este módulo suma UN período de UNA marca.
//
// 🔴 EL ZIP se baja cuando se quiera desde el período abierto y SE GUARDA
// CADA UNO que se bajó (hoy `mk_periodos.reporte` está NULL en los 6). Cerrar
// no genera nada. El registro es una lista append-only en `zips_bajados`.
// ============================================================================

import { formatearFecha } from "./normalizar";

/** Los dos estados. Lista CERRADA: no hay «enviado», «cobrado» ni «en proceso». */
export const ESTADOS_PERIODO = ["abierto", "cerrado"] as const;
export type EstadoPeriodo = (typeof ESTADOS_PERIODO)[number];

/** A dónde se puede pasar desde cada estado. Cerrado no va a ningún lado. */
export const TRANSICIONES: Record<EstadoPeriodo, readonly EstadoPeriodo[]> = {
  abierto: ["cerrado"],
  cerrado: [],
};

export function esEstadoPeriodo(v: unknown): v is EstadoPeriodo {
  return v === "abierto" || v === "cerrado";
}

/** ¿Se puede cerrar? Solo lo abierto. */
export function puedeCerrar(estado: unknown): boolean {
  return estado === "abierto" && TRANSICIONES.abierto.includes("cerrado");
}

/** ¿Se puede registrar un gasto o bajar el ZIP? Solo en lo abierto. */
export function aceptaGastos(estado: unknown): boolean {
  return estado === "abierto";
}

// ─── QUÉ SUMA ───────────────────────────────────────────────────────────────

/** Lo mínimo de un gasto que el período necesita para sumar. */
export interface GastoDelPeriodo {
  monto: number;
  /** `false` explícito = apagado. `undefined`/`null` = prendido (lo de hoy). */
  seReporta?: boolean | null;
}

/** 🔴 ¿Cuenta para el total del período y va al ZIP? Solo si NO está apagado. */
export function sumaEnElPeriodo(g: Pick<GastoDelPeriodo, "seReporta">): boolean {
  return g.seReporta !== false;
}

export interface TotalesDelPeriodo {
  /** Lo que se le reporta a la marca. El ÚNICO total que se le muestra. */
  reportado: number;
  /** Lo que se guardó apagado: se ve en la tienda, no en el total de la marca. */
  noReportado: number;
  cantidadReportada: number;
  cantidadNoReportada: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Los dos totales de UN período de UNA marca, separados. Nunca se suman. */
export function totalesDelPeriodo(gastos: ReadonlyArray<GastoDelPeriodo>): TotalesDelPeriodo {
  let reportado = 0;
  let noReportado = 0;
  let cantidadReportada = 0;
  let cantidadNoReportada = 0;
  for (const g of gastos) {
    const monto = Number(g.monto);
    if (!Number.isFinite(monto)) continue;
    if (sumaEnElPeriodo(g)) {
      reportado += monto;
      cantidadReportada += 1;
    } else {
      noReportado += monto;
      cantidadNoReportada += 1;
    }
  }
  return {
    reportado: round2(reportado),
    noReportado: round2(noReportado),
    cantidadReportada,
    cantidadNoReportada,
  };
}

// ─── CERRAR, Y ABRIR EL SIGUIENTE ───────────────────────────────────────────

/** Lo que Daniel escribe al cerrar. */
export interface CierreInput {
  /** El nombre con el que se cierra. Obligatorio: es lo que la marca reconoce. */
  nombreAlCerrar: unknown;
  /** Texto libre, opcional. NO es un número. */
  notaCredito?: unknown;
  /** Quién cierra. */
  cerradoPor: string;
  /** El instante del cierre, ISO. Lo pone quien llama (el servidor). */
  ahoraISO: string;
}

/** El parche que se le escribe al período que se cierra. */
export interface PatchDeCierre {
  estado: "cerrado";
  cerrado_en: string;
  cerrado_por: string;
  nombre_al_cerrar: string;
  nota_credito: string | null;
}

/** El mensaje cuando el nombre no viene. Uno solo, para pantalla y servidor. */
export const MSG_FALTA_NOMBRE = "Ponle un nombre al período antes de cerrarlo.";

/**
 * Arma el cierre. Valida el nombre y recorta la nota de crédito como TEXTO.
 * Lanza si el período no está abierto o el nombre viene vacío.
 */
export function armarCierre(
  periodo: { estado: unknown },
  input: CierreInput,
): PatchDeCierre {
  if (!puedeCerrar(periodo.estado)) throw new Error("Este período ya está cerrado.");
  const nombre = String(input.nombreAlCerrar ?? "").replace(/\s+/g, " ").trim();
  if (nombre.length === 0) throw new Error(MSG_FALTA_NOMBRE);
  const nota = String(input.notaCredito ?? "").replace(/\s+/g, " ").trim();
  return {
    estado: "cerrado",
    cerrado_en: input.ahoraISO,
    cerrado_por: String(input.cerradoPor ?? "").trim() || "sistema",
    nombre_al_cerrar: nombre,
    nota_credito: nota.length > 0 ? nota : null,
  };
}

/** La fila que se inserta para el período que sigue. */
export interface PeriodoSiguiente {
  /** La columna conserva su nombre viejo a propósito (ver `bloques.ts`). */
  proveedor_key: string;
  nombre: string;
  estado: "abierto";
  abierto_en: string;
}

/**
 * 🔴 El nombre por defecto del que se abre solo: dice desde cuándo. Daniel le
 * pone el nombre definitivo cuando lo cierre (`nombre_al_cerrar`).
 *   hoyPanama = "2026-09-22" → "Desde el 22 sep 2026"
 */
export function nombrePorDefectoDelSiguiente(hoyPanama: string): string {
  return `Desde el ${formatearFecha(hoyPanama)}`;
}

/**
 * El siguiente período de la MISMA marca, listo para insertarse. Puro: recibe
 * el «hoy» de Panamá y el instante, no los inventa.
 */
export function abrirSiguiente(args: {
  marcaCodigo: string;
  hoyPanama: string;
  ahoraISO: string;
}): PeriodoSiguiente {
  const marca = String(args.marcaCodigo ?? "").trim();
  if (marca.length === 0) throw new Error("El período siguiente necesita su marca.");
  return {
    proveedor_key: marca,
    nombre: nombrePorDefectoDelSiguiente(args.hoyPanama),
    estado: "abierto",
    abierto_en: args.ahoraISO,
  };
}

// ─── EL REGISTRO DE CADA ZIP BAJADO ─────────────────────────────────────────

/** Un ZIP que se bajó. Se anota cada vez; ninguno se pisa. */
export interface RegistroZip {
  bajado_en: string;
  bajado_por: string;
  /** Cuántos gastos entraron (solo los que se reportan). */
  gastos: number;
  /** Cuánto sumaban, en dólares. */
  monto: number;
  /** Ruta del archivo en el bucket privado `marketing`. */
  archivo_path: string;
}

/**
 * La lista con el ZIP nuevo al final. Nunca reemplaza ni recorta: es el
 * historial de lo que se le mandó a la marca. Lo que no sea lista se lee como
 * lista vacía (la columna recién nacida o sin la migración).
 */
export function anotarZip(lista: unknown, registro: RegistroZip): RegistroZip[] {
  const previos = Array.isArray(lista) ? (lista as RegistroZip[]) : [];
  return [...previos, { ...registro, monto: round2(Number(registro.monto) || 0) }];
}
