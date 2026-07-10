// Sync del catálogo Reebok (tabla `products`) desde Switch. Wrapper delgado sobre
// el motor parametrizado `syncCatalogo` — la lógica (existencia/fail-safe/auto-add/
// nunca-sobreescribir-foto) vive en `./sync-catalogo`.
//
// Reebok vive 100% en active_shoes (Daniel movió todo desde active_wear; active_wear
// pasó a Karl Lagerfeld/KL, excluido por el filtro). UNA sola entrada que lee las 3
// categorías y matchea por SKU → cada artículo se matchea o inserta una vez.
//
// FILTRO PROVEEDOR: solo el distribuidor Reebok (Latin Fitness Group), excluyendo
// códigos "KL*" (Karl Lagerfeld, mismo proveedor pero NO Reebok). Si un producto
// ya publicado SALE del filtro (p.ej. pasa a proveedor KL), el motor lo oculta en
// el siguiente run (regla 5 de sync-catalogo) — no queda huérfano publicado.

import { syncCatalogo, type CatalogoSyncResult } from "./sync-catalogo";
import { reebokServer } from "@/lib/reebok-supabase-server";
import type { SwitchArticulo } from "./client";

const EMPRESAS = [
  { empresaKey: "active_shoes", categories: ["apparel", "accessories", "footwear"], defaultCategory: "footwear" },
] as const;

const REEBOK_PROVEEDOR = "LATIN FITNESS GROUP";

/** Un artículo entra al catálogo Reebok SOLO si su proveedor es Latin Fitness
 *  Group Y su código NO empieza con "KL" (case-insensitive). */
function isReebokArticulo(a: SwitchArticulo): boolean {
  const proveedor = (a.proveedor ?? "").trim().toUpperCase();
  if (proveedor !== REEBOK_PROVEEDOR) return false;
  const codigo = (a.codigo ?? "").trim().toUpperCase();
  if (codigo.startsWith("KL")) return false;
  return true;
}

export function syncCatalogoReebok(opts: { dryRun?: boolean } = {}): Promise<CatalogoSyncResult> {
  return syncCatalogo({
    db: reebokServer,
    syncLogType: "catalogo_reebok",
    productsTable: "products",
    empresas: EMPRESAS,
    articuloFilter: isReebokArticulo,
    inventoryTable: "inventory",
    stockFields: (existencia, disponibilidad) => ({ existencia, disponibilidad }),
    // Persistir el codigoBarraId de Switch (backfill llega solo con cada corrida del cron).
    articuloFields: (a) => ({ codigo_barra_id: a.codigoBarraId ?? null }),
    insertExtras: { on_sale: false },
  }, opts);
}

export type { CatalogoSyncResult, CatalogoSyncResultEmpresa } from "./sync-catalogo";
