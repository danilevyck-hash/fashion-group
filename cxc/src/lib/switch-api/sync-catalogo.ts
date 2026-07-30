// ─────────────────────────────────────────────────────────────────────────────
// Motor PARAMETRIZADO de sync de catálogo desde Switch (Reebok, Joybees, …).
// El catálogo = TODO lo que tenga EXISTENCIA física (saldo) >= 1 en Switch; el
// usuario solo sube fotos.
//
// Reglas (existencia = saldo, disponibilidad = disponible):
//   1. Existencia >= 1 → visible (active=true); <= 0 → oculto (active=false, NO
//      se borra); si vuelve a tener existencia, reaparece.
//   2. Auto-agregar: codigo nuevo (no en la tabla) con existencia >= 1.
//   3. Refrescar precio + existencia + disponibilidad cada corrida. El PRECIO se
//      alinea a Switch para TODO el universo matcheado (decisión 22-jul-2026):
//      los productos fuera del set /stock (ocultos con disponible=0) se alinean
//      con el precio del bulk /lista, y cada cambio de precio queda logueado en
//      cron_email_errors (tipo catalogo_precio_cambios, SIN Telegram).
//   4. keep_visible / badge "proximamente" fuerzan visible aunque existencia=0.
//      oculto_manual=true (toggle admin "Ocultar del catálogo") GANA sobre todo:
//      el producto queda active=false aunque tenga existencia — el toggle
//      sobrevive al sync. Regla única en lib/catalogos/visibilidad.ts.
//   5. Huérfanos del filtro: un producto PUBLICADO cuyo SKU ya no está en el
//      conjunto FILTRADO de Switch (cambió de proveedor, pasó a KL, o desapareció
//      de /lista) se oculta (active=false); si vuelve a entrar al filtro con
//      existencia, la regla 1 lo reactiva.
//   La regla mostrar/ocultar/agregar usa EXISTENCIA, no disponibilidad.
//
// RETO: `saldo` (existencia) NO viene en el bulk /lista — solo en /stock (1 call
// por artículo), y MEDIDO el 30-jul-2026 no hay forma masiva de pedirlo (ver el
// comentario de STOCK_CONCURRENCIA). ESTRATEGIA: /lista da el universo +
// `disponible`; como existencia >= disponible SIEMPRE, solo se piden /stock del
// set acotado { productos ACTIVOS } ∪ { artículos con disponible >= 1 }, y esas
// llamadas van de a STOCK_CONCURRENCIA en paralelo.
//
// FAIL-SAFE: read-all-then-write. Se juntan TODOS los /stock primero; si CUALQUIER
// llamada falla (ej. 401 sesión muerta) se ABORTA la empresa SIN escribir nada —
// un fallo de Switch NUNCA vacía el catálogo. Idempotente.
//
// ⚠️ Las EMPRESAS se siguen recorriendo EN SERIE (sesión única de Switch: dos
// logins de la misma empresa se matan entre sí). Lo que va en paralelo son las
// llamadas de UNA empresa, que comparten un solo token.
//
// PARAMETRIZACIÓN: cada marca pasa su `CatalogoSyncConfig` (cliente Supabase,
// tabla, scope de empresas, filtro de artículo, campos de stock e inserción). El
// `image_url` y la `category` JAMÁS se sobreescriben en el UPDATE.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSwitchClient, type SwitchArticulo } from "./client";
import { createSwitchSyncLog, finishSwitchSyncLog } from "./sync-log";
import { columnasImposibles, campoSkip, fmtMonto } from "./monto-guard";
import { calibrarUmbral, avisarMontosImposibles } from "./monto-guard-io";
import { logCronError } from "@/lib/cron-telemetry";
import { esVisibleEnCatalogo } from "@/lib/catalogos/visibilidad";
import { invalidarCatalogoPublico } from "@/lib/catalogo/cache";
import { enParalelo } from "./en-paralelo";
import type { MarcaKey } from "@/lib/catalogo/marcas";

const PER_PAGE = 50;
const MAX_PAGES = 80;

