// Sync del catálogo Joybees (tabla `joybees_products`) desde Switch. Wrapper
// delgado sobre el motor parametrizado `syncCatalogo`.
//
// joystep vende EXCLUSIVAMENTE Joybees → TODO su inventario califica: SIN filtro de
// proveedor ni prefijo. El filtro existencia>=1 ya descarta servicios/ajustes
// contables (no tienen saldo físico).
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

const EMPRESAS = [
  { empresaKey: "joystep", categories: [] as const, defaultCategory: "nuevo" },
] as const;

export function syncCatalogoJoybees(opts: { dryRun?: boolean } = {}): Promise<CatalogoSyncResult> {
  return syncCatalogo({
    db: joybeesServer,
    productsTable: "joybees_products",
    empresas: EMPRESAS,
    articuloFilter: () => true, // joystep = 100% Joybees, sin filtro
    // sin inventoryTable: el stock vive en el producto
    stockFields: (existencia, disponibilidad) => ({ existencia, disponibilidad, stock: existencia }),
    insertExtras: { gender: "adults_m" }, // gender NOT NULL; editable en el admin
  }, opts);
}

export type { CatalogoSyncResult, CatalogoSyncResultEmpresa } from "./sync-catalogo";
