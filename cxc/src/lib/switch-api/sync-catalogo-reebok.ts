// ─────────────────────────────────────────────────────────────────────────────
// Sync del catálogo Reebok (tabla `products`) desde Switch, para Active Wear
// (apparel/accessories) y Active Shoes (footwear). El catálogo = TODO lo que
// tenga EXISTENCIA física (saldo) >= 1 en Switch; Daniel solo sube fotos.
//
// Reglas (existencia = saldo, disponibilidad = disponible):
//   1. Existencia >= 1 → producto visible (active=true); <= 0 → oculto
//      (active=false, NO se borra); si vuelve a tener existencia, reaparece.
//   2. Auto-agregar: codigo nuevo (no en products) con existencia >= 1.
//   3. Refrescar precio + existencia + disponibilidad cada corrida.
//   4. Guarda AMBOS: products.existencia y products.disponibilidad.
//   5. keep_visible / badge "proximamente" fuerzan visible aunque existencia=0.
//   La regla de mostrar/ocultar/agregar usa EXISTENCIA, no disponibilidad.
//
// RETO: `saldo` (existencia) NO viene en el bulk /lista — solo en
// /apiarticulos/stock?articuloId=X (una llamada por artículo, ~2066 total).
// ESTRATEGIA (cabe en 300s sin machacar Switch): /lista (bulk barato) da el
// universo + `disponible`. Como existencia >= disponible SIEMPRE, solo hace falta
// /stock para un set acotado:
//     /stock set = { productos del catálogo ACTIVOS } ∪ { artículos con disponible >= 1 }
// (~245 llamadas/día medido). Cubre: refrescar/ocultar los visibles, reactivar y
// auto-agregar los que muestran disponibilidad. Único gap aceptado: un código
// NUEVO con existencia>=1 pero disponible<=0 (stock físico 100% apartado) no se
// detecta hasta que muestre disponibilidad — raro (mercancía nueva trae disp).
//
// FAIL-SAFE: read-all-then-write. Se juntan TODOS los /stock primero; si CUALQUIER
// llamada falla (ej. 401 sesión muerta) se ABORTA la empresa SIN escribir nada —
// un fallo de Switch NUNCA vacía el catálogo. Serial (sesión única). Idempotente.
// ─────────────────────────────────────────────────────────────────────────────

import { createSwitchClient, type SwitchArticulo } from "./client";
import { reebokServer } from "@/lib/reebok-supabase-server";

const PER_PAGE = 50;
const MAX_PAGES = 80;

// Reebok ahora vive 100% en active_shoes: Daniel movió en Switch todos los
// productos Reebok de active_wear → active_shoes. active_wear pasa a Karl Lagerfeld
// (códigos KL, ya excluidos por el filtro). UNA sola entrada que lee TODO el
// catálogo Reebok desde active_shoes y matchea por SKU sobre las 3 categorías
// (apparel/accessories/footwear) → preserva la categoría y la foto de cada producto
// existente (el UPDATE no toca category ni image_url). Importante que sea UNA sola
// entrada (no dos por categoría) para no insertar duplicados "pelados": con un único
// bySku que cubre todas las categorías, cada artículo se matchea o inserta una vez.
const EMPRESAS = [
  { empresaKey: "active_shoes", categories: ["apparel", "accessories", "footwear"], defaultCategory: "footwear" },
] as const;

// FILTRO PROVEEDOR (Reebok real). active_wear/active_shoes NO son 100% Reebok:
// active_wear mezcla apparel de otros proveedores (BELI 18, AMERICAN UNIQUE) y
// basura contable de GENERAL ("RETENCION DE N/C", "CAJA DE LAPIZ"). El catálogo
// Reebok = SOLO el distribuidor Reebok (Latin Fitness Group). Además se excluyen
// los códigos "KL*" (reservados para Karl Lagerfeld, que Daniel venderá en
// active_wear bajo el mismo proveedor pero NO es Reebok; hoy hay 0, es un seguro).
// marcaId NO se usa: ids compartidos entre Reebok y basura → no es confiable.
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

export async function syncCatalogoReebok(opts: { dryRun?: boolean } = {}): Promise<CatalogoSyncResult> {
  const dryRun = !!opts.dryRun;
  const empresasOut: CatalogoSyncResultEmpresa[] = [];

  for (const emp of EMPRESAS) {
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

      // FILTRO: solo Reebok real (Latin Fitness Group, sin códigos KL). Todo lo
      // que no pase queda fuera del universo → no se agrega ni se refresca como
      // Reebok. La basura (BELI 18, AMERICAN UNIQUE, GENERAL) nunca entra.
      const arts = artsAll.filter(isReebokArticulo);

      // Productos del catálogo de estas categorías.
      const { data: existing, error: exErr } = await reebokServer
        .from("products")
        .select("id, sku, name, active, image_url, badge, keep_visible")
        .in("category", emp.categories);
      if (exErr) throw new Error(`leer products: ${exErr.message}`);
      const bySku = new Map<string, ExistingProduct>();
      const activeSkus = new Set<string>();
      for (const p of (existing ?? []) as ExistingProduct[]) {
        if (!p.sku) continue;
        bySku.set(String(p.sku), p);
        if (p.active) activeSkus.add(String(p.sku));
      }

      // (2) Set a /stock = catálogo ACTIVO ∪ disponible>=1. Cada uno trae su articuloId (art.id).
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
            await reebokServer.from("products").update({
              price: precio,
              name: nameFinal,
              active: shouldShow,
              existencia,
              disponibilidad,
              // image_url INTENCIONALMENTE ausente — jamás se sobrescribe la foto.
            }).eq("id", p.id);
            await reebokServer.from("inventory").upsert(
              { product_id: p.id, size: "UNICA", quantity: existencia },
              { onConflict: "product_id,size" },
            );
          }
          if (p.active === false && shouldShow) out.reactivados++;
          else if (p.active === true && !shouldShow) out.ocultados++;
          else out.actualizados++;
        } else if (existencia >= 1) {
          // Auto-agregar nuevo con EXISTENCIA >= 1.
          out.agregados++;
          out.nuevosSinFoto.push(codigo); // nuevo ⇒ image_url null ⇒ sin foto
          if (!dryRun) {
            const { data: np, error: insErr } = await reebokServer.from("products").insert({
              sku: art.codigo,
              name: art.descripcion ?? art.codigo,
              price: precio,
              category: emp.defaultCategory,
              active: true,
              on_sale: false,
              image_url: null,
              existencia,
              disponibilidad,
            }).select("id").single();
            if (!insErr && np?.id) {
              await reebokServer.from("inventory").upsert(
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
