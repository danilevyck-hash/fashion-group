// ─────────────────────────────────────────────────────────────────────────────
// Motor PARAMETRIZADO de sync de catálogo desde Switch (Reebok, Joybees, …).
// El catálogo = TODO lo que tenga EXISTENCIA física (saldo) >= 1 en Switch; el
// usuario solo sube fotos.
//
// Reglas (existencia = saldo, disponibilidad = disponible):
//   1. Existencia >= 1 → visible (active=true); <= 0 → oculto (active=false, NO
//      se borra); si vuelve a tener existencia, reaparece.
//   2. Auto-agregar: codigo nuevo (no en la tabla) con existencia >= 1.
//   3. Refrescar precio + existencia + disponibilidad cada corrida.
//   4. keep_visible / badge "proximamente" fuerzan visible aunque existencia=0.
//   La regla mostrar/ocultar/agregar usa EXISTENCIA, no disponibilidad.
//
// RETO: `saldo` (existencia) NO viene en el bulk /lista — solo en /stock (1 call
// por artículo). ESTRATEGIA (cabe en 300s): /lista da el universo + `disponible`;
// como existencia >= disponible SIEMPRE, solo se piden /stock del set acotado
// { productos ACTIVOS } ∪ { artículos con disponible >= 1 }.
//
// FAIL-SAFE: read-all-then-write. Se juntan TODOS los /stock primero; si CUALQUIER
// llamada falla (ej. 401 sesión muerta) se ABORTA la empresa SIN escribir nada —
// un fallo de Switch NUNCA vacía el catálogo. Serial (sesión única). Idempotente.
//
// PARAMETRIZACIÓN: cada marca pasa su `CatalogoSyncConfig` (cliente Supabase,
// tabla, scope de empresas, filtro de artículo, campos de stock e inserción). El
// `image_url` y la `category` JAMÁS se sobreescriben en el UPDATE.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSwitchClient, type SwitchArticulo } from "./client";

const PER_PAGE = 50;
const MAX_PAGES = 80;

export interface CatalogoEmpresaScope {
  empresaKey: string;
  /** Categorías existentes a leer para matchear por SKU. [] = leer TODA la tabla
   *  (cuando la tabla es 100% de una marca y las categorías son libres). */
  categories: readonly string[];
  /** Categoría de los productos NUEVOS (la tabla suele tener category NOT NULL). */
  defaultCategory: string;
}

export interface CatalogoSyncConfig {
  /** Cliente Supabase del proyecto donde vive la tabla del catálogo. */
  db: SupabaseClient;
  /** Tabla de productos: "products" (Reebok), "joybees_products" (Joybees). */
  productsTable: string;
  empresas: readonly CatalogoEmpresaScope[];
  /** Un artículo entra al catálogo solo si pasa este filtro (Reebok: proveedor;
   *  Joybees: todo). */
  articuloFilter: (a: SwitchArticulo) => boolean;
  /** Tabla de inventario aparte (Reebok). Omitir si el stock vive en el producto
   *  (Joybees usa la columna `stock`). */
  inventoryTable?: string;
  /** Columnas de stock a escribir en UPDATE e INSERT — mapea existencia/
   *  disponibilidad a las columnas de cada tabla (Joybees agrega stock=existencia). */
  stockFields: (existencia: number, disponibilidad: number) => Record<string, unknown>;
  /** Campos fijos extra en el INSERT de nuevos (Reebok: {on_sale:false};
   *  Joybees: {gender:"adults_m"} porque gender es NOT NULL). */
  insertExtras?: Record<string, unknown>;
  /** Columnas extra derivadas del artículo Switch, escritas en UPDATE e INSERT
   *  (Reebok: {codigo_barra_id}). Opcional — omitir si la tabla no tiene las
   *  columnas (Joybees). */
  articuloFields?: (a: SwitchArticulo) => Record<string, unknown>;
}

interface ExistingProduct {
  id: string;
  sku: string;
  name: string | null;
  active: boolean;
  image_url: string | null;
  badge: string | null;
  keep_visible: boolean | null;
}

export interface CatalogoSyncResultEmpresa {
  empresaKey: string;
  switchCount: number;   // artículos totales en /lista
  stockChecks: number;   // cuántos /stock se hicieron
  actualizados: number;
  agregados: number;
  ocultados: number;
  reactivados: number;
  nuevosSinFoto: string[];
  error?: string;        // si está, NO se tocó el catálogo de esta empresa
}

export interface CatalogoSyncResult {
  dryRun: boolean;
  empresas: CatalogoSyncResultEmpresa[];
  nuevosSinFotoTotal: string[];
  hadError: boolean;
}

function num(s: string | null | undefined): number {
  const n = parseFloat(String(s ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function fetchAllArticulos(empresaKey: string): Promise<SwitchArticulo[]> {
  const client = createSwitchClient(empresaKey);
  const all: SwitchArticulo[] = [];
  for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
    const data = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: pagina });
    const arr = data?.articulos ?? [];
    all.push(...arr);
    if (arr.length < PER_PAGE) break;
  }
  return all;
}

