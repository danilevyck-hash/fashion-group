/**
 * DRY-RUN de los avisos de Telegram de pedidos de catálogo — NO MANDA NADA.
 *
 * Lee de producción (SOLO LECTURA) un pedido real y arma, con los builders
 * REALES de src/lib/catalogo/telegram-pedido.ts, los mensajes tal como
 * llegarían al chat. Acá NO se importa el canal ni `sendTelegramAlert`: no hay
 * un solo camino por el que este script pueda escribirle a Daniel.
 *
 * Cubre los cuatro casos que hay que poder leer antes de publicar:
 *   1. pedido creado (todavía no salió a Switch)
 *   2. pedido del LINK público
 *   3. PEDIDO y COTIZACIÓN enviados a Switch, en las CUATRO marcas
 *   4. los dos avisos de ERROR — que NO se podaron y siguen con su detalle
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_dryrun-avisos-pedido.ts [TOM-005]
 */
import { MARCAS_CONFIG, type MarcaKey } from "@/lib/catalogo/marcas";
import { leerCategoriaYBulto } from "@/lib/catalogo/bulto-productos";
import { resolverLineas, resumirPedido } from "@/lib/catalogo/lineas-pedido";
import { shortError } from "@/lib/telegram";
import {
  avisoPedidoDeVendedor,
  avisoPedidoDelLink,
  avisoPedidoEnviado,
} from "@/lib/catalogo/telegram-pedido";

const NUMERO = process.argv[2] || "TOM-005";
const linea = "─".repeat(64);
const titulo = (t: string) => console.log(`\n${linea}\n${t}\n${linea}`);

async function main() {
  const cfg = MARCAS_CONFIG.tommy;
  const db = await cfg.db();

  const { data: order, error } = await db
    .from(cfg.ordersTable)
    .select(`id, order_number, client_name, vendor_name, total, ${cfg.itemsRelation}(product_id, sku, name, quantity, unit_price)`)
    .eq("order_number", NUMERO)
    .maybeSingle();
  if (error || !order) {
    console.error(`No se pudo leer ${NUMERO}:`, error?.message || "sin fila");
    process.exit(1);
  }
  const row = order as unknown as Record<string, unknown>;
  const items = (row[cfg.itemsRelation] || []) as {
    product_id: string; sku: string | null; name: string | null;
    quantity: number; unit_price: number;
  }[];

  const { categoryByProduct, bultoPzasByProduct } = await leerCategoriaYBulto(
    db as never,
    cfg.productsTable,
    items.map((i) => i.product_id),
  );
  const resumen = resumirPedido(
    resolverLineas(items, {
      bultoSize: cfg.bultoSize,
      categoryByProduct,
      bultoPzasByProduct,
      fallbackCategory: cfg.fallbackCategory,
    }),
  );

  // El último envío a Switch de este pedido, si existe (para el secuencial real).
  const { data: envio } = await db
    .from(cfg.enviosTable)
    .select("estado, numero_interno")
    .eq("order_id", String(row.id))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cliente = (row.client_name as string) || null;
  const numeroSwitch = String(
    envio?.numero_interno || "16-000000000 (sin envío registrado — número de muestra)",
  );
  const verificado = envio?.estado === "verificado";

  console.log(`\nPedido ${NUMERO} — datos reales de producción (solo lectura)`);
  console.log(
    `  ${resumen.piezas} piezas · total $${resumen.total} · cliente ${cliente ?? "—"}`,
  );
  console.log(
    `  (el vendedor "${(row.vendor_name as string) || "—"}" ya NO va en el aviso — decisión de Daniel)`,
  );

  titulo("1) CREADO POR EL VENDEDOR (todavía no salió a Switch)");
  console.log(avisoPedidoDeVendedor({
    emoji: cfg.telegramEmoji, label: cfg.label, numero: NUMERO,
    cliente, total: resumen.total, piezas: resumen.piezas,
  }));

  titulo("2) DEL LINK PÚBLICO (lo confirmó el cliente)");
  console.log(avisoPedidoDelLink({
    emoji: cfg.telegramEmoji, label: cfg.label, numero: NUMERO,
    cliente, total: resumen.total, piezas: resumen.piezas,
  }));

  titulo("3) ENVIADO A SWITCH — las 4 marcas, PEDIDO y COTIZACIÓN");
  for (const clave of Object.keys(MARCAS_CONFIG) as MarcaKey[]) {
    const m = MARCAS_CONFIG[clave];
    for (const documento of ["pedido", "cotizacion"] as const) {
      console.log(avisoPedidoEnviado({
        label: m.label, numero: NUMERO, cliente,
        total: resumen.total, piezas: resumen.piezas,
        numeroSwitch, verificado, documento,
      }));
      console.log();
    }
  }

  titulo("3b) ENVIADO PERO SIN VERIFICAR — la excepción SÍ se dice");
  console.log(avisoPedidoEnviado({
    label: cfg.label, numero: NUMERO, cliente,
    total: resumen.total, piezas: resumen.piezas,
    numeroSwitch, verificado: false,
  }));

  // 🔴 ESTOS NO SE PODARON, y por eso están acá: cuando el envío falla o Switch
  // no responde, el detalle ES lo útil. Salen por `enviarSistema` (canal de
  // sistema) desde switch-envio.ts, no por el armador de dos líneas. Se
  // reproducen con los MISMOS literales y el MISMO `shortError` del motor.
  titulo("4) LOS DOS AVISOS DE ERROR — NO SE TOCARON");
  const falla = "Switch respondió 400: INFORMACIÓN DE ARTICULOS INCORRECTA (code 0319)";
  console.log(
    `🚨 Envío a Switch FALLÓ — ${cfg.label} ${NUMERO} (Pedido): ${shortError(falla)} (se puede reintentar desde la confirmación)`,
  );
  console.log();
  console.log(
    `🚨 Envío a Switch AMBIGUO — ${cfg.label} ${NUMERO} (Cotización): Switch no respondió (${shortError("fetch failed: ETIMEDOUT")}). REVISAR EL PANEL antes de reintentar.`,
  );
  console.log();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
