/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKFILL DE LA CLASIFICACIÓN DE REEBOK — **SOLO LECTURA**
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🔴 ESTE SCRIPT NO ESCRIBE NI UNA FILA. No hay `update`, ni `upsert`, ni
 * `insert`, ni `delete` en todo el archivo, y hay candado que lo verifica
 * (`catalogo-cajon-neutro.test.ts`). Dice QUÉ cambiaría; aplicarlo
 * es otra decisión y otro paso.
 *
 * Corre el MISMO módulo puro que el sync (`clasificacionDeArticulo`) sobre los
 * productos REALES y las fichas REALES, y reporta tres cosas por separado:
 *   · cuántos cambian de GÉNERO   (mueve dónde se ve el producto)
 *   · cuántos cambian de CATEGORÍA (mueve dónde se ve, y el bulto)
 *   · cuántos cambian de BULTO     💸 **eso mueve PLATA**: el pedido se cobra
 *     por bulto (`reebok-order-total.ts`), así que un producto que pasa de
 *     `footwear` (12) a otra cosa (6) le cambia el total al cliente.
 *
 * ═══ DE DÓNDE SALE LA FICHA ═════════════════════════════════════════════════
 * Por defecto de `switch_articulo_info` (rubro/subrubro/marca), que es la misma
 * fuente que usa el sync. Mientras esa tabla no tenga las columnas —o mientras
 * `sync-articulo-info` no haya drenado la cola de fichas— se puede correr con
 * `FUENTE=lineas`, que usa `switch_factura_lineas`: los MISMOS tres campos, tal
 * como Switch los mandó en cada renglón de factura, tomando el renglón MÁS
 * RECIENTE de cada código.
 *
 * ⚠️ `FUENTE=lineas` solo cubre lo que se VENDIÓ alguna vez (medido el
 * 2-sep-2026: 226 de los 391 productos). Sirve para dimensionar el backfill
 * antes de tener las fichas, no para reemplazarlas.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-clasificacion-reebok.ts
 *   FUENTE=lineas DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-clasificacion-reebok.ts
 */

import { createClient } from "@supabase/supabase-js";
import {
  clasificacionDeArticulo,
  CATEGORIA_SIN_CLASIFICAR,
  GENERO_SIN_CLASIFICAR,
  type FichaSwitch,
} from "../src/lib/reebok-clasificacion";
import { getBultoSize } from "../src/lib/reebok-bulto";

const EMPRESA = "active_shoes";
const FUENTE = (process.env.FUENTE ?? "fichas") as "fichas" | "lineas";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

/** Lee TODO paginando con orden estable (el tope de PostgREST son 1.000 filas y
 *  corta EN SILENCIO — la lección de `db-max-rows`). */
async function leerTodo<T>(tabla: string, cols: string, orden: string, filtro?: (q: never) => never): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < 200; p++) {
    let q = db.from(tabla).select(cols).order(orden, { ascending: true }).range(p * 1000, p * 1000 + 999);
    if (filtro) q = (filtro as unknown as (x: typeof q) => typeof q)(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    const lote = (data ?? []) as unknown as T[];
    out.push(...lote);
    if (lote.length < 1000) break;
  }
  return out;
}

interface Producto {
  sku: string;
  name: string | null;
  category: string | null;
  gender: string | null;
  active: boolean | null;
  existencia: number | null;
}

async function fichasDeArticuloInfo(): Promise<Map<string, FichaSwitch>> {
  let filas: Array<{ codigo: string; rubro: string | null; subrubro: string | null; marca: string | null; empresa_key: string }>;
  try {
    filas = await leerTodo("switch_articulo_info", "codigo, rubro, subrubro, marca, empresa_key", "codigo");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Degradación limpia igual que el patrón `cols-opcionales`: si las columnas
    // todavía no existen, se DICE — no se reporta "0 cambios", que se leería
    // como "no hay nada que hacer".
    if (/rubro|subrubro|marca/.test(msg)) {
      console.error(
        `\n⚠️  switch_articulo_info todavía no tiene rubro/subrubro/marca.\n` +
          `    Falta correr supabase/migrations/20260906120000_clasificacion_catalogo.sql,\n` +
          `    y después esperar a que el cron sync-articulo-info (04:50 UTC) traiga las fichas.\n` +
          `    Mientras tanto: FUENTE=lineas para dimensionar el backfill con lo que ya está guardado.\n`,
      );
      process.exit(2);
    }
    throw e;
  }
  const m = new Map<string, FichaSwitch>();
  for (const f of filas) {
    if (f.empresa_key !== EMPRESA || !f.codigo) continue;
    // Una fila sin ninguno de los tres NO es una ficha: es una fila a la que
    // todavía no se le pidió. Contarla como ficha diría "Switch no sabe" cuando
    // lo que pasa es que no preguntamos.
    if (!f.rubro && !f.subrubro && !f.marca) continue;
    m.set(String(f.codigo).trim(), { rubro: f.rubro, subrubro: f.subrubro, marca: f.marca });
  }
  return m;
}

