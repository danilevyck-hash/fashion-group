// ─────────────────────────────────────────────────────────────────────────────
// Campos derivados del ledger de CxP (Comprado YTD, Pagado YTD, Último pago).
//
// Módulo PURO: no toca base ni red. Lo usan DOS lugares, y por eso vive aparte:
//   - src/lib/switch-api/sync-proveedores.ts → escribe las columnas al sincronizar
//   - src/lib/proveedores.ts                 → las RECALCULA al leer, desde el
//     mismo `elements` que ya está guardado en la fila
// Recalcular al leer no es redundancia: arregla las filas viejas sin esperar al
// cron (que corre 1×/día) y mantiene "hace N días" fresco entre corridas.
//
// 🩸 EL BUG QUE ARREGLA (27-jul-2026). `parseFecha()` exigía **DD-MM-YYYY**:
//     const m = s.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
// pero `/apiproveedor/info` devuelve `fechaCreacion` en **YYYY-MM-DD**. Medido
// contra los 821 renglones guardados en `switch_proveedor_estadocuenta`:
// **821 en YYYY-MM-DD, 0 en DD-MM-YYYY** → la función devolvía null 821 de 821
// veces y, como todo el cálculo vive dentro de `if (f && …)`, las tres columnas
// quedaban en cero/vacío en **66 de 66 filas, en las 7 empresas**. El comentario
// del código documentaba un formato que el endpoint no usa (se copió del estado
// de cuenta de CXC, que sí es DD-MM-YYYY — ver `parseFechaDMY` en switch-api/parse.ts).
// Acá se aceptan LOS DOS formatos: el real y el que decía el comentario.
//
// ⚠️ Panamá es UTC−5 FIJO (sin horario de verano) y el año se corta en hora
// PANAMÁ, no en UTC. `new Date().getUTCFullYear()` —lo que usaba el sync— ya es
// el año siguiente entre las 19:00 y las 23:59 del 31 de diciembre en Panamá:
// durante esas 5 horas el YTD se habría vaciado un día antes de tiempo. Y una
// fecha con hora se lleva al día-calendario de Panamá antes de mirarle el año.
// ─────────────────────────────────────────────────────────────────────────────

import { hoyPanama } from "@/lib/fecha-panama";

/** Un renglón del ledger que devuelve /apiproveedor/info → estadodecuenta.elements. */
export interface ElementoLedger {
  fechaCreacion?: unknown;
  credito?: unknown;
  debito?: unknown;
  total?: unknown;
  saldo?: unknown;
  dias?: unknown;
  abrev?: unknown;
  tipoComprobante?: unknown;
}

export interface DerivadosProveedor {
  comprado_ytd: number;
  pagado_ytd: number;
  num_facturas: number;
  num_pagos: number;
  ultimo_pago_monto: number | null;
  ultimo_pago_fecha: string | null; // YYYY-MM-DD
  ultimo_pago_dias: number | null;
}

export const DERIVADOS_VACIOS: DerivadosProveedor = {
  comprado_ytd: 0,
  pagado_ytd: 0,
  num_facturas: 0,
  num_pagos: 0,
  ultimo_pago_monto: null,
  ultimo_pago_fecha: null,
  ultimo_pago_dias: null,
};

/** Switch manda montos en formato US ("41,428.0000"). Number() de eso es NaN. */
export function montoSwitch(x: unknown): number {
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  const n = Number(String(x ?? "").trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const r2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/**
 * Fecha-calendario de PANAMÁ (YYYY-MM-DD) de un `fechaCreacion` del ledger.
 * Devuelve null si no se reconoce — nunca una fecha inventada.
 *
 * Formatos aceptados:
 *   YYYY-MM-DD              ← lo que manda Switch hoy (821/821 renglones)
 *   DD-MM-YYYY              ← lo que decía el comentario viejo; se acepta por si
 *                             el endpoint vuelve al formato del estado de cuenta
 *   YYYY-MM-DD HH:mm[:ss]   ← sin zona: convención de Switch = hora Panamá, así
 *                             que el día ya es el correcto (ver switch-api/parse.ts)
 *   ISO con Z u offset      ← instante real: se lleva a UTC−5 ANTES de cortar el día
 */
export function fechaPanamaDelLedger(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "") return null;

  // ISO con zona explícita (Z o ±hh:mm) → el día depende de la zona: convertir.
  const conZona = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/);
  if (conZona) {
    const ms = Date.parse(s.replace(" ", "T"));
    if (!Number.isFinite(ms)) return null;
    // UTC−5 fijo: restar 5h y leer el día en UTC da el día-calendario de Panamá.
    return new Date(ms - 5 * 3600_000).toISOString().slice(0, 10);
  }

  // YYYY-MM-DD, con o sin hora SIN zona (hora Panamá por convención → mismo día).
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)?$/);
  if (iso) return diaValido(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;

  // DD-MM-YYYY (formato del estado de cuenta de CXC).
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return diaValido(Number(dmy[3]), Number(dmy[2]), Number(dmy[1])) ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;

  return null;
}

