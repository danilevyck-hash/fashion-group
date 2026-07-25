// Sync del catálogo Joybees (tabla `joybees_products`) desde Switch. Wrapper
// delgado sobre el motor parametrizado `syncCatalogo`.
//
// joystep es casi 100% Joybees, pero su maestro incluye basura contable de otros
// proveedores: "TERMO"/"AJUSTE DE PRECIO"/muebles con proveedor GENERAL o
// CONFECCIONES BOSTON y saldo físico >= 1 (que el filtro existencia NO descarta).
// FILTRO PROVEEDOR: solo el proveedor real de Joybees (JCBBRANDS) entra al catálogo.
//
// Diferencias con Reebok:
//   - Sin tabla `inventory`: el stock vive en la columna `joybees_products.stock`.
//     El motor escribe existencia/disponibilidad/keep_visible y además stock=existencia
//     para que el catálogo público y los componentes actuales (que leen `stock`)
//     sigan funcionando sin tocarlos.
//   - categories=[] → lee TODA la tabla y matchea por SKU (las categorías de Joybees
//     son nombres de modelo libres, no fijas).
//   - Nuevos: category="nuevo" + gender="adults_m" (ambas NOT NULL) — placeholders
//     editables en el admin; el cron alerta los nuevos sin foto.

import { syncCatalogo, type CatalogoSyncResult } from "./sync-catalogo";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import type { SwitchArticulo } from "./client";

const EMPRESAS = [
  { empresaKey: "joystep", categories: [] as const, defaultCategory: "nuevo" },
] as const;

const JOYBEES_PROVEEDOR = "JCBBRANDS";

/** Un artículo entra al catálogo Joybees SOLO si su proveedor es JCBBRANDS.
 *  Excluye la basura contable de joystep (TERMO/AJUSTE DE PRECIO/muebles con
 *  proveedor GENERAL o CONFECCIONES BOSTON). Trim + uppercase para tolerar los
 *  espacios sobrantes que Switch mete en el campo proveedor. */
function isJoybeesArticulo(a: SwitchArticulo): boolean {
  return (a.proveedor ?? "").trim().toUpperCase() === JOYBEES_PROVEEDOR;
}

export function syncCatalogoJoybees(
  opts: { dryRun?: boolean; triggeredBy?: "cron" | "manual" | "backfill" } = {},
): Promise<CatalogoSyncResult> {
  return syncCatalogo({
    db: joybeesServer,
    marca: "joybees",
    syncLogType: "catalogo_joybees",
    productsTable: "joybees_products",
    empresas: EMPRESAS,
    articuloFilter: isJoybeesArticulo, // solo proveedor JCBBRANDS (excluye basura contable)
    // sin inventoryTable: el stock vive en el producto
    stockFields: (existencia, disponibilidad) => ({ existencia, disponibilidad, stock: existencia }),
    insertExtras: { gender: "adults_m" }, // gender NOT NULL; editable en el admin
  }, opts);
}

export type { CatalogoSyncResult, CatalogoSyncResultEmpresa } from "./sync-catalogo";