async function fichasDeFacturaLineas(): Promise<Map<string, FichaSwitch>> {
  const filas = await leerTodo<{ codigo: string; rubro: string | null; subrubro: string | null; marca: string | null; fecha: string; empresa_key: string; id: number }>(
    "switch_factura_lineas", "id, codigo, rubro, subrubro, marca, fecha, empresa_key", "id",
  );
  // Gana el renglón MÁS RECIENTE: el vocabulario de Switch cambió con los años
  // (los subrubros RUNNING/TENNIS/TRAINING son de 2024 y ya no se usan).
  const ult = new Map<string, { fecha: string; ficha: FichaSwitch }>();
  for (const f of filas) {
    if (f.empresa_key !== EMPRESA || !f.codigo) continue;
    const k = String(f.codigo).trim();
    const prev = ult.get(k);
    if (prev && prev.fecha > f.fecha) continue;
    ult.set(k, { fecha: f.fecha, ficha: { rubro: f.rubro, subrubro: f.subrubro, marca: f.marca } });
  }
  return new Map([...ult].map(([k, v]) => [k, v.ficha]));
}

async function main() {
  const productos = await leerTodo<Producto>(
    "products", "sku, name, category, gender, active, existencia", "sku",
  );
  const fichas = FUENTE === "lineas" ? await fichasDeFacturaLineas() : await fichasDeArticuloInfo();

  console.log(`\nFUENTE de la ficha: ${FUENTE === "lineas" ? "switch_factura_lineas (proxy)" : "switch_articulo_info"}`);
  console.log(`productos: ${productos.length} · fichas disponibles: ${fichas.size}`);

  const sinFicha: Producto[] = [];
  const cambioCategoria: string[] = [];
  const cambioGenero = new Map<string, number>();
  const cambioBulto: string[] = [];
  const desconocidos = new Map<string, number>();
  let conFicha = 0;

  for (const p of productos) {
    const ficha = fichas.get(String(p.sku).trim());
    if (!ficha) { sinFicha.push(p); continue; }
    conFicha++;
    // El nombre solo desempata un UNISEX; `products.name` ES la descripcion de
    // Switch (el motor la copia tal cual al insertar), así que es el mismo
    // nombre que verá el sync.
    const c = clasificacionDeArticulo(ficha, p.name, { category: p.category, gender: p.gender });
    for (const d of c.desconocidos) {
      const k = `${d.campo}="${d.valor}"`;
      desconocidos.set(k, (desconocidos.get(k) ?? 0) + 1);
    }
    if (c.category !== p.category) {
      cambioCategoria.push(
        `  ${p.sku} | ${p.category ?? "(nulo)"} → ${c.category} | rubro=${ficha.rubro ?? "-"} marca=${ficha.marca ?? "-"} | ${p.name ?? ""} | act=${p.active} ex=${p.existencia}`,
      );
    }
    if (c.gender !== p.gender) {
      const k = `${p.gender ?? "(nulo)"} → ${c.gender}`;
      cambioGenero.set(k, (cambioGenero.get(k) ?? 0) + 1);
    }
    const antes = getBultoSize(p.category ?? "");
    const despues = getBultoSize(c.category);
    if (antes !== despues) {
      cambioBulto.push(
        `  ${p.sku} | ${p.category ?? "(nulo)"}=${antes} → ${c.category}=${despues} | ${p.name ?? ""} | act=${p.active} ex=${p.existencia}`,
      );
    }
  }

  console.log(`\n══ RESUMEN ═════════════════════════════════════════════════`);
  console.log(`con ficha: ${conFicha} · SIN ficha (no se toca nada): ${sinFicha.length}`);
  console.log(`cambian CATEGORÍA: ${cambioCategoria.length}`);
  console.log(`cambian GÉNERO:    ${[...cambioGenero.values()].reduce((a, b) => a + b, 0)}`);
  console.log(`💸 cambian BULTO:  ${cambioBulto.length}   ← esto mueve plata`);
  console.log(`quedarían en el cajón neutro: category=${CATEGORIA_SIN_CLASIFICAR} / gender=${GENERO_SIN_CLASIFICAR}`);

  console.log(`\n══ VALORES QUE EL MAPA NO CONOCE (van al aviso de SISTEMA) ══`);
  if (desconocidos.size === 0) console.log("  (ninguno)");
  for (const [k, n] of [...desconocidos.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k} — ${n} producto(s)`);

  console.log(`\n══ CATEGORÍA ═══════════════════════════════════════════════`);
  if (cambioCategoria.length === 0) console.log("  (ninguno)");
  cambioCategoria.forEach((l) => console.log(l));

  console.log(`\n══ 💸 BULTO ════════════════════════════════════════════════`);
  if (cambioBulto.length === 0) console.log("  (ninguno — no se mueve un centavo)");
  cambioBulto.forEach((l) => console.log(l));

  console.log(`\n══ GÉNERO (resumen) ════════════════════════════════════════`);
  for (const [k, n] of [...cambioGenero.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);

  console.log(`\n══ SIN FICHA (quedan EXACTAMENTE como están) ═══════════════`);
  const activos = sinFicha.filter((p) => p.active).length;
  console.log(`  ${sinFicha.length} productos (${activos} visibles en el catálogo)`);
  for (const p of sinFicha.slice(0, 20)) {
    console.log(`  ${p.sku} | ${p.category}/${p.gender} | act=${p.active} ex=${p.existencia} | ${p.name ?? ""}`);
  }
  if (sinFicha.length > 20) console.log(`  …y ${sinFicha.length - 20} más.`);

  console.log(`\n🔴 Este script NO escribió nada.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