/**
 * Cuántas llamadas `/apiarticulos/stock` van a la vez.
 *
 * 🩸 POR QUÉ EXISTE ESTE NÚMERO (30-jul-2026). El cron `tommy-catalogo` medía
 * **395-485 s contra un techo de función de 800 s** — el más largo del sistema.
 * Medido fase por fase (`scripts/_medir-tommy-catalogo.ts`): de sus 4 fases, el
 * **72% del tiempo son 478 llamadas `/stock`, una por artículo**, hechas en
 * serie. Es la misma forma que tenía el sync de Boston (4.912 llamadas, 54 min).
 *
 * **No se pudo eliminar las llamadas, así que se acortó el tiempo de pared.**
 * Medido antes de tocar nada (`scripts/_probe-tommy-alternativas.ts`): el bulk
 * `/apiarticulos/lista` devuelve 26 campos y **ninguno es el saldo** (trae
 * `disponible`, que no alcanza: la regla del catálogo es por EXISTENCIA), y
 * `/apiarticulos/stock` **no admite forma masiva** — sin `articuloId`, vacío, 0
 * o -1 responde 200 con body vacío, que en Switch es "esa forma no existe". O
 * sea que la salida de Boston (un reporte del panel web) no está disponible acá.
 *
 * **4 es conservador a propósito.** Medido contra Switch con lotes DISJUNTOS
 * (reusar el mismo lote medía la caché del servidor y daba un 13,6× imposible):
 * ×3 → 2,8× · ×5 → 4,7× · ×8 → 6,8×, con **0 errores y 0 respuestas vacías** en
 * los tres. La curva sigue subiendo en 8, y aun así se eligió 4: el cuello de
 * botella es un ERP ajeno del que no controlamos ni el dimensionamiento ni el
 * límite de peticiones, y la diferencia entre 4 y 8 son ~30 s sobre un
 * presupuesto de 800 — no vale comprarlos apretando al proveedor. Con 4 alcanza
 * de sobra para el margen que hacía falta.
 *
 * ⚠️ **Requiere el de-dup de login de `client.ts` (`loginEnVuelo`).** Switch
 * admite UNA sesión por empresa; sin ese candado, N llamadas concurrentes que
 * encuentren el token vencido dispararían N `/autenticacion` y se matarían el
 * token entre sí (code 0006). Subir este número sin ese candado rompe el sync.
 */
const STOCK_CONCURRENCIA = 4;

export interface CatalogoEmpresaScope {
  empresaKey: string;
  /** Categorías existentes a leer para matchear por SKU. [] = leer TODA la tabla
   *  (cuando la tabla es 100% de una marca y las categorías son libres). */
  categories: readonly string[];
  /** Categoría de los productos NUEVOS (la tabla suele tener category NOT NULL). */
  defaultCategory: string;
}

export interface CatalogoSyncConfig {
  /** Marca del catálogo — obligatoria: es la tag que se invalida al terminar
   *  (`catalogo:<marca>`). Al agregar una marca nueva el compilador la exige,
   *  así que no se puede olvidar la invalidación de su catálogo público. */
  marca: MarcaKey;
  /** Cliente Supabase del proyecto donde vive la tabla del catálogo. */
  db: SupabaseClient;
  /** sync_type con el que cada corrida por empresa se registra en switch_sync_log
   *  ('catalogo_reebok' / 'catalogo_joybees') — fuente del streak de la política
   *  anti-ruido 401 (alert-policy.ts). Los dry-run NO se registran. */
  syncLogType: string;
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
  /** Hook por-marca de campos DERIVADOS del artículo (Tommy: name/category/
   *  gender parseados de `descripcion`). A diferencia de articuloFields, puede
   *  PISAR defaults del motor (name/category) y decidir por-fila en el UPDATE
   *  mirando la fila existente (respeta flags tipo nombre_manual):
   *    - insertFields: se aplica en el INSERT, después de los defaults.
   *    - updateFields: se aplica en el UPDATE, después de nameFinal; recibe la
   *      fila existente (con extraCols). {} = no derivar nada en esa fila.
   *    - extraCols: columnas adicionales a leer de la tabla para ese update
   *      (fallback pre-migración igual que oculto_manual: si la columna no
   *      existe aún, se relee sin ella y el hook las ve como undefined).
   *  Reebok/Joybees no lo usan — comportamiento intacto. */
  derive?: {
    extraCols?: readonly string[];
    insertFields: (a: SwitchArticulo) => Record<string, unknown>;
    updateFields?: (a: SwitchArticulo, existing: Record<string, unknown>) => Record<string, unknown>;
  };
}

interface ExistingProduct {
  id: string;
  sku: string;
  name: string | null;
  price: number | null;
  active: boolean;
  image_url: string | null;
  badge: string | null;
  keep_visible: boolean | null;
  /** Toggle admin "Ocultar del catálogo" (DDL 20260723120000). Puede venir
   *  undefined pre-migración (fallback de lectura) → se trata como false. */
  oculto_manual?: boolean | null;
}

