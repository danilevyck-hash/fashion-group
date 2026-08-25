// Solo LECTURA. Mide, por marca, las filas VIVAS del panel de Comprobantes y
// cuantas son borrador / pedido en Switch / cotizacion en Switch.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const MARCAS = [
  { k: "reebok", vw: "reebok_pedidos_unificado_vw", orders: "reebok_orders", envios: "reebok_switch_envios" },
  { k: "tommy", vw: "tommy_pedidos_unificado_vw", orders: "tommy_orders", envios: "tommy_switch_envios" },
  { k: "joybees", vw: "joybees_pedidos_unificado_vw", orders: "joybees_orders", envios: "joybees_switch_envios" },
  { k: "calvin", vw: "calvin_pedidos_unificado_vw", orders: "calvin_orders", envios: "calvin_switch_envios" },
];

let totVivos = 0, totBorr = 0;
for (const m of MARCAS) {
  const { data: filas, error } = await db.from(m.vw).select("origen, id_natural, cliente, total, fuente").order("created_at", { ascending: false });
  if (error) { console.log(m.k, "ERROR vista", error.message); continue; }
  const orderIds = filas.filter((r) => (r.fuente ?? (r.origen === "link" ? "publicos" : "orders")) === "orders").map((r) => r.id_natural);
  const { data: ords } = await db.from(m.orders).select("id, order_number, status").in("id", orderIds);
  const st = new Map((ords || []).map((o) => [String(o.id), o]));
  const { data: envs } = await db.from(m.envios).select("order_id, numero_interno, pedido_switch_id, documento").in("order_id", orderIds).in("estado", ["enviado", "verificado"]);
  const env2 = new Map((envs || []).map((e) => [String(e.order_id), e]));

  let pedido = 0, cot = 0, borr = 0, noEnv = 0;
  const lb = [];
  for (const r of filas) {
    const e = env2.get(r.id_natural);
    const o = st.get(r.id_natural);
    const enSwitch = !!e;
    const doc = enSwitch ? ((e.documento || "pedido") === "cotizacion" ? "cotizacion" : "pedido") : null;
    if (doc === "pedido") pedido++; else if (doc === "cotizacion") cot++; else noEnv++;
    if (o && o.status === "borrador") { borr++; lb.push(`${m.k.padEnd(8)} ${(o.order_number||"?").padEnd(9)} ${String(r.cliente).slice(0,24).padEnd(24)} $${Number(r.total).toFixed(0).padStart(7)}  ${enSwitch ? "EN SWITCH("+doc+")" : ""}`); }
  }
  // status distintos
  const distintos = {};
  for (const o of ords || []) distintos[o.status ?? "null"] = (distintos[o.status ?? "null"] || 0) + 1;
  const publicos = filas.length - orderIds.length;
  console.log(`${m.k.padEnd(8)} vivos=${String(filas.length).padStart(3)}  orders=${String(orderIds.length).padStart(3)} publicos=${publicos}  |  enSwitch:pedido=${pedido} cotizacion=${cot} noEnviado=${noEnv}  |  status=${JSON.stringify(distintos)}  borradores=${borr}`);
  lb.forEach((l) => console.log("   ", l));
  totVivos += filas.length; totBorr += borr;
}
console.log(`\nTOTAL vivos=${totVivos} borradores=${totBorr}`);
