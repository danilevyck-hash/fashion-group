/**
 * 🔴 EL CUADRE DEL ESTADO DE CUENTA SE LEE DESDE ADENTRO (18-sep-2026).
 *
 * `/apicliente/estadocuenta` manda el saldo que Switch mismo calculó, pero
 * ANIDADO (PDF del API, p. 23, §5.15):
 *
 *   data: { estadocuenta: { elements: [...], Saldos: [...], saldoTotal: 0.00 } }
 *
 * 🩸 Desde el 9-sep-2026 el sync lo buscaba un piso más arriba —`data.saldoTotal`,
 * `data.Saldos`— porque el tipo los había declarado como HERMANOS de
 * `estadocuenta` en vez de adentro. Ahí no hay nada, así que
 * `switch_estadocuenta_saldo` se escribía cada corrida con las dos columnas en
 * NULL: medido el 18-sep, **835 filas, 0 con `saldo_total`, 0 con `saldos`**.
 * El aviso «esto no cuadra» del cajón y de la hoja «Cobrar» no podía saltar nunca.
 *
 * 🔑 La prueba de que es la ruta y no un campo que falta: el endpoint gemelo de
 * proveedores tiene la MISMA forma y `sync-proveedores.ts` sí lee
 * `info.estadodecuenta.saldoTotal` — 65 de 65 proveedores con su saldo lleno.
 *
 * Reglas de este módulo (puro, sin red ni base):
 * - Se lee `data.estadocuenta.saldoTotal`, NUNCA `data.saldoTotal`.
 * - Se aceptan las DOS grafías del aging: `Saldos` (así lo imprime el PDF para
 *   clientes) y `saldos` (así lo manda proveedores). No se sabe cuál manda cada
 *   empresa, y perder una es volver al NULL de siempre.
 * - 🔴 FALLA ABIERTO: sin el campo se guarda NULL, como hoy. NUNCA un cero
 *   inventado: un cero es un saldo, y decir «debe $0» cuando no se sabe es
 *   peor que no decir nada.
 * - Un `0.00` que SÍ viene es un cero de verdad y se guarda como 0.
 */

/** Una fila de `switch_estadocuenta_saldo`: el cuadre de UN cliente en UNA
 *  empresa, tal cual lo manda Switch. */
export interface SaldoSwitchRow {
  empresa_key: string;
  cliente_switch_id: number;
  cliente_codigo: string | null;
  saldo_total: number | null;
  saldos: unknown;
  synced_at: string;
  updated_at: string;
}

/** Lo que se sacó de UNA respuesta de `/apicliente/estadocuenta`. */
export interface CuadreDeSwitch {
  /** El total que Switch calculó, o `null` si no vino o no se entiende. */
  saldoTotal: number | null;
  /** El aging por tramos tal cual llegó (arreglo), o `null` si no vino. */
  saldos: unknown[] | null;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Convierte lo que Switch manda como total en número, o `null` si no se puede.
 * Acepta `"1,234.50"` (coma de miles), `"0.00"`, `0`, `50.9`. Vacío, `null`,
 * `undefined` o basura → `null`. Nunca inventa un cero.
 */
export function totalDeSwitch(bruto: unknown): number | null {
  if (bruto == null) return null;
  if (typeof bruto === "number") return Number.isFinite(bruto) ? bruto : null;
  if (typeof bruto !== "string") return null;
  const limpio = bruto.replace(/,/g, "").trim();
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee el cuadre DESDE ADENTRO de `estadocuenta`. Recibe la respuesta cruda
 * (`data`) y no confía en su forma: cualquier cosa que no sea la esperada
 * devuelve `null` en las dos partes.
 */
export function cuadreDeSwitch(data: unknown): CuadreDeSwitch {
  const fuera: CuadreDeSwitch = { saldoTotal: null, saldos: null };
  if (!esObjeto(data)) return fuera;
  const ec = data.estadocuenta;
  if (!esObjeto(ec)) return fuera;
  const aging = ec.Saldos ?? ec.saldos;
  return {
    saldoTotal: totalDeSwitch(ec.saldoTotal),
    saldos: Array.isArray(aging) ? aging : null,
  };
}

/**
 * Arma la fila de `switch_estadocuenta_saldo` para un cliente. Es la ÚNICA
 * puerta por la que el sync construye esa fila: el candado lo exige.
 */
export function filaDeCuadre(args: {
  empresaKey: string;
  clienteId: number;
  clienteCodigo: string | null | undefined;
  respuesta: unknown;
  runStamp: string;
  ahora?: string;
}): SaldoSwitchRow {
  const c = cuadreDeSwitch(args.respuesta);
  return {
    empresa_key: args.empresaKey,
    cliente_switch_id: args.clienteId,
    cliente_codigo: args.clienteCodigo ?? null,
    saldo_total: c.saldoTotal,
    saldos: c.saldos,
    synced_at: args.runStamp,
    updated_at: args.ahora ?? new Date().toISOString(),
  };
}