export interface CatalogoPrecioCambio {
  sku: string;
  antes: number | null;
  despues: number;
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
  /** Precios que esta corrida alineó a Switch (antes → después), logueados
   *  además en cron_email_errors (tipo catalogo_precio_cambios). */
  preciosCambiados: CatalogoPrecioCambio[];
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
  opts: { dryRun?: boolean; triggeredBy?: "cron" | "manual" | "backfill" } = {},
): Promise<CatalogoSyncResult> {
  const dryRun = !!opts.dryRun;
  const { db, productsTable, inventoryTable } = config;
  const empresasOut: CatalogoSyncResultEmpresa[] = [];

  for (const emp of config.empresas) {
    const out: CatalogoSyncResultEmpresa = {
      empresaKey: emp.empresaKey, switchCount: 0, stockChecks: 0,
      actualizados: 0, agregados: 0, ocultados: 0, reactivados: 0, nuevosSinFoto: [],
      preciosCambiados: [],
    };
    // Corrida por empresa en switch_sync_log (streak 401 de alert-policy.ts).
    // Los dry-run no se registran: no son corridas reales y ensuciarían el streak.
    // El insert va DENTRO del try: con el lock de 'running' (índice único,
    // DDL 20260723150000) puede lanzar si ya hay una corrida en curso → la
    // empresa falla limpio (out.error) sin tumbar el resto.
    let logId: string | null = null;
    /** Descartes del guard de precios — se persisten en el log de esta empresa
     *  aunque después falle algo: de ahí sale el anti-loop del aviso. */
    let skipDetailsPrecio: unknown[] | undefined;
    try {
      if (!dryRun) {
        logId = await createSwitchSyncLog({
          empresaKey: emp.empresaKey,
          syncType: config.syncLogType,
          triggeredBy: opts.triggeredBy ?? "cron",
        });
      }
      const client = createSwitchClient(emp.empresaKey);

      // Guard de montos imposibles sobre el PRECIO. Es la única familia que un
      // tercero VE: el precio se publica en el catálogo público. El umbral se
      // calibra contra la tabla de ESTA marca (products / joybees_products /
      // tommy_products), no contra un número fijo.
      const umbralPrecio = await calibrarUmbral("producto", undefined, productsTable);
      const preciosRechazados: Array<{ clave: string; fila: unknown; columnas: Array<{ columna: string; valor: number }> }> = [];
      /** ¿El precio de Switch es usable? Si no, se REGISTRA y se devuelve null:
       *  el producto existente conserva el precio bueno que ya tenía (stock,
       *  nombre y visibilidad se actualizan igual) y el producto nuevo no se
       *  crea — publicarle al cliente final un precio imposible es peor que no
       *  tenerlo en el catálogo. Una fila mala no frena a las demás. */
      const precioUsable = (precio: number, sku: string): number | null => {
        const malas = columnasImposibles("producto", { price: precio }, umbralPrecio);
        if (malas.length === 0) return precio;
        preciosRechazados.push({ clave: sku, fila: { sku, price: precio }, columnas: malas });
        console.error(
          `[${config.syncLogType} ${emp.empresaKey}] PRECIO IMPOSIBLE sku=${sku}: ${fmtMonto(precio)} (tope ${fmtMonto(umbralPrecio)})`,
        );
        return null;
      };

      // (1) /lista bulk → universo + disponible.
      const artsAll = await fetchAllArticulos(emp.empresaKey);
      out.switchCount = artsAll.length;
      // Fail-safe sobre la respuesta CRUDA: 0 artículos = Switch falló → no tocar.
      if (artsAll.length === 0) throw new Error("Switch /lista devolvió 0 artículos — no se toca el catálogo");

      const arts = artsAll.filter(config.articuloFilter);

      // Productos existentes (por categoría, o TODA la tabla si categories=[]).
      // `oculto_manual` (toggle admin, DDL 20260723120000) puede no existir aún:
      // fallback pre-migración — se relee sin la columna y se trata como false,
      // para que la migración manual pendiente NO tumbe el cron del catálogo.
      const readExisting = (cols: string) => {
        let q = db.from(productsTable).select(cols);
        if (emp.categories.length > 0) q = q.in("category", emp.categories as string[]);
        return q;
      };
      const COLS_BASE = "id, sku, name, price, active, image_url, badge, keep_visible";
      // Columnas opcionales: oculto_manual + las extraCols del hook derive
      // (p.ej. nombre_manual de Tommy). Mismo fallback pre-migración para todas.
      const optionalCols = ["oculto_manual", ...(config.derive?.extraCols ?? [])];
      let { data: existing, error: exErr } = await readExisting(
        [COLS_BASE, ...optionalCols].join(", "),
      );
      if (exErr && optionalCols.some((c) => exErr!.message.includes(c))) {
        ({ data: existing, error: exErr } = await readExisting(COLS_BASE));
      }
      if (exErr) throw new Error(`leer ${productsTable}: ${exErr.message}`);
      const bySku = new Map<string, ExistingProduct>();
      const activeSkus = new Set<string>();
      // Cast vía unknown: el select dinámico (fallback oculto_manual) hace que
      // supabase-js no pueda inferir las columnas.
      for (const p of (existing ?? []) as unknown as ExistingProduct[]) {
        if (!p.sku) continue;
        bySku.set(String(p.sku), p);
        if (p.active) activeSkus.add(String(p.sku));
      }

      // (2) Set a /stock = catálogo ACTIVO ∪ disponible>=1.
      const stockSet = arts.filter(
        (a) => activeSkus.has(String(a.codigo)) || num(a.disponible) >= 1,
      );

      // (3) Junta TODOS los /stock primero (read-all). Si uno falla → throw → ABORTA empresa sin escribir.
      //
      // EN PARALELO, de a STOCK_CONCURRENCIA. Es la fase que se come el sync:
      // medido el 30-jul-2026 en Tommy, 478 llamadas serie = **72% del tiempo
      // total** del cron (que corre en 395-485 s contra un techo de 800).
      const resultados = await enParalelo(stockSet, STOCK_CONCURRENCIA, async (a) => {
        const sd = await client.getStock(a.id);
        const rows = sd?.stock ?? [];
        const saldo = rows.reduce((s, r) => s + num(r.saldo), 0);
        const disp = rows.reduce((s, r) => s + num(r.disponible), 0);
        return { existencia: Math.trunc(saldo), disponibilidad: Math.trunc(disp), art: a };
      });
      // El Map se arma DESPUÉS y en el orden original de `stockSet`, no en el
      // orden en que fueron llegando las respuestas: el loop (4) itera este Map
      // para escribir, y un orden que cambia entre corridas vuelve el sync
      // irreproducible al depurar. El resultado no cambia (cada UPDATE va por
      // id), pero la reproducibilidad sí.
      const stockByCodigo = new Map<string, { existencia: number; disponibilidad: number; art: SwitchArticulo }>();
      for (let i = 0; i < stockSet.length; i++) {
        stockByCodigo.set(String(stockSet[i].codigo), resultados[i]);
      }
      out.stockChecks = stockByCodigo.size;

      // (4) WRITE — solo después de tener TODA la existencia. Por regla EXISTENCIA.
      for (const [codigo, { existencia, disponibilidad, art }] of stockByCodigo) {
        const p = bySku.get(codigo);
        const precio = num(art.precio);

        const precioOk = precioUsable(precio, codigo);

        if (p) {
          // Regla única de visibilidad (lib/catalogos/visibilidad.ts):
          // oculto_manual=true (toggle admin) gana SIEMPRE → el toggle sobrevive
          // al sync; si no, existencia>=1 o keep_visible/proximamente.
          const shouldShow = esVisibleEnCatalogo({
            existencia,
            keepVisible: p.keep_visible,
            badge: p.badge,
            ocultoManual: p.oculto_manual,
          });
          const nameFinal = p.name && p.name.trim() ? p.name : (art.descripcion ?? p.name);
          if (precioOk != null && (p.price == null || Math.abs(Number(p.price) - precio) > 0.004)) {
            out.preciosCambiados.push({ sku: codigo, antes: p.price, despues: precio });
          }
          if (!dryRun) {
            // supabase-js NO lanza ante error de DB: devuelve { error }. Si no lo
            // chequeamos, un fallo de escritura (p.ej. columna inexistente) queda
            // invisible → contadores mentirosos + heartbeat verde. Throw → aborta
            // la empresa, setea out.error, dispara alerta Telegram (sin falso éxito).
            const { error: upErr } = await db.from(productsTable).update({
              // Precio imposible → NO se escribe la columna: el producto
              // conserva el último precio bueno y el resto se actualiza igual.
              ...(precioOk != null ? { price: precioOk } : {}),
              name: nameFinal,
              active: shouldShow,
              ...config.stockFields(existencia, disponibilidad),
              ...(config.articuloFields ? config.articuloFields(art) : {}),
              // Hook derive por-marca (Tommy): puede pisar name mirando la fila
              // existente (respeta nombre_manual). {} en Reebok/Joybees.
              ...(config.derive?.updateFields
                ? config.derive.updateFields(art, p as unknown as Record<string, unknown>)
                : {}),
              // image_url y category INTENCIONALMENTE ausentes — jamás se sobreescriben.
            }).eq("id", p.id);
            if (upErr) throw new Error(`update ${productsTable} sku=${codigo}: ${upErr.message}`);
            if (inventoryTable) {
              const { error: invErr } = await db.from(inventoryTable).upsert(
                { product_id: p.id, size: "UNICA", quantity: existencia },
                { onConflict: "product_id,size" },
              );
              if (invErr) throw new Error(`upsert ${inventoryTable} product=${p.id}: ${invErr.message}`);
            }
          }
          if (p.active === false && shouldShow) out.reactivados++;
          else if (p.active === true && !shouldShow) out.ocultados++;
          else out.actualizados++;
        } else if (existencia >= 1) {
          // Producto NUEVO con precio imposible: no se crea. No hay precio
          // anterior que conservar y publicarlo sería mostrarle la cifra al
          // cliente final. Vuelve a intentarse en la corrida siguiente.
          if (precioOk == null) continue;
          // Auto-agregar nuevo con EXISTENCIA >= 1.
          out.agregados++;
          out.nuevosSinFoto.push(codigo); // nuevo ⇒ image_url null ⇒ sin foto
          if (!dryRun) {
            const { data: np, error: insErr } = await db.from(productsTable).insert({
              sku: art.codigo,
              name: art.descripcion ?? art.codigo,
              price: precioOk,
              category: emp.defaultCategory,
              active: true,
              image_url: null,
              ...config.stockFields(existencia, disponibilidad),
              ...(config.articuloFields ? config.articuloFields(art) : {}),
              ...(config.insertExtras ?? {}),
              // Hook derive por-marca (Tommy): name/category/gender parseados
              // de la descripcion — pisa el name/category default del motor.
              ...(config.derive ? config.derive.insertFields(art) : {}),
            }).select("id").single();
            // Antes: `if (!insErr && ...)` tragaba el error del INSERT en silencio
            // (contaba el producto como agregado + alerta "nuevo sin foto" aunque no
            // se guardara). Ahora el fallo aborta la empresa y se reporta.
            if (insErr) throw new Error(`insert ${productsTable} sku=${art.codigo}: ${insErr.message}`);
            if (np?.id && inventoryTable) {
              const { error: invErr } = await db.from(inventoryTable).upsert(
                { product_id: np.id, size: "UNICA", quantity: existencia },
                { onConflict: "product_id,size" },
              );
              if (invErr) throw new Error(`upsert ${inventoryTable} product=${np.id}: ${invErr.message}`);
            }
          }
        }
        // existencia<=0 y no está en catálogo → no entra (correcto).
      }

      // (4b) PRECIO SIEMPRE ALINEADO A SWITCH (decisión Daniel 22-jul-2026): el
      // loop (4) solo toca artículos con /stock (activos ∪ disponible>=1). Un
      // producto OCULTO con disponible=0 conservaba su precio local para siempre
      // (audit 22-jul: 100256061 local 45 vs Switch 46). El bulk /lista ya trae
      // `precio` para TODO el universo filtrado → aquí se alinea el precio del
      // resto de los productos matcheados SIN llamadas extra a Switch. Solo se
      // escribe `price` (no se toca active/stock/foto).
      for (const a of arts) {
        const codigo = String(a.codigo);
        if (stockByCodigo.has(codigo)) continue; // ya alineado en (4)
        const p = bySku.get(codigo);
        if (!p) continue;
        const precio = num(a.precio);
        if (precioUsable(precio, codigo) == null) continue; // conserva el precio bueno
        if (p.price != null && Math.abs(Number(p.price) - precio) <= 0.004) continue;
        if (!dryRun) {
          const { error: prErr } = await db
            .from(productsTable)
            .update({ price: precio })
            .eq("id", p.id);
          if (prErr) throw new Error(`precio ${productsTable} sku=${codigo}: ${prErr.message}`);
        }
        out.preciosCambiados.push({ sku: codigo, antes: p.price, despues: precio });
      }

      // (5) HUÉRFANOS DEL FILTRO: el loop (4) solo toca lo que está en
      // stockByCodigo (artículos que PASAN articuloFilter). Un producto PUBLICADO
      // cuyo SKU ya no está en el conjunto FILTRADO (el artículo cambió de
      // proveedor, pasó a "KL*", o desapareció de /lista) quedaba activo para
      // siempre. Se oculta (active=false, NO se borra) — mismo mecanismo que la
      // regla existencia=0. keep_visible / badge "proximamente" se respetan.
      //
      // FAIL-SAFE adicional (no debilita el existente): si el conjunto FILTRADO
      // quedó vacío (p.ej. Switch cambió el formato del campo proveedor y el
      // filtro dejó de matchear), NO se oculta nada en masa — mismo espíritu que
      // el guard de /lista vacía. Solo se ocultan huérfanos cuando el filtro
      // sigue devolviendo artículos reales.
      if (arts.length > 0) {
        const filteredSkus = new Set(arts.map((a) => String(a.codigo)));
        for (const p of bySku.values()) {
          if (!p.active) continue; // ya oculto — nada que hacer
          if (filteredSkus.has(String(p.sku))) continue; // sigue en el filtro (lo maneja el loop 4)
          if (p.keep_visible === true || p.badge === "proximamente") continue;
          if (!dryRun) {
            const { error: hideErr } = await db
              .from(productsTable)
              .update({ active: false })
              .eq("id", p.id);
            if (hideErr) throw new Error(`ocultar huérfano ${productsTable} sku=${p.sku}: ${hideErr.message}`);
          }
          out.ocultados++;
        }
      }

      // Log CONSULTABLE de cambios de precio (cron_email_errors, SIN Telegram —
      // no es un error, es rastro auditable): cada corrida que movió precios
      // deja una fila con el detalle sku: antes → después. Consultar por
      // tipo='catalogo_precio_cambios'. Best-effort: logCronError nunca lanza.
      if (!dryRun && out.preciosCambiados.length > 0) {
        const detalle = out.preciosCambiados
          .map((c) => `${c.sku}: ${c.antes ?? "s/precio"} → ${c.despues}`)
          .join(", ");
        await logCronError(
          "catalogo_precio_cambios",
          `${config.syncLogType} ${emp.empresaKey}: ${out.preciosCambiados.length} precio(s) alineado(s) a Switch — ${detalle}`.slice(0, 1900),
          `${config.syncLogType}:${emp.empresaKey}`,
          { telegram: false },
        );
      }
      // Aviso DESPUÉS de escribir; nunca tumba la corrida.
      if (preciosRechazados.length > 0 && !dryRun) {
        skipDetailsPrecio = preciosRechazados.map((r) => ({
          facturaId: null,
          secuencial: r.clave,
          campo: campoSkip("producto"),
          valorCrudo: { umbral: umbralPrecio, columnas: r.columnas },
        }));
        try {
          await avisarMontosImposibles({
            familia: "producto",
            empresaKey: emp.empresaKey,
            syncType: config.syncLogType,
            rechazadas: preciosRechazados,
            umbral: umbralPrecio,
            logId,
          });
        } catch (e) {
          console.error(`[${config.syncLogType} ${emp.empresaKey}] no pude avisar el precio imposible: ${String(e)}`);
        }
      }
    } catch (err) {
      out.error = err instanceof Error ? err.message : String(err);
    }
    if (out.error) {
      await finishSwitchSyncLog(logId, "error", { errorMessage: out.error, skipDetails: skipDetailsPrecio });
    } else {
      await finishSwitchSyncLog(logId, "success", {
        inserted: out.agregados,
        updated: out.actualizados + out.reactivados,
        skipped: out.ocultados,
        skipDetails: skipDetailsPrecio,
      });
    }
    empresasOut.push(out);
  }

  // Invalidación del catálogo público de ESTA marca (lib/catalogo/cache.ts).
  // Incondicional en corridas reales: el sync es el mayor write path del
  // catálogo (precio, nombre, active, stock) y una corrida "sin cambios"
  // solo cuesta una consulta fría extra. Los dry-run no escriben → no invalidan.
  // Cubre de una sola vez los 3 crons, "Actualizar ahora" y la reconciliación,
  // porque todos entran por aquí.
  if (!dryRun) invalidarCatalogoPublico(config.marca);

  return {
    dryRun,
    empresas: empresasOut,
    nuevosSinFotoTotal: empresasOut.flatMap((e) => e.nuevosSinFoto),
    hadError: empresasOut.some((e) => !!e.error),
  };
}
