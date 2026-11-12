// ─────────────────────────────────────────────────────────────────────────────
// CAMBIAR EL VENDEDOR DE UNA FACTURA (11-nov-2026). Módulo PURO.
//
// Daniel: en Comisiones, desde el detalle de la factura, SOLO el administrador
// puede pasar la comisión de UNA factura a otro vendedor. Pidió venta Y cobro;
// el cobro NO se puede: Switch no dice qué factura pagó cada recibo (14 campos,
// ninguno es el documento aplicado; `switch_recibos` no tiene llave natural).
// Inventar el enlace por cliente + monto + fecha sería adivinar plata. Así que
// pasa la comisión de VENTA; el cobro sigue siendo de quien registró el recibo.
//
// Dónde vive la decisión: tabla `comision_factura_vendedor` (migración
// 20261111130000), una sola ACTIVA por (empresa, switch_factura_id); quien
// suma es la RPC `comision_b2b_v10` con COALESCE(cambio, vendedor de Switch) y
// las exclusiones se aplican sobre el vendedor ya cambiado. `switch_facturas`
// NO se toca: el sync la pisa.
//
// 🔴 La factura se identifica por `switch_factura_id`, nunca por el secuencial
// (se repite entre eras: fashion_wear 13-000000001 en 2023 y en 2026).
// ─────────────────────────────────────────────────────────────────────────────

import { EMPRESAS_COMISIONAN } from "./empresas";
import { normalizarVendedor } from "./exclusiones";

/**
 * El interruptor. 🔴 PRENDIDO el 11-nov-2026 con el «sí» de Daniel, después de
 * aplicar la migración 20261111130000 y medir que octubre 2026 da lo MISMO en
 * v9 y v10 con la tabla vacía (13 pares empresa-vendedor, al centavo).
 * `false` = la pantalla no ofrece «Cambiar vendedor» y el rango de Vendedores
 * lee el vendedor de Switch.
 */
export const COMISIONES_CAMBIAR_VENDEDOR_FACTURA = true;

/** Rótulos de la pantalla (nombres de ERP, docs/nombres-erp.md). */
export const ROTULO_CAMBIAR_VENDEDOR = "Cambiar vendedor";
export const ROTULO_DEVOLVER_VENDEDOR = "Devolver al de Switch";
export const ROTULO_VENDEDOR_EN_SWITCH = "Vendedor en Switch";
export const ROTULO_CANCELAR = "Cancelar";
export const AVISO_CAMBIO_PROGRAMADO = "Factura pasada a otro vendedor";
export const AVISO_DEVOLUCION_PROGRAMADA = "Factura devuelta al vendedor de Switch";

export interface CambioDeVendedor {
  empresa_key: string;
  switch_factura_id: number;
  secuencial: string;
  /** Canónico, en mayúsculas. */
  vendedor: string;
}

export type Validacion<T> = { ok: true; valor: T } | { ok: false; error: string };

/** Valida el cuerpo de «cambiar»: empresa de las 6, id entero positivo, secuencial y vendedor con texto. */
export function validarCambioDeVendedor(body: unknown): Validacion<CambioDeVendedor> {
  if (!body || typeof body !== "object") return { ok: false, error: "Cuerpo inválido" };
  const b = body as Record<string, unknown>;
  const empresa = typeof b.empresa_key === "string" ? b.empresa_key.trim() : "";
  if (!(EMPRESAS_COMISIONAN as readonly string[]).includes(empresa)) {
    return { ok: false, error: "Empresa inválida" };
  }
  const id = typeof b.switch_factura_id === "number" ? b.switch_factura_id : Number(b.switch_factura_id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Falta el id de la factura" };
  const secuencial = typeof b.secuencial === "string" ? b.secuencial.trim() : "";
  if (!secuencial) return { ok: false, error: "Falta el número de la factura" };
  const vendedor = normalizarVendedor(typeof b.vendedor === "string" ? b.vendedor : "");
  if (!vendedor || vendedor === "*") return { ok: false, error: "Selecciona el vendedor" };
  return { ok: true, valor: { empresa_key: empresa, switch_factura_id: id, secuencial, vendedor } };
}

/** Valida los parámetros de «devolver»: empresa de las 6 e id entero positivo. */
export function validarDevolucion(empresa: string | null, id: string | null): Validacion<{ empresa_key: string; switch_factura_id: number }> {
  const e = (empresa ?? "").trim();
  if (!(EMPRESAS_COMISIONAN as readonly string[]).includes(e)) return { ok: false, error: "Empresa inválida" };
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return { ok: false, error: "Falta el id de la factura" };
  return { ok: true, valor: { empresa_key: e, switch_factura_id: n } };
}

/** Lo mínimo que una factura necesita para aplicarle un cambio. */
export interface FacturaConVendedor {
  empresa_key: string;
  switch_factura_id: number | null;
  vendedor: string | null;
}

/** Llave del mapa de cambios activos: `empresa|id`. */
export const claveDeFactura = (empresa: string, id: number) => `${empresa}|${id}`;

/**
 * El vendedor que manda para UNA factura: el cambio activo si lo hay, si no el
 * que viene. Es la misma regla que el COALESCE de la RPC, para que lo que
 * agrupa Node (rango de Vendedores) llegue al mismo nombre.
 */
export function vendedorConCambio(f: FacturaConVendedor, cambios: ReadonlyMap<string, string>): string | null {
  if (f.switch_factura_id == null) return f.vendedor;
  return cambios.get(claveDeFactura(f.empresa_key, f.switch_factura_id)) ?? f.vendedor;
}
