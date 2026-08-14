// Medición read-only: joystep en Comisiones. NO escribe nada.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const money = (n) => Number(n ?? 0).toFixed(2);

// ── 1) Vendedores de joystep + su tasa ──────────────────────────────────────
const { data: vend, error: e1 } = await sb
  .from("vendedores")
  .select("nombre, codigo, switch_id, activo")
  .eq("empresa_key", "joystep")
  .order("nombre");
if (e1) throw e1;
console.log("\n=== 1) VENDEDORES DE JOYSTEP (tabla `vendedores`) ===");
console.table(vend);

const { data: tasas, error: e2 } = await sb
  .from("comision_vendedor_tasa")
  .select("vendedor_nombre, tasa_venta, tasa_cobro, activo")
  .order("vendedor_nombre");
if (e2) throw e2;
const tasaDe = new Map(tasas.map((t) => [t.vendedor_nombre, t]));
console.log("\n--- tasa de CADA vendedor de joystep en comision_vendedor_tasa ---");
console.table(
  (vend ?? []).map((v) => {
    const t = tasaDe.get(v.nombre);
    return {
      vendedor: v.nombre,
      activo_vendedor: v.activo,
      tiene_fila_tasa: !!t,
      tasa_venta: t ? t.tasa_venta : "(sin fila → RPC usa default 0.0050)",
      tasa_cobro: t ? t.tasa_cobro : "(sin fila → RPC usa default 0.0050)",
      activo_tasa: t ? t.activo : "-",
    };
  }),
);

console.log("\n--- TODA la tabla comision_vendedor_tasa (contexto del grupo) ---");
console.table(tasas);

// ── 2) ¿En qué otras empresas trabajan esos vendedores? ─────────────────────
const nombres = (vend ?? []).map((v) => v.nombre);
if (nombres.length) {
  const { data: cross, error: e3 } = await sb
    .from("vendedores")
    .select("empresa_key, nombre, activo")
    .in("nombre", nombres)
    .order("nombre");
  if (e3) throw e3;
  console.log("\n=== 2) ¿Los vendedores de joystep están en otras empresas? (la tasa es GLOBAL) ===");
  console.table(cross);
}

// ── 3) RPC comision_b2b_v5 para joystep, últimos meses ──────────────────────
const periodos = [
  [2026, 7],
  [2026, 6],
  [2026, 5],
];
console.log("\n=== 3) comision_b2b_v5('joystep', ...) — base = VENTA (subtotal_con_descuento) de las facturas con utilidad>20%, NC restando ===");
for (const [y, m] of periodos) {
  const { data, error } = await sb.rpc("comision_b2b_v5", {
    p_empresa_key: "joystep",
    p_year: y,
    p_mes: m,
  });
  if (error) throw error;
  const vs = data?.vendedores ?? [];
  const tot = vs.reduce((a, v) => a + Number(v.comision_total ?? 0), 0);
  console.log(`\n--- ${y}-${String(m).padStart(2, "0")} — TOTAL comisión = $${money(tot)} ---`);
  console.table(
    vs.map((v) => ({
      vendedor: v.vendedor,
      base_venta: money(v.base),
      tasa_venta: v.tasa,
      com_venta: money(v.comision),
      base_cobro: money(v.base_cobro),
      tasa_cobro: v.tasa_cobro,
      com_cobro: money(v.comision_cobro),
      TOTAL: money(v.comision_total),
    })),
  );
}

// ── 4) Base alternativa: SUM(subtotal firmado) × 0.5% (fórmula Multifashion) ─
console.log("\n=== 4) Base alternativa: SUM(subtotal firmado) de switch_facturas × 0.5% ===");
for (const [y, m] of periodos) {
  const ini = `${y}-${String(m).padStart(2, "0")}-01`;
  const fin = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await sb
      .from("switch_facturas")
      .select("secuencial, tipo_comprobante, subtotal, total, vendedor_nombre, cliente_nombre")
      .eq("empresa_key", "joystep")
      .gte("fecha", ini)
      .lt("fecha", fin)
      .order("secuencial")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const firmado = rows.reduce((a, r) => {
    const s = Number(r.subtotal ?? 0);
    return a + (/cr[eé]dito/i.test(r.tipo_comprobante ?? "") ? -Math.abs(s) : Math.abs(s));
  }, 0);
  console.log(
    `${y}-${String(m).padStart(2, "0")}: docs=${rows.length} · subtotal firmado=$${money(firmado)} · ×0.5% = $${money(firmado * 0.005)}`,
  );
  // desglose por vendedor
  const porV = new Map();
  for (const r of rows) {
    const v = (r.vendedor_nombre ?? "").trim() || "(vacío)";
    const s = Number(r.subtotal ?? 0);
    const sig = /cr[eé]dito/i.test(r.tipo_comprobante ?? "") ? -Math.abs(s) : Math.abs(s);
    porV.set(v, (porV.get(v) ?? 0) + sig);
  }
  console.table(
    [...porV.entries()].map(([v, s]) => ({ vendedor: v, subtotal_firmado: money(s), x0_5pct: money(s * 0.005) })),
  );
}

// ── 5) Insumos crudos de joystep (¿están completos?) ────────────────────────
console.log("\n=== 5) Insumos de joystep ===");
for (const [y, m] of periodos) {
  const ini = `${y}-${String(m).padStart(2, "0")}-01`;
  const fin = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const [u, r] = await Promise.all([
    sb.from("switch_factura_utilidad").select("*", { count: "exact", head: true })
      .eq("empresa_key", "joystep").gte("fecha", ini).lt("fecha", fin),
    sb.from("switch_recibos").select("*", { count: "exact", head: true })
      .eq("empresa_key", "joystep").gte("fecha", ini).lt("fecha", fin),
  ]);
  console.log(`${y}-${String(m).padStart(2, "0")}: switch_factura_utilidad=${u.count} · switch_recibos=${r.count}`);
}

process.exit(0);
