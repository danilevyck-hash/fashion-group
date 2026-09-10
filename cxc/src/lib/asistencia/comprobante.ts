// ─────────────────────────────────────────────────────────────────────────────
// EL COMPROBANTE DE PAGO — el papel que el colaborador firma.
//
// Módulo PURO: sin base, sin red, sin `new Date()`. Recibe la línea de planilla
// ya calculada y devuelve los renglones del papel. NO recalcula ni un centavo.
//
// ── 🩸 POR QUÉ EXISTE ───────────────────────────────────────────────────────
//
// Hasta hoy este papel lo armaba la contadora A MANO en Excel, una pestaña por
// persona. Medido sobre los TRES archivos reales de la II quincena de julio de
// 2026: **34 comprobantes en 13 formatos distintos**, y el renglón de tardanza
// escrito de **23 formas** — «TARDANZAS ()», «TARDANZAS()», «Tardanzas ()»,
// «TARDANZA(45 MINUTOS)», «TARDANZAS (69 minutos  )»… Trece formatos es trece
// oportunidades de que a alguien le falte un renglón y nadie lo note.
//
// ── 🔴 UN SOLO FORMATO PARA LAS TRES EMPRESAS ───────────────────────────────
//
// Daniel, textual: *«Un solo formato, si alguien no lo lleva se pone 0 en el de
// esa persona»*.
//
// O sea: **el renglón se DIBUJA con 0.00, NO se esconde.** Incluye el de
// Impuesto sobre la renta, que hoy solo llevan 2 de los 34 comprobantes. Un
// papel al que le faltan renglones según a quién se le entrega es un papel que
// no se puede comparar con el de al lado, y comparar es justamente para lo que
// sirve.
//
// Lo ÚNICO que cambia por empresa es el NOMBRE de arriba. Ver `EMPRESAS`.
//
// ── 🔴 LOS MINUTOS VAN AL LADO DEL NÚMERO, NUNCA DENTRO DEL TÍTULO ──────────
//
// El rótulo dice siempre «TARDANZAS», seco. Los 45 minutos van en su propia
// columna, a la derecha del monto. Meterlos en el título es exactamente lo que
// produjo las 23 grafías: cada quien escribió el paréntesis a su manera.
// ─────────────────────────────────────────────────────────────────────────────

import type { HorasPersona, LineaPlanilla } from "./planilla";
import { centavos, minutosTardanzaMostrados } from "./planilla";
import { fmtMin } from "./reporte";

/**
 * 🔴 EL NOMBRE DE LA EMPRESA ES LO ÚNICO QUE CAMBIA DE UN COMPROBANTE A OTRO.
 *
 * Escrito a mano y a propósito: son los nombres tal como la contadora los pone
 * hoy en la cabeza de cada Excel. No se derivan de ninguna tabla porque en
 * ninguna tabla están, y adivinarlos —«Fashion Wear» capitalizado desde la
 * `empresa_key`— daría un papel con un nombre que la empresa no usa.
 *
 * ⚠️ Una empresa que no esté acá NO inventa un nombre: cae en `etiqueta`, que
 * es el nombre corto que el módulo ya muestra en pantalla. Nunca queda vacío y
 * nunca lleva el nombre de OTRA empresa.
 */
export const EMPRESAS: Readonly<Record<string, string>> = {
  fashion_wear: "FASHION WEAR",
  confecciones_boston: "CONFECCIONES BOSTON, S.A.",
  vistana: "VISTANA INTERNATIONAL",
};

export function nombreEmpresaComprobante(
  empresa: string | null | undefined,
  etiqueta?: string | null,
): string {
  const k = String(empresa ?? "").trim();
  const nombre = EMPRESAS[k];
  if (nombre) return nombre;
  const alterno = String(etiqueta ?? "").trim();
  return alterno ? alterno.toUpperCase() : "—";
}

const MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

