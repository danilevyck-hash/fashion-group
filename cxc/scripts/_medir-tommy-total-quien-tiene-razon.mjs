// ¿Quién dice la verdad del total de un pedido Tommy: la lista del vendedor
// (/orders), la del admin (/pedidos-unificado), o el DETALLE que se abre al
// tocarlo? El detalle es el desempate: es la pantalla desde la que se manda a
// Switch. SOLO GET.
import { readFileSync } from "fs";
const BASE = process.env.BASE ?? "http://localhost:3910";
const C = JSON.parse(readFileSync("/tmp/t910-cookies.json", "utf8")).admin;
const g = (u) => fetch(`${BASE}${u}`, { headers: { Cookie: `cxc_session=${C}` } }).then((r) => r.json());

const [ords, uni] = await Promise.all([g("/api/catalogo/tommy/orders"), g("/api/catalogo/tommy/pedidos-unificado")]);
const U = new Map(uni.map((u) => [String(u.id_natural), u]));
console.log("pedido    lista-vendedor   lista-admin   DETALLE(al tocarlo)   quién coincide con el detalle");
for (const o of ords) {
  const u = U.get(String(o.id));
  if (!u || Math.abs(Number(o.total) - Number(u.total)) < 0.005) continue;
  const d = await g(`/api/catalogo/tommy/orders/${o.id}`);
  const det = Number(d.total);
  const cv = Math.abs(det - Number(o.total)) < 0.005;
  const ca = Math.abs(det - Number(u.total)) < 0.005;
  console.log(
    `${String(o.order_number).padEnd(9)} ${String(o.total).padStart(9)}   ${String(u.total).padStart(9)}   ${String(det).padStart(9)}          ${cv && !ca ? "✅ el VENDEDOR" : ca && !cv ? "✅ el ADMIN" : cv && ca ? "los dos" : "❌ NINGUNO"}`,
  );
}