export async function syncCatalogo(
  config: CatalogoSyncConfig,
  opts: { dryRun?: boolean } = {},
): Promise<CatalogoSyncResult> {
  const dryRun = !!opts.dryRun;
  const { db, productsTable, inventoryTable } = config;
  const empresasOut: CatalogoSyncResultEmpresa[] = [];

  for (const emp of config.empresas) {
    const out: CatalogoSyncResultEmpresa = {
      empresaKey: emp.empresaKey, switchCount: 0, stockChecks: 0,
      actualizados: 0, agregados: 0, ocultados: 0, reactivados: 0, nuevosSinFoto: [],
    };
    try {
      const client = createSwitchClient(emp.empresaKey);

      // (1) /lista bulk → universo + disponible.
      const artsAll = await fetchAllArticulos(emp.empresaKey);
      out.switchCount = artsAll.length;
      // Fail-safe sobre la respuesta CRUDA: 0 artículos = Switch falló → no tocar.
      if (artsAll.length === 0) throw new Error("Switch /lista devolvió 0 artículos — no se toca el catálogo");

      const arts = artsAll.filter(config.articuloFilter);

      // Productos existentes (por categoría, o TODA la tabla si categories=[]).
      let q = db.from(productsTable).select("id, sku, name, active, image_url, badge, keep_visible");
      if (emp.categories.length > 0) q = q.in("category", emp.categories as string[]);
      const { data: existing, error: exErr } = await q;
      if (exErr) throw new Error(`leer ${productsTable}: ${exErr.message}`);
      const bySku = new Map<string, ExistingProduct>();
      const activeSkus = new Set<string>();
      for (const p of (existing ?? []) as ExistingProduct[]) {
        if (!p.sku) continue;
        bySku.set(String(p.sku), p);
        if (p.active) activeSkus.add(String(p.sku));
      }

      // (2) Set a /stock = catálogo ACTIVO ∪ disponible>=1.
      const stockSet = arts.filter(
        (a) => activeSkus.has(String(a.codigo)) || num(a.disponible) >= 1,
      );

      // (3) Junta TODOS los /stock primero (read-all). Si uno falla → throw → ABORTA empresa sin escribir.
      const stockByCodigo = new Map<string, { existencia: number; disponibilidad: number; art: SwitchArticulo }>();
      for (const a of stockSet) {
        const sd = await client.getStock(a.id);
        const rows = sd?.stock ?? [];
        const saldo = rows.reduce((s, r) => s + num(r.saldo), 0);
        const disp = rows.reduce((s, r) => s + num(r.disponible), 0);
        stockByCodigo.set(String(a.codigo), { existencia: Math.trunc(saldo), disponibilidad: Math.trunc(disp), art: a });
      }
      out.stockChecks = stockByCodigo.size;

      // (4) WRITE — solo después de tener TODA la existencia. Por regla EXISTENCIA.
      for (const [codigo, { existencia, disponibilidad, art }] of stockByCodigo) {
        const p = bySku.get(codigo);
        const precio = num(art.precio);

        if (p) {
          const keepVisible = p.keep_visible === true || p.badge === "proximamente";
          const shouldShow = existencia >= 1 || keepVisible;
          const nameFinal = p.name && p.name.trim() ? p.name : (art.descripcion ?? p.name);
          if (!dryRun) {
            await db.from(productsTable).update({
              price: precio,
              name: nameFinal,
              active: shouldShow,
              ...config.stockFields(existencia, disponibilidad),
              ...(config.articuloFields ? config.articuloFields(art) : {}),
              // image_url y category INTENCIONALMENTE ausentes — jamás se sobreescriben.
            }).eq("id", p.id);
            if (inventoryTable) {
              await db.from(inventoryTable).upsert(
                { product_id: p.id, size: "UNICA", quantity: existencia },
                { onConflict: "product_id,size" },
              );
            }
          }
          if (p.active === false && shouldShow) out.reactivados++;
          else if (p.active === true && !shouldShow) out.ocultados++;
          else out.actualizados++;
        } else if (existencia >= 1) {
          // Auto-agregar nuevo con EXISTENCIA >= 1.
          out.agregados++;
          out.nuevosSinFoto.push(codigo); // nuevo ⇒ image_url null ⇒ sin foto
          if (!dryRun) {
            const { data: np, error: insErr } = await db.from(productsTable).insert({
              sku: art.codigo,
              name: art.descripcion ?? art.codigo,
              price: precio,
              category: emp.defaultCategory,
              active: true,
              image_url: null,
              ...config.stockFields(existencia, disponibilidad),
              ...(config.articuloFields ? config.articuloFields(art) : {}),
              ...(config.insertExtras ?? {}),
            }).select("id").single();
            if (!insErr && np?.id && inventoryTable) {
              await db.from(inventoryTable).upsert(
                { product_id: np.id, size: "UNICA", quantity: existencia },
                { onConflict: "product_id,size" },
              );
            }
          }
        }
        // existencia<=0 y no está en catálogo → no entra (correcto).
      }
    } catch (err) {
      out.error = err instanceof Error ? err.message : String(err);
    }
    empresasOut.push(out);
  }

  return {
    dryRun,
    empresas: empresasOut,
    nuevosSinFotoTotal: empresasOut.flatMap((e) => e.nuevosSinFoto),
    hadError: empresasOut.some((e) => !!e.error),
  };
}
