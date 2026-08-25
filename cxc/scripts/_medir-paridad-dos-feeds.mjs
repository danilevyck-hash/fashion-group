// ─────────────────────────────────────────────────────────────────────────────
// MEDICIÓN — ¿los DOS feeds dicen lo mismo del MISMO pedido?
//
// `/orders` (el del vendedor) y `/pedidos-unificado` (el del admin) calculan el
// total por caminos distintos: `resumirDesdeItems` vs `cfg.calcTotal`. Antes de
// dejar UNA sola pantalla hay que saber si alguien vería OTRA PLATA.
//
//   node scripts/_medir-paridad-dos-feeds.mjs      (solo GET, no escribe nada)
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
const BASE = process.env.BASE ?? "http://localhost:3910";
const C = JSON.parse(readFileSync("/tmp/t910-cookies.json", "utf8")).admin;
const MARCAS = ["reebok", "joybees", "tommy", "calvin"];
const g = (u) => fetch(`${BASE}${u}`, { headers: { Cookie: `cxc_session=${C}` } }).then((r) => r.json());

let difTot = 0, compTot = 0, faltanTot = 0, sobranTot = 0;
for (const marca of MARCAS) {
  const [ords, uni] = await Promise.all([g(`/api/catalogo/${marca}/orders`), g(`/api/catalogo/${marca}/pedidos-unificado`)]);
  const O = new Map(ords.map((o) => [String(o.id), o]));
  const U = new Map(uni.map((u) => [String(u.id_natural), u]));
  const dif = [], faltan = [], sobran = [];
  for (const [id, u] of U) {
    const o = O.get(id);
    if (!o) { faltan.push(`${u.numero_pedido ?? id.slice(0, 8)} ${u.cliente}`); continue; }
    const d = [];
    if (Math.abs(Number(o.total) - Number(u.total)) > 0.005) d.push(`total ${o.total} vs ${u.total}`);
    if ((o.order_number ?? null) !== (u.numero_pedido ?? null)) d.push(`num ${o.order_number} vs ${u.numero_pedido}`);
    if ((o.client_name ?? null) !== (u.cliente ?? null)) d.push(`cliente "${o.client_name}" vs "${u.cliente}"`);
    if (Number(o.item_count) !== Number(u.item_count)) d.push(`items ${o.item_count} vs ${u.item_count}`);
    if ((o.switch_numero ?? null) !== (u.switch_numero ?? null)) d.push(`switch ${o.switch_numero} vs ${u.switch_numero}`);
    if (!!o.del_link !== (u.origen === "link")) d.push(`origen del_link=${!!o.del_link} vs ${u.origen}`);
    if ((o.status ?? null) !== (u.status ?? null)) d.push(`status ${o.status} vs ${u.status}`);
    if (d.length) dif.push(`${u.numero_pedido ?? id.slice(0, 8)}: ${d.join(" | ")}`);
  }
  for (const [id, o] of O) if (!U.has(id)) sobran.push(`${o.order_number ?? id.slice(0, 8)} ${o.client_name}`);
  console.log(`${marca.padEnd(8)} orders ${String(ords.length).padStart(2)} · unificado ${String(uni.length).padStart(2)} · comparados ${U.size - faltan.length} · DIFERENCIAS ${dif.length} · solo-unificado ${faltan.length} · solo-orders ${sobran.length}`);
  for (const x of dif.slice(0, 6)) console.log(`   ✗ ${x}`);
  if (faltan.length) console.log(`   solo en unificado: ${faltan.slice(0, 4).join(", ")}`);
  if (sobran.length) console.log(`   solo en orders:    ${sobran.slice(0, 10).join(", ")}`);
  difTot += dif.length; compTot += U.size - faltan.length; faltanTot += faltan.length; sobranTot += sobran.length;

  const conf = uni.filter((u) => u.confirmado_cliente_at);
  if (conf.length) console.log(`   confirmado_cliente_at≠null: ${conf.length} (fuentes: ${[...new Set(conf.map((c) => c.fuente))].join(",")})`);
}
console.log(`\nTOTAL comparados ${compTot} · diferencias ${difTot} · solo-unificado ${faltanTot} · solo-orders ${sobranTot}`);
