// ─────────────────────────────────────────────────────────────────────────────
// EL EJEMPLO CONCRETO QUE DANIEL PUEDE IR A COMPROBAR, y el cuadre.
//
// Corre los MISMOS módulos que la pantalla (la RPC del nivel 1, la del nivel 2
// y el agrupado por cliente) sobre datos de PRODUCCIÓN, y dice:
//   · la venta de la fila (lo que muestra la tabla)
//   · la suma de la lista de clientes (lo que muestra el pie del desplegable)
//   · la cobertura entre las dos, y a qué se debe el hueco
//
// 🔴 EL SIGNO: la nota de crédito RESTA. Si alguien lo saca, la diferencia da
// EXACTO el doble de las NC.
//
// Solo lectura.
//   node scripts/_verif-productos-clientes-cuadre.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
for (const l of readFileSync("/Users/daniellevy/Code/fashion-group/cxc/.env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const signo = (t) => (t === "Nota de Crédito" ? -1 : 1);

async function pag(t, b) {
  const o = []; let e = null;
  for (let p = 0; p < 200; p++) {
    const { data, error, count } = await b(p === 0, p * 1000, p * 1000 + 999);
    if (error) throw new Error(t + ": " + error.message);
    if (p === 0) e = count;
    o.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    if (e != null && o.length >= e) break;
  }
  if (e != null && o.length !== e) throw new Error(`${t}: ${o.length} de ${e}`);
  return o;
}

const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CASOS = [
  { empresa: "vistana", desde: "2026-01-01", hasta: "2026-08-24", etiqueta: "Vistana · Año en curso" },
  { empresa: "vistana", desde: "2025-09-01", hasta: "2026-08-24", etiqueta: "Vistana · Últimos 12 meses" },
  { empresa: "active_shoes", desde: "2025-09-01", hasta: "2026-08-24", etiqueta: "Active Shoes · Últimos 12 meses" },
];

for (const c of CASOS) {
  const { data: n1, error } = await sb.rpc("switch_top_descripciones", {
    p_empresa_key: c.empresa, p_desde: c.desde, p_hasta: c.hasta,
  });
  if (error) { console.log(`${c.etiqueta}: ERR ${error.message}`); continue; }
  const top = n1[0];

  const { data: cods } = await sb.rpc("switch_articulos_por_descripcion", {
    p_empresa_key: c.empresa, p_desde: c.desde, p_hasta: c.hasta, p_descripcion: top.descripcion,
  });
  const codigos = [...new Set((cods ?? []).map((x) => x.codigo).filter(Boolean))];

  const lin = [];
  for (let i = 0; i < codigos.length; i += 150) {
    const lote = codigos.slice(i, i + 150);
    lin.push(...await pag("lineas", (cn, d, h) => sb.from("switch_factura_lineas")
      .select("tipo_comprobante, cliente_switch_id, cliente_nombre, cantidad, subtotal_con_descuento", cn ? { count: "exact" } : {})
      .eq("empresa_key", c.empresa).in("codigo", lote)
      .gte("fecha", `${c.desde}T00:00:00-05:00`)
      .lt("fecha", `${new Date(new Date(`${c.hasta}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10)}T00:00:00-05:00`)
      .order("id").range(d, h)));
  }

  const porCli = new Map();
  for (const l of lin) {
    const k = l.cliente_switch_id ?? "null";
    const e = porCli.get(k) ?? { nombre: l.cliente_nombre, u: 0, v: 0 };
    e.u += signo(l.tipo_comprobante) * Number(l.cantidad);
    e.v += signo(l.tipo_comprobante) * Number(l.subtotal_con_descuento);
    porCli.set(k, e);
  }
  const lista = [...porCli.values()].filter((x) => x.u !== 0 || x.v !== 0).sort((a, b) => b.v - a.v);
  const sumU = lista.reduce((s, x) => s + x.u, 0);
  const sumV = lista.reduce((s, x) => s + x.v, 0);
  const bruto = lin.reduce((s, l) => s + Number(l.subtotal_con_descuento), 0);

  console.log(`\n=== ${c.etiqueta} · "${top.descripcion}" ===`);
  console.log(`  fila de la tabla      ${String(Math.round(top.cantidad)).padStart(8)} u   ${money(Number(top.venta)).padStart(14)}`);
  console.log(`  lista de clientes     ${String(Math.round(sumU)).padStart(8)} u   ${money(sumV).padStart(14)}   (${lista.length} clientes)`);
  console.log(`  cobertura             ${(sumV / Number(top.venta) * 100).toFixed(2)}% de la venta · ${(sumU / Number(top.cantidad) * 100).toFixed(2)}% de las piezas`);
  console.log(`  🩸 si las NC SUMARAN  ${money(bruto).padStart(14)}   → ${money(bruto - sumV)} de más = EXACTO 2× las NC`);
  for (const x of lista.slice(0, 5)) {
    console.log(`     ${String(x.nombre).slice(0, 34).padEnd(34)} ${String(Math.round(x.u)).padStart(7)} u  ${money(x.v).padStart(13)}  ${(x.v / sumV * 100).toFixed(1)}%`);
  }
}
