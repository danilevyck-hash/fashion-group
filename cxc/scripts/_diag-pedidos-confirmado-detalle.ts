/**
 * READ-ONLY. Detalle de los casos donde "confirmado" y "salió a Switch" NO coinciden.
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-pedidos-confirmado-detalle.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";

const PARES = [
  { orders: "reebok_orders", envios: "reebok_switch_envios" },
  { orders: "tommy_orders", envios: "tommy_switch_envios" },
  { orders: "joybees_orders", envios: "joybees_switch_envios" },
  { orders: "calvin_orders", envios: "calvin_switch_envios" },
];

async function main() {
  const sb = supabaseServer;

  for (const { orders, envios } of PARES) {
    const { data: ords } = await sb.from(orders).select("*").order("created_at");
    const { data: envs } = await sb.from(envios).select("*");
    const porOrder = new Map<string, Record<string, unknown>[]>();
    for (const e of envs || []) {
      const r = e as Record<string, unknown>;
      const k = String(r.order_id);
      if (!porOrder.has(k)) porOrder.set(k, []);
      porOrder.get(k)!.push(r);
    }

    console.log(`\n=== ${orders} — TODOS los pedidos, en orden de creación ===`);
    for (const o of ords || []) {
      const r = o as Record<string, unknown>;
      const evs = porOrder.get(String(r.id)) || [];
      const estadosEnvio = evs.map((e) => `${e.estado}${e.pedido_switch_id ? `(sw:${e.pedido_switch_id})` : ""}`).join(",") || "SIN ENVIO";
      const fecha = String(r.created_at).slice(0, 10);
      const marca = r.status === "confirmado" && evs.length === 0 ? "  <-- CONFIRMADO SIN SWITCH"
        : r.status === "borrador" && evs.length > 0 ? "  <-- BORRADOR CON SWITCH"
        : "";
      console.log(`  ${String(r.order_number).padEnd(10)} ${fecha} ${String(r.status).padEnd(11)} envio=${estadosEnvio}${marca}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
