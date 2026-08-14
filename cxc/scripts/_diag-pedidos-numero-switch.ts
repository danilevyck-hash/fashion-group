/**
 * READ-ONLY. La pestaña la decide TENER NÚMERO DE SWITCH. Antes de construir,
 * hay que saber si existe el caso a medio camino:
 *
 *  1. ¿Qué estados hay en las 4 tablas de envíos?
 *  2. ¿Hay envíos ACTIVOS ('enviado'/'verificado') SIN número? → el `"?"` que
 *     hoy inventa `pedidos-unificado` y que caería en "Pedidos a Switch"
 *     mostrando un signo de pregunta en vez de un número.
 *  3. ¿Hay pedidos con MÁS DE UN envío (uno falló, otro salió)?
 *  4. ¿Dónde cae cada pedido con la regla nueva, y dónde caía con la vieja?
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-pedidos-numero-switch.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";

const PARES = [
  { marca: "reebok", orders: "reebok_orders", envios: "reebok_switch_envios" },
  { marca: "joybees", orders: "joybees_orders", envios: "joybees_switch_envios" },
  { marca: "tommy", orders: "tommy_orders", envios: "tommy_switch_envios" },
  { marca: "calvin", orders: "calvin_orders", envios: "calvin_switch_envios" },
];

/** Mismo criterio que el candado #236/#237 y `pedidos-unificado`. */
const ACTIVOS = ["enviado", "verificado"];

async function main() {
  const sb = supabaseServer;

  let totalConNumero = 0;
  let totalSinNumero = 0;
  const interrogacion: string[] = [];
  const multiEnvio: string[] = [];
  const cambiosDePestana: string[] = [];

  for (const { marca, orders, envios } of PARES) {
    console.log(`\n══════ ${marca.toUpperCase()} ══════`);

    const { data: ords, error: oe } = await sb
      .from(orders)
      .select("id, order_number, status, created_at, client_name, deleted")
      .order("created_at");
    if (oe) {
      console.log(`  ERROR orders: ${oe.message}`);
      continue;
    }

    const { data: envs, error: ee } = await sb.from(envios).select("*");
    if (ee) {
      console.log(`  ERROR envios: ${ee.message}`);
      continue;
    }

    // 1. estados
    const estados = new Map<string, number>();
    for (const e of envs || []) {
      const k = String((e as Record<string, unknown>).estado ?? "(null)");
      estados.set(k, (estados.get(k) || 0) + 1);
    }
    console.log(`  envíos: ${(envs || []).length} | estados: ${JSON.stringify(Object.fromEntries(estados))}`);

    // 2/3. agrupar envíos por pedido
    const porOrder = new Map<string, Record<string, unknown>[]>();
    for (const e of envs || []) {
      const r = e as Record<string, unknown>;
      const k = String(r.order_id);
      if (!porOrder.has(k)) porOrder.set(k, []);
      porOrder.get(k)!.push(r);
    }
    for (const [oid, lista] of porOrder) {
      if (lista.length > 1) {
        const o = (ords || []).find((x) => String((x as { id: string }).id) === oid);
        multiEnvio.push(
          `${marca}/${o ? (o as { order_number: string }).order_number : oid}: ${lista
            .map((e) => `${e.estado}${e.numero_interno ? `#${e.numero_interno}` : ""}`)
            .join(" + ")}`,
        );
      }
    }

    // 4. la regla nueva, pedido por pedido
    for (const o of ords || []) {
      const r = o as Record<string, unknown>;
      const lista = porOrder.get(String(r.id)) || [];
      const activos = lista.filter((e) => ACTIVOS.includes(String(e.estado)));
      // Igual que pedidos-unificado, PERO sin inventar "?".
      const numeros = activos
        .map((e) => e.numero_interno ?? e.pedido_switch_id ?? null)
        .filter((n) => n !== null && String(n).trim() !== "");
      const numero = numeros.length ? String(numeros[0]) : null;

      // El caso "?" : envío activo pero sin ningún número.
      if (activos.length > 0 && numeros.length === 0) {
        interrogacion.push(
          `${marca}/${r.order_number} — envío ${activos.map((e) => e.estado).join(",")} SIN numero_interno ni pedido_switch_id`,
        );
      }

      const pestanaNueva = numero ? "Pedidos a Switch" : "Borradores";
      const pestanaVieja = r.status === "confirmado" ? "Confirmado" : "Borrador";
      if (numero) totalConNumero++;
      else totalSinNumero++;

      const cambia =
        (r.status === "confirmado" && !numero) || (r.status === "borrador" && numero);
      if (cambia) {
        cambiosDePestana.push(
          `  ${marca}/${String(r.order_number).padEnd(9)} ${String(r.created_at).slice(0, 10)}  ` +
            `estado="${r.status}" → ${pestanaNueva}${numero ? ` (Switch #${numero})` : ""}` +
            `   [antes caía en "${pestanaVieja}"]`,
        );
      }
    }

    const conNum = (ords || []).filter((o) => {
      const lista = porOrder.get(String((o as { id: string }).id)) || [];
      return lista.some(
        (e) =>
          ACTIVOS.includes(String(e.estado)) &&
          (e.numero_interno || e.pedido_switch_id),
      );
    }).length;
    console.log(`  pedidos: ${(ords || []).length}  →  Borradores ${(ords || []).length - conNum} · Pedidos a Switch ${conNum}`);
  }

  console.log(`\n\n══════ RESUMEN (los 4 catálogos) ══════`);
  console.log(`  Borradores:        ${totalSinNumero}`);
  console.log(`  Pedidos a Switch:  ${totalConNumero}`);
  console.log(`  TOTAL:             ${totalSinNumero + totalConNumero}`);

  console.log(`\n── ⚠️  EL CASO A MEDIO CAMINO (envío activo SIN número) ──`);
  if (interrogacion.length === 0) console.log("  NINGUNO. El `\"?\"` de pedidos-unificado nunca se dispara hoy.");
  else for (const x of interrogacion) console.log(`  🔴 ${x}`);

  console.log(`\n── pedidos con MÁS DE UN envío ──`);
  if (multiEnvio.length === 0) console.log("  ninguno");
  else for (const x of multiEnvio) console.log(`  ⚠️  ${x}`);

  console.log(`\n── los que CAMBIAN de pestaña con la regla nueva ──`);
  if (cambiosDePestana.length === 0) console.log("  ninguno");
  else for (const x of cambiosDePestana) console.log(x);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
