/**
 * Medición DE PUNTA A PUNTA de la PRE-VALIDACIÓN del envío de un pedido de
 * catálogo a Switch, con el código real (`enviarPedidoSwitch({ dry: true })`).
 *
 * `dry: true` hace TODAS las lecturas contra Switch (login, sku→artículo,
 * tallas/colores, permiso 0001) y **no escribe nada**: ni en Switch, ni en la
 * tabla de envíos, ni Telegram. Es el mismo camino que corre cuando la pantalla
 * dice "Revisando el pedido contra Switch…".
 *
 * Sirve para comparar el ANTES y el DESPUÉS del cambio de concurrencia sin
 * tocar producción: se corre con `SKU_CONCURRENCIA` en 1 y en 4, y se restan.
 *
 * MEDIDO CONTRA PRODUCCIÓN (Tommy / fashion_shoes, 12-ago-2026, misma red, las
 * mismas llamadas — 2 por línea: `/apiarticulos/lista` + `/apiarticulos/tallacolor`):
 *
 *   líneas │ en serie (como estaba) │ en paralelo ×4
 *   ───────┼────────────────────────┼────────────────
 *      3   │  3,2 · 3,7 · 12,1 s    │ 1,3 · 1,7 · 1,8 · 2,3 · 2,4 s
 *     10   │  7,6 · 13,6 · 14,5 s   │ 2,3 · 2,7 · 2,8 · 3,1 · 3,1 s
 *     30   │ 47,8 · 49,5 · 52,5 s   │ 5,9 · 6,7 · 7,0 · 7,8 s  (2 atípicas de ~31 s)
 *
 * ⚠️ Las atípicas de ~31 s NO son de la concurrencia: aparecen igual con 2 y
 * con 3 en vuelo (medido) y son una llamada que Switch se toma su tiempo en
 * contestar. Por mediana, 30 líneas pasan de **49,5 s a 7,8 s**.
 *
 * Concurrencias medidas a 30 líneas (mediana): 1 → 49,5 s · 2 → 23 s ·
 * 3 → 21 s · **4 → 7,8 s**. Se queda 4, que además es el valor ya probado por
 * el sync de catálogos. Subirlo exige volver a medir.
 *
 * 🔴 SESIÓN ÚNICA DE SWITCH. Cada empresa admite UN login. Antes de correr:
 *   - `switch_sync_log` sin filas `running` de la empresa (el script lo chequea);
 *   - lejos de los slots de los crons de esa empresa.
 * Cierra sesión al terminar (/cierresesion), igual que el route.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_medir-envio-switch.ts [marca] [tamaños]
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_medir-envio-switch.ts tommy 3,10,30
 */

import { randomUUID } from "crypto";
import { MARCAS_CONFIG } from "../src/lib/catalogo/marcas";
import { leerCategoriaYBulto } from "../src/lib/catalogo/bulto-productos";
import { enviarPedidoSwitch, type EnvioItem } from "../src/lib/catalogo/switch-envio";
import { logoutAllSwitchSessions } from "../src/lib/switch-api/client";
import { supabaseServer } from "../src/lib/supabase-server";

const marca = process.argv[2] || "tommy";
const tamanos = (process.argv[3] || "3,10,30").split(",").map((n) => parseInt(n, 10));

async function main() {
  const cfg = MARCAS_CONFIG[marca];
  if (!cfg) throw new Error(`marca desconocida: ${marca}`);
  const db = await cfg.db();

  // Guard de sesión única: si hay un cron corriendo contra esta empresa, no medir.
  const { data: corriendo } = await supabaseServer
    .from("switch_sync_log")
    .select("id, tipo, started_at")
    .eq("empresa_key", cfg.empresaKey)
    .eq("estado", "running")
    .limit(3);
  if (corriendo?.length) {
    console.error(`⛔ hay ${corriendo.length} sync(s) running de ${cfg.empresaKey} — abortando`);
    process.exit(1);
  }

  const max = Math.max(...tamanos);
  const { data: prods, error } = await db
    .from(cfg.productsTable)
    .select("id, sku, name, price, category")
    .not("sku", "is", null)
    .limit(max * 3);
  if (error) throw new Error(`productos: ${error.message}`);
  const universo = (prods || []).filter((p: { sku?: string }) => (p.sku || "").trim());
  console.log(`marca=${marca} empresa=${cfg.empresaKey} productos disponibles=${universo.length}`);

  for (const n of tamanos) {
    const usados = universo.slice(0, n);
    if (usados.length < n) { console.log(`(sin ${n} productos, se usan ${usados.length})`); }
    const items: EnvioItem[] = usados.map((p: Record<string, unknown>) => ({
      product_id: String(p.id),
      sku: String(p.sku),
      name: (p.name as string) ?? null,
      quantity: 1,
      unit_price: Number(p.price) || 1,
    }));
    const { categoryByProduct, bultoPzasByProduct } = await leerCategoriaYBulto(
      db as never,
      cfg.productsTable,
      items.map((i) => i.product_id),
    );

    const t0 = Date.now();
    const r = await enviarPedidoSwitch({
      empresaKey: cfg.empresaKey,
      enviosTable: cfg.enviosTable,
      db,
      orderId: randomUUID(), // no existe → la idempotencia no encuentra nada
      orderNumber: "MEDICION",
      marcaLabel: cfg.label,
      items,
      bultoSize: cfg.bultoSize,
      categoryByProduct,
      bultoPzasByProduct,
      clienteId: 1,
      vendedorId: 1,
      dry: true, // ← CERO escrituras
    });
    const seg = (Date.now() - t0) / 1000;
    const detalle =
      r.kind === "preview" ? `${r.preview.lineas.length} líneas, ${r.preview.avisos.length} avisos`
      : r.kind === "prevalidacion" ? `${r.errores.length} errores, ${r.lineas.length} líneas ok`
      : JSON.stringify(r).slice(0, 120);
    console.log(`  ${String(n).padStart(3)} líneas → ${seg.toFixed(1)} s   (${r.kind}: ${detalle})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => logoutAllSwitchSessions());
