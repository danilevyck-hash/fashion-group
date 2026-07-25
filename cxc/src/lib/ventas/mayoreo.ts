// Nota de mayoreo — texto único para las DOS vistas que lo mencionan.
//
// REGLA DE NEGOCIO (aprobada por Daniel, 25-jul-2026):
//
//   VENTAS (las 8 empresas)  → el total INCLUYE el mayoreo.
//                              Nota: "incluye $X de mayoreo · <quién>".
//   MULTIFASHION (la tienda) → el total es RETAIL PURO.
//                              Nota: "no incluye $X de mayoreo · <quién>".
//
// El mayoreo de american_classic son ventas intercompañía y La Frontera Duty
// Free, facturadas por la caja de la tienda pero que no son retail de mostrador
// (predicado acs_cliente_no_retail(), migración 20260725120000). Para el grupo
// esa venta SÍ existe; para medir la tienda, estorba. De ahí las dos vistas.
//
// Caso vivo: ACTIVE WEAR, S.A. $2,208.90 el 9-jul-2026.

import { fmtMoney } from "./format";

export interface MayoreoNotaInput {
  /** true = el total lo incluye (Ventas). false = el total lo excluye (Multifashion). */
  incluido: boolean;
  /** Monto de mayoreo del período. ≤ 0 ⇒ no hay nota. */
  monto: number;
  /** Lista de clientes distintos, cuando se conoce (Multifashion mes a mes). */
  clientes?: string[] | null;
  /** Cantidad de clientes distintos, cuando NO se tiene la lista (Ventas YTD). */
  clientesCount?: number | null;
  /** Cliente representativo, cuando NO se tiene la lista (Ventas YTD). */
  clienteNombre?: string | null;
  /** Facturas de mayoreo del período — resume cuando hay varias. */
  facturas?: number | null;
}

export interface MayoreoNota {
  /** Línea principal. Ej: "no incluye $2,208.90 de mayoreo · ACTIVE WEAR, S.A." */
  texto: string;
  /** Detalle accesible cuando el resumen dice "N facturas" y sabemos quiénes. null si no aplica. */
  detalle: string | null;
}

/**
 * Construye la nota de mayoreo. Devuelve null cuando no hay mayoreo en el
 * período (monto ≤ 0) — en ese caso no se debe pintar nada.
 */
export function buildNotaMayoreo(input: MayoreoNotaInput): MayoreoNota | null {
  const { incluido, monto } = input;
  if (!Number.isFinite(monto) || monto <= 0) return null;

  const lista = (input.clientes ?? []).map((c) => c.trim()).filter(Boolean);
  const count = lista.length > 0 ? lista.length : (input.clientesCount ?? 0);
  const facturas = input.facturas ?? 0;
  const nombre = lista.length === 1 ? lista[0] : (input.clienteNombre ?? null);

  let sufijo = "";
  let detalle: string | null = null;

  if (count === 1 && nombre) {
    sufijo = ` · ${nombre}`;
  } else if (count > 1) {
    // Varias facturas en el período: se resume y el detalle queda accesible.
    sufijo = facturas > 1 ? ` · ${facturas} facturas` : ` · ${count} clientes`;
    if (lista.length > 1) detalle = lista.join(" · ");
  } else if (nombre) {
    sufijo = ` · ${nombre}`;
  }

  const verbo = incluido ? "incluye" : "no incluye";
  return { texto: `${verbo} ${fmtMoney(monto)} de mayoreo${sufijo}`, detalle };
}
