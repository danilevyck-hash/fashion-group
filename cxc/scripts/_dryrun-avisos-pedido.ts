/**
 * DRY-RUN de los avisos de Telegram de pedidos de catálogo — NO MANDA NADA.
 *
 * Lee de producción (SOLO LECTURA) un pedido real de Tommy y arma, con los
 * builders REALES de src/lib/catalogo/telegram-pedido.ts, los mensajes de los
 * tres eventos tal como llegarían al chat de negocio. Sirve para revisar el
 * formato unificado (referencias · bultos · piezas · monto) sin spamear el
 * chat real: acá no se importa el canal ni sendTelegramAlert.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_dryrun-avisos-pedido.ts [TOM-005]
 */
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { leerCategoriaYBulto } from "@/lib/catalogo/bulto-productos";
import { resolverLineas, resumirPedido } from "@/lib/catalogo/lineas-pedido";
import {
  avisoPedidoDeVendedor,
  avisoPedidoDelLink,
  avisoPedidoEnviado,
} from "@/lib/catalogo/telegram-pedido";

const NUMERO = process.argv[2] || "TOM-005";

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
  const vendedor = (row.vendor_name as string) || null;
  const linea = "─".repeat(64);

  console.log(`\nPedido ${NUMERO} — datos reales de producción (solo lectura)`);
  console.log(
    `  ${resumen.referencias} referencias · ${resumen.bultos} bultos · ${resumen.piezas} piezas · total $${resumen.total} · cliente ${cliente ?? "—"} · vendedor ${vendedor ?? "—"}`,
  );

  console.log(`\n${linea}\n1) CREADO POR EL VENDEDOR (checkout con sesión)\n${linea}`);
  console.log(avisoPedidoDeVendedor({
    emoji: cfg.telegramEmoji, label: cfg.label, numero: NUMERO,
    vendedor, cliente, total: resumen.total, resumen,
  }));

  console.log(`\n${linea}\n2) DEL LINK PÚBLICO (lo confirmó el cliente)\n${linea}`);
  console.log(avisoPedidoDelLink({
    emoji: cfg.telegramEmoji, label: cfg.label, numero: NUMERO,
    cliente, total: resumen.total, resumen,
  }));

  console.log(`\n${linea}\n3) ENVIADO A SWITCH\n${linea}`);
  console.log(avisoPedidoEnviado({
    label: cfg.label, numero: NUMERO, cliente, vendedor,
    total: resumen.total, resumen,
    numeroSwitch: String(envio?.numero_interno || "16-000000000 (sin envío registrado — número de muestra)"),
    verificado: envio?.estado === "verificado",
  }));
  console.log();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