/** Rechaza zero-dates ("0000-00-00") y componentes imposibles ("2026-13-40"). */
function diaValido(anio: number, mes: number, dia: number): boolean {
  if (anio < 2000 || anio > 2999 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Año en curso en hora PANAMÁ. El corte del YTD es el 1-ene 00:00 de Panamá. */
export function anioPanama(ahora: Date = new Date()): number {
  return Number(hoyPanama(ahora).slice(0, 4));
}

/** ¿La fecha (YYYY-MM-DD de Panamá) cae en el año `anio`? Rango [1-ene, 1-ene+1). */
export function esDelAnio(fechaPanama: string, anio: number): boolean {
  return fechaPanama >= `${anio}-01-01` && fechaPanama < `${anio + 1}-01-01`;
}

/**
 * ¿Este renglón es un PAGO de verdad?
 *
 * El agregador viejo clasificaba por `debito > 0` a secas, y con eso las **notas
 * de crédito contaban como pagos**: medido sobre los 90 renglones con débito,
 * 57 son "Pago a proveedores" y 33 son "Nota de Crédito". La consecuencia se veía
 * en pantalla: en 6 de las 17 filas con débito el "Último pago" habría mostrado
 * la fecha de una NOTA DE CRÉDITO —plata que nunca salió—, y 5 proveedores que
 * NUNCA recibieron un pago habrían mostrado uno. Una nota de crédito baja lo que
 * se debe, no es un pago.
 */
export function esPagoAProveedor(el: ElementoLedger): boolean {
  const abrev = String(el.abrev ?? "").trim().toUpperCase();
  if (abrev === "PP") return true;
  if (abrev === "NC" || abrev === "ND") return false;
  return String(el.tipoComprobante ?? "").toUpperCase().includes("PAGO");
}

/**
 * Monto del DOCUMENTO, no del saldo abierto.
 *
 * `credito`/`debito` traen el saldo que le queda al documento, no lo que dice el
 * documento: medido, `credito === saldo` en 731/731 renglones de cargo y
 * `debito === |saldo|` en 90/90. Sumarlos bajo el rótulo "Comprado YTD" da el
 * saldo por cobrar de las facturas del año — de hecho salía IDÉNTICO a la columna
 * "Por pagar" en 17 de 32 filas, y para LATIN FITNESS (active_wear) habría dicho
 * $81.430,83 comprado cuando las facturas del año suman $206.430,83. `total` sí
 * es el monto del documento (no es acumulado: el acumulado es `saldoConsecutivo`).
 */
export function montoDocumento(el: ElementoLedger): number {
  const total = montoSwitch(el.total);
  if (total > 0) return total;
  return montoSwitch(el.credito) + montoSwitch(el.debito);
}

/**
 * Calcula los campos derivados de una fila de CxP a partir de su ledger.
 *
 * ⚠️ LÍMITE DEL DATO, no del cálculo: `/apiproveedor/info` devuelve solo el
 * ledger ABIERTO (verificado: 0 de 821 renglones tienen saldo cero). Una factura
 * del año ya pagada por completo desaparece de ahí, así que "Comprado YTD" y
 * "Pagado YTD" cubren lo del año que TODAVÍA figura en la cuenta y se quedan
 * cortos. `Último pago` no tiene ese problema. Queda anotado para que nadie lea
 * estas dos columnas como el total comprado/pagado del año.
 */
export function derivarProveedor(
  elements: ElementoLedger[] | null | undefined,
  opts: { hoy?: string; anio?: number } = {},
): DerivadosProveedor {
  const hoy = opts.hoy ?? hoyPanama();
  const anio = opts.anio ?? Number(hoy.slice(0, 4));

  let comprado_ytd = 0;
  let pagado_ytd = 0;
  let num_facturas = 0;
  let num_pagos = 0;
  let ultimo: { monto: number; fecha: string } | null = null;

  for (const el of elements ?? []) {
    const fecha = fechaPanamaDelLedger(el.fechaCreacion);
    const enElAnio = fecha != null && esDelAnio(fecha, anio);

    if (montoSwitch(el.credito) > 0) {
      num_facturas++;
      if (enElAnio) comprado_ytd += montoDocumento(el);
    }

    if (montoSwitch(el.debito) > 0 && esPagoAProveedor(el)) {
      num_pagos++;
      if (enElAnio) pagado_ytd += montoDocumento(el);
      // Último pago: el de fecha más reciente. Sin fecha legible no compite —
      // preferimos vacío antes que inventar una.
      if (fecha != null && (ultimo === null || fecha > ultimo.fecha)) {
        ultimo = { monto: montoDocumento(el), fecha };
      }
    }
  }

  return {
    comprado_ytd: r2(comprado_ytd),
    pagado_ytd: r2(pagado_ytd),
    num_facturas,
    num_pagos,
    ultimo_pago_monto: ultimo ? r2(ultimo.monto) : null,
    ultimo_pago_fecha: ultimo ? ultimo.fecha : null,
    ultimo_pago_dias: ultimo ? diasDesde(ultimo.fecha, hoy) : null,
  };
}

/**
 * Días entre dos fechas-calendario de Panamá. Se calcula acá en vez de copiar el
 * `dias` que manda Switch por dos razones: ese número se congela en la corrida
 * del sync (que es 1×/día) y encima viene en valor ABSOLUTO — el único documento
 * con fecha futura del ledger (12-dic-2026) trae `dias: 137`, que leído como
 * "hace 137 días" es falso. Nunca devuelve negativo.
 */
export function diasDesde(fecha: string, hoy: string): number {
  const a = Date.parse(`${fecha}T00:00:00Z`);
  const b = Date.parse(`${hoy}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