/**
 * «II QUINCENA DE JULIO DE 2026». Es como lo escribe la contadora.
 *
 * ⚠️ Un rango que NO es una quincena no se disfraza de quincena: se dice el
 * rango tal cual. Poner «I QUINCENA» encima de un cuadro del 3 al 9 sería
 * mentirle al que firma.
 */
export function tituloPeriodo(opts: {
  esQuincena: boolean;
  anio?: number | null;
  mes?: number | null;
  n?: 1 | 2 | null;
  etiqueta: string;
}): string {
  if (opts.esQuincena && opts.anio && opts.mes && opts.n) {
    const romano = opts.n === 1 ? "I" : "II";
    return `${romano} QUINCENA DE ${MESES[opts.mes - 1]} DE ${opts.anio}`;
  }
  return String(opts.etiqueta ?? "").toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS RENGLONES
// ─────────────────────────────────────────────────────────────────────────────

/** `dato` = un renglón con monto · `total` = una suma · `seccion` = un título. */
export type TipoRenglon = "dato" | "total" | "seccion";

export interface RenglonComprobante {
  /** Estable, para los candados y para pegarle una nota. */
  clave: string;
  rotulo: string;
  /** `null` SOLO en los títulos de sección. Nunca en un dato. */
  monto: number | null;
  tipo: TipoRenglon;
  /** Sangrado: los renglones de adentro de DEDUCCIONES y DESCUENTOS. */
  adentro: boolean;
  /**
   * Lo que va a la DERECHA del monto, en chico. Hoy solo los minutos de
   * tardanza. `null` = no se escribe nada.
   *
   * 🔴 NUNCA se mete en `rotulo`. Ver la nota de arriba: las 23 grafías.
   */
  nota: string | null;
}

/**
 * 🔴 EL ORDEN Y LA LISTA COMPLETA DEL PAPEL. Es una constante y no un `if` por
 * empresa: el día que alguien quiera esconder un renglón, tiene que borrarlo de
 * acá y el candado se pone rojo.
 *
 * `DESCUENTO POR COMPRAS` no tiene ninguna fuente de datos en el sistema, así
 * que hoy sale SIEMPRE en 0.00. No es un olvido: es el renglón del papel de la
 * contadora, y dibujarlo en cero es exactamente lo que Daniel pidió. El día que
 * se cargue de algún lado, cambia el origen y no el papel.
 */
export const CLAVES_RENGLON = [
  "salarioQuincenal",
  "extra125",
  "extra150",
  "excedente",
  "domingo",
  "feriado",
  "ausencia",
  "tardanzas",
  "totalDevengado",
  "__deducciones",
  "seguroSocial",
  "seguroEducativo",
  "isr",
  "totalDeducciones",
  "__descuentos",
  "prestamo",
  "terceros",
  "compras",
  "mercancia",
  "ajusteAnterior",
  "totalDescuentos",
  "otrosServicios",
  "salarioAPagar",
] as const;

export type ClaveRenglon = (typeof CLAVES_RENGLON)[number];

export interface DatosComprobante {
  /** La línea ya calculada. NO se recalcula nada de acá adentro. */
  linea: LineaPlanilla;
  /**
   * El cargo que va en «POSICION DESEMPEÑADA». Sale de la ficha de la persona.
   * `null` = todavía no se cargó, y el papel lo dice: no se inventa un cargo.
   */
  posicion?: string | null;
  /** La cédula de la ficha, para el pie. `null` = la escribe a mano quien firma. */
  cedula?: string | null;
  /**
   * 🔴 EL AJUSTE DE LA QUINCENA ANTERIOR, y va en DESCUENTOS con su nombre
   * completo. Positivo = se le descuenta; negativo = se le devuelve.
   *
   * Ver `corte-quincena.ts`: la quincena se cierra el día 13 o el 28 para tener
   * los pagos listos, así que los 2-3 días que quedan se pagan como días
   * normales y lo que de verdad pasó en ellos se corrige AQUÍ, en la siguiente.
   *
   * 🔑 NUNCA se mezcla con «AUSENCIA». Son dos cosas distintas: una es lo de
   * esta quincena, la otra es la corrección de la pasada. Sumarlas es perder
   * para siempre la explicación de por qué el neto no da lo que la persona
   * esperaba.
   */
  ajusteAnterior?: number | null;
}

export interface Comprobante {
  empresa: string;
  titulo: string;
  /** «PLANILLA QUINCENAL» · «COMPROBANTE DE PAGO» · el período. */
  encabezado: readonly string[];
  empleado: string;
  posicion: string;
  rataPorHora: number;
  renglones: readonly RenglonComprobante[];
  cedula: string;
  /**
   * `true` cuando la línea no produjo dinero (falta ficha, servicio
   * profesional, «tú decides»). NO se dibuja un comprobante de ceros para
   * alguien a quien el sistema no le calculó nada: sería un papel que dice que
   * cobró $0.00 cuando la verdad es que todavía no se sabe.
   */
  sinDinero: boolean;
}

const n2 = (v: number | null | undefined): number => centavos(Number(v ?? 0) || 0);

/**
 * Los minutos de tardanza que van al lado del monto. `null` si no hubo.
 *
 * 🩸 SALEN DE `minutosTardanzaMostrados`, NUNCA de `horas.tardanzaMin`. Ese
 * segundo es el TOTAL —incluye los días de más de 30 min tarde, que se cobran
 * del lado de AUSENCIA— así que escribirlo acá pondría en el papel unos minutos
 * que no cuadran con los dólares de su propia fila. Es la misma fuente que usan
 * la pantalla, el Excel y el PDF (`textoTardanzas`).
 *
 * ⚠️ Los minutos se miden AL SEGUNDO desde el 13-ago-2026, así que traen
 * fracción: `fmtMin` la conserva. Redondear acá haría que el papel y el Excel
 * digan números distintos del mismo minuto.
 */
export function notaTardanza(horas: HorasPersona | null | undefined): string | null {
  if (!horas) return null;
  const m = minutosTardanzaMostrados(horas);
  if (!(m > 0)) return null;
  return `${fmtMin(m)} min`;
}

/**
 * Arma el papel de UNA persona.
 *
 * 🔴 LOS NÚMEROS SALEN TAL CUAL DE `linea.dinero`. Lo único que este módulo
 * SUMA son los dos subtotales del papel, y los suma porque el papel los parte
 * en dos donde el módulo tiene uno solo:
 *
 *     TOTAL DE DEDUCCIONES = seguros + ISR
 *     TOTAL DE DESCUENTOS  = préstamo + terceros + compras + mercancía + ajuste
 *
 * y las dos juntas dan EXACTAMENTE `dinero.totalDeducciones` (más el ajuste,
 * que es nuevo). Hay candado que lo exige: el día que las dos cuentas se
 * separen, el papel diría un neto que la planilla no pagó.
 */
export function armarComprobante(
  datos: DatosComprobante,
  periodo: { esQuincena: boolean; anio?: number | null; mes?: number | null; n?: 1 | 2 | null; etiqueta: string },
): Comprobante {
  const { linea } = datos;
  const d = linea.dinero;
  const empresa = nombreEmpresaComprobante(linea.empresa, linea.empresaEtiqueta);
  const titulo = tituloPeriodo(periodo);
  const ajuste = n2(datos.ajusteAnterior);

  const v = (x: number | null | undefined) => (d ? n2(x) : 0);

  const totalDeducciones = centavos(v(d?.seguroSocial) + v(d?.seguroEducativo) + v(d?.isr));
  const compras = 0; // sin fuente de datos hoy — ver la nota de CLAVES_RENGLON
  const totalDescuentos = centavos(
    v(d?.prestamo) + v(d?.terceros) + compras + v(d?.mercancia) + ajuste,
  );
  // 🔴 El neto del papel = el neto de la planilla, menos el ajuste. El ajuste es
  // lo ÚNICO que este módulo le puede mover al neto, y solo porque es un
  // renglón que la planilla todavía no tiene.
  const salarioAPagar = centavos(v(d?.netoPagar) - ajuste);

  const R = (
    clave: ClaveRenglon,
    rotulo: string,
    monto: number | null,
    tipo: TipoRenglon,
    adentro: boolean,
    nota: string | null = null,
  ): RenglonComprobante => ({ clave, rotulo, monto, tipo, adentro, nota });

  const renglones: RenglonComprobante[] = [
    R("salarioQuincenal", "SALARIO QUINCENAL", v(d?.salarioQuincenal), "dato", false),
    R("extra125", "HORAS EXTRAS 1.25", v(d?.extraDiurno), "dato", false),
    R("extra150", "HORAS EXTRAS 1.50", v(d?.extraNocturno), "dato", false),
    R("excedente", "EXEDENTE DE HORAS EXTRAS SEMANAL", v(d?.excedente), "dato", false),
    R("domingo", "DOMINGO", v(d?.domingos), "dato", false),
    R("feriado", "FERIADO", v(d?.feriados), "dato", false),
    R("ausencia", "AUSENCIA", v(d?.ausencias), "dato", false),
    R("tardanzas", "TARDANZAS", v(d?.tardanzas), "dato", false,
      notaTardanza(linea.horas)),
    R("totalDevengado", "TOTAL DEVENGADO", v(d?.totalBruto), "total", false),

    R("__deducciones", "DEDUCCIONES:", null, "seccion", false),
    R("seguroSocial", "SEGURO SOCIAL", v(d?.seguroSocial), "dato", true),
    R("seguroEducativo", "SEGURO EDUCATIVO", v(d?.seguroEducativo), "dato", true),
    R("isr", "IMPUESTO SOBRE LA RENTA", v(d?.isr), "dato", true),
    R("totalDeducciones", "TOTAL DE DEDUCCIONES", totalDeducciones, "total", true),

    R("__descuentos", "DESCUENTOS :", null, "seccion", false),
    R("prestamo", "PRESTAMO", v(d?.prestamo), "dato", true),
    R("terceros", "DESCUENTO A TERCEROS", v(d?.terceros), "dato", true),
    R("compras", "DESCUENTO POR COMPRAS", compras, "dato", true),
    R("mercancia", "DAÑO DE MERCANCIA", v(d?.mercancia), "dato", true),
    R("ajusteAnterior", "AJUSTE QUINCENA ANTERIOR", ajuste, "dato", true),
    R("totalDescuentos", "TOTAL DE DESCUENTOS", totalDescuentos, "total", true),

    R("otrosServicios", "OTROS SERVICIOS", v(d?.otrosServicios), "dato", false),
    R("salarioAPagar", "SALARIO A PAGAR", salarioAPagar, "total", false),
  ];

  return {
    empresa,
    titulo,
    encabezado: ["PLANILLA QUINCENAL", "COMPROBANTE DE PAGO", titulo],
    empleado: linea.nombre?.trim() || linea.etiqueta,
    // Sin cargo cargado se dice que falta; no se escribe un cargo inventado.
    posicion: String(datos.posicion ?? "").trim() || "—",
    rataPorHora: v(d?.rataHora),
    renglones,
    cedula: String(datos.cedula ?? "").trim(),
    sinDinero: !d,
  };
}

/**
 * Los que SÍ llevan comprobante de un cuadro entero.
 *
 * 🔴 Se saltan las líneas sin dinero (servicio profesional, falta ficha, «tú
 * decides»). No es esconder un renglón —eso está prohibido— es no fabricar un
 * papel entero de ceros para alguien a quien todavía nadie le calculó el pago.
 */
export function lineasConComprobante(
  lineas: readonly LineaPlanilla[],
): readonly LineaPlanilla[] {
  return lineas.filter((l) => !!l.dinero);
}
