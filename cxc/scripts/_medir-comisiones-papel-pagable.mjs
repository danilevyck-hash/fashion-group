#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Comisiones — EL PAPEL SOLO CON LO PAGABLE (22-sep-2026). SOLO LECTURA.
//
// Dos cosas se miden contra producción, con las MISMAS RPC que la pantalla:
//   1. El total a pagar de agosto 2026 (comision_b2b_v9 × 6 empresas, con los
//      descuentos restados como `netearComisiones`): tiene que dar $5.978,55
//      antes y después del cambio — el papel no toca ningún número.
//   2. Cuántos renglones del reporte de un vendedor valen $0 (facturas con
//      utilidad ≤ 20 % y recibos en cero) y que quitarlos NO mueve la base:
//      `ventas_base` y `cobros_base` son los del RPC, no una suma de renglones.
//
// Uso:
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/_medir-comisiones-papel-pagable.mjs
// ─────────────────────────────────────────────────────────────────────────────

const U = process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) throw new Error("falta SUPABASE_SERVICE_ROLE_KEY (DOTENV_CONFIG_PATH=.env.local)");
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
const YEAR = Number(process.env.ANIO ?? 2026);
const MES = Number(process.env.MES ?? 8);
const SIN_PAGO = new Set(["DEFAULT", "DANIEL LEVY"]);
const RETIRADOS = new Set(["REY STOUTE AGUAS", "AGUAS", "COLABORADOR"]);
const clave = (s) => String(s ?? "").trim().toUpperCase();
const r2 = (n) => Math.round(n * 100) / 100;
const mesISO = `${YEAR}-${String(MES).padStart(2, "0")}-01`;

async function rpc(fn, body) {
  const r = await fetch(`${U}/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function tabla(path) {
  const r = await fetch(`${U}/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

// ── 1. La matriz del mes, como la arma el servidor ───────────────────────────
const fijos = await tabla("comision_descuentos_fijos?select=id,vendedor_nombre,empresa_key,concepto,monto,activo,desde,hasta&activo=eq.true");
const k = (d) => (d ? String(d).slice(0, 7) : null);
const vigentes = fijos.filter((f) => (!k(f.desde) || mesISO.slice(0, 7) >= k(f.desde)) && (!k(f.hasta) || mesISO.slice(0, 7) <= k(f.hasta)));
const exc = vigentes.length
  ? await tabla(`comision_descuento_excepciones?select=descuento_id,activo&mes=eq.${mesISO}&descuento_id=in.(${vigentes.map((f) => f.id).join(",")})`)
  : [];
const excById = new Map(exc.map((x) => [String(x.descuento_id), Boolean(x.activo)]));
const descuentoDe = (empresa, vendedor) =>
  vigentes
    .filter((f) => f.empresa_key === empresa && clave(f.vendedor_nombre) === vendedor)
    .filter((f) => (excById.has(String(f.id)) ? excById.get(String(f.id)) : true))
    .reduce((s, f) => s + Number(f.monto), 0);

const porPersona = new Map();
for (const e of EMPRESAS) {
  const d = await rpc("comision_b2b_v9", { p_empresa_key: e, p_year: YEAR, p_mes: MES });
  for (const v of d.vendedores ?? []) {
    const key = clave(v.vendedor);
    const bruto = Number(v.comision_total ?? 0);
    const desc = key === "DEFAULT" ? 0 : descuentoDe(e, key);
    const neto = desc ? r2(bruto - desc) : bruto;
    porPersona.set(key, r2((porPersona.get(key) ?? 0) + neto));
  }
}
let pagable = 0;
console.log(`\n== Agosto ${YEAR} — total por persona (RPC v9 + descuentos, como el servidor) ==`);
for (const [p, t] of [...porPersona.entries()].sort((a, b) => b[1] - a[1])) {
  const marca = RETIRADOS.has(p) ? "  (retirado, no sale)" : SIN_PAGO.has(p) ? "  (no se paga)" : "";
  console.log(`  ${p.padEnd(22)} ${t.toFixed(2).padStart(10)}${marca}`);
  if (!RETIRADOS.has(p) && !SIN_PAGO.has(p)) pagable = r2(pagable + t);
}
console.log(`  TOTAL A PAGAR          ${pagable.toFixed(2).padStart(10)}`);

// ── 2. Los renglones en cero del reporte de un vendedor ──────────────────────
const CASOS = [
  ["fashion_wear", "REYNALDO ESPINOSA"],
  ["fashion_shoes", "REYNALDO ESPINOSA"],
  ["active_shoes", "REYNALDO ESPINOSA"],
  ["active_wear", "REYNALDO ESPINOSA"],
  ["vistana", "EDWIN"],
  ["vistana", "RODRIGO"],
];
console.log(`\n== Renglones en $0 del reporte por vendedor (comision_b2b_detalle) ==`);
for (const [e, v] of CASOS) {
  const d = await rpc("comision_b2b_detalle", { p_empresa_key: e, p_year: YEAR, p_mes: MES, p_vendedor: v });
  const ventas = d.ventas ?? [];
  const cobros = d.cobros ?? [];
  const vCero = ventas.filter((x) => Number(x.subtotal) === 0);
  const cCero = cobros.filter((x) => Number(x.monto) === 0);
  const sumaV = r2(ventas.reduce((s, x) => s + Number(x.subtotal), 0));
  const sumaVsin = r2(ventas.filter((x) => Number(x.subtotal) !== 0).reduce((s, x) => s + Number(x.subtotal), 0));
  const sumaC = r2(cobros.reduce((s, x) => s + Number(x.monto), 0));
  const sumaCsin = r2(cobros.filter((x) => Number(x.monto) !== 0).reduce((s, x) => s + Number(x.monto), 0));
  console.log(
    `  ${v} · ${e}: ventas ${ventas.length} (en $0: ${vCero.length}) · cobros ${cobros.length} (en $0: ${cCero.length})` +
      ` · ventas_base ${Number(d.ventas_base).toFixed(2)} = suma con ${sumaV.toFixed(2)} = sin ${sumaVsin.toFixed(2)}` +
      ` · cobros_base ${Number(d.cobros_base).toFixed(2)} = con ${sumaC.toFixed(2)} = sin ${sumaCsin.toFixed(2)}` +
      ` · comision_total ${Number(d.comision_total).toFixed(2)}`,
  );
  for (const x of vCero) console.log(`      $0 factura: ${String(x.fecha).slice(0, 10)} · ${x.cliente} · ${x.secuencial} · ${x.tipo} · util ${x.pct_utilidad}`);
  for (const x of cCero) console.log(`      $0 recibo:  ${String(x.fecha).slice(0, 10)} · ${x.cliente}`);
}
