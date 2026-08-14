/**
 * READ-ONLY. ¿"confirmado" == "salió a Switch"?
 * Cruza los pedidos con su tabla de envíos a Switch (<marca>_switch_envios).
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_t203-confirmado.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";

const PARES = [
  { orders: "reebok_orders", envios: "reebok_switch_envios" },
  { orders: "joybees_orders", envios: "joybees_switch_envios" },
  { orders: "tommy_orders", envios: "tommy_switch_envios" },
  { orders: "calvin_orders", envios: "calvin_switch_envios" },
];

async function main() {
  const sb = supabaseServer;

  for (const { orders, envios } of PARES) {
    console.log(`\n=== ${orders} ===`);

    const { data: ords, error: oErr } = await sb.from(orders).select("id, status, order_number, created_at");
    if (oErr) {
      console.log(`  ERROR orders: ${oErr.message}`);
      continue;
    }

    const { data: envs, error: eErr } = await sb.from(envios).select("*");
    if (eErr) {
      console.log(`  ERROR envios (${envios}): ${eErr.message}`);
      continue;
    }

    if (envs && envs.length) {
      console.log(`  columnas de ${envios}: ${Object.keys(envs[0]).join(", ")}`);
      const estados = new Map<string, number>();
      for (const e of envs) {
        const k = String((e as Record<string, unknown>).estado ?? "(sin estado)");
        estados.set(k, (estados.get(k) || 0) + 1);
      }
      console.log(`  envíos: ${envs.length} | estados: ${JSON.stringify(Object.fromEntries(estados))}`);
    } else {
      console.log(`  envíos: 0`);
    }

    // ¿qué columna del envío apunta al pedido?
    const fk = envs && envs.length
      ? Object.keys(envs[0]).find((c) => /order_id|pedido_id/i.test(c))
      : null;

    const enviadosOk = new Set<string>();
    if (fk && envs) {
      for (const e of envs) {
        const r = e as Record<string, unknown>;
        const est = String(r.estado ?? "");
        if (est === "verificado" || est === "enviado" || est === "ok") {
          enviadosOk.add(String(r[fk]));
        }
      }
    }

    const conf = (ords || []).filter((o) => (o as { status: string }).status === "confirmado");
    const bor = (ords || []).filter((o) => (o as { status: string }).status === "borrador");

    const confConEnvio = conf.filter((o) => enviadosOk.has(String((o as { id: string }).id)));
    const confSinEnvio = conf.filter((o) => !enviadosOk.has(String((o as { id: string }).id)));
    const borConEnvio = bor.filter((o) => enviadosOk.has(String((o as { id: string }).id)));

    console.log(`  confirmados: ${conf.length} | CON envío OK a Switch: ${confConEnvio.length} | SIN envío: ${confSinEnvio.length}`);
    console.log(`  borradores: ${bor.length} | CON envío OK a Switch: ${borConEnvio.length}  <-- si >0, confirmado != enviado`);

    if (confSinEnvio.length) {
      console.log(`  confirmados SIN envío (primeros 8): ${confSinEnvio.slice(0, 8).map((o) => (o as { order_number: string }).order_number).join(", ")}`);
    }
    if (borConEnvio.length) {
      console.log(`  BORRADORES con envío OK (primeros 8): ${borConEnvio.slice(0, 8).map((o) => (o as { order_number: string }).order_number).join(", ")}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
