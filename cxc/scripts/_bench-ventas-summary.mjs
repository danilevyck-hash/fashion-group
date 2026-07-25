#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Bench + paridad de ventas_dashboard_summary (y las otras RPC de /ventas).
//
//   node scripts/_bench-ventas-summary.mjs            # bench
//   node scripts/_bench-ventas-summary.mjs --paridad  # bench + paridad del mes
//
// Correr ANTES y DESPUÉS de aplicar las migraciones 20260725170000 (índices) y
// 20260725170100 (RPC sargable) para comparar. Solo LECTURA: no escribe nada.
//
// Baseline medido 25-jul-2026 (antes de las migraciones):
//   summary(2026) en frío  8.233 ms / 8.801 ms   |  una corrida murió con
//   57014 "canceling statement due to statement timeout" a los 11.988 ms.
//   summary(2020) -> devuelve [] (0 filas) y aun así tarda 3.354 ms.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// En un worktree no hay .env.local (está gitignoreado): caer al repo canónico,
// que es la convención del resto de scripts/.
const ENV_PATH = [
  path.join(ROOT, ".env.local"),
  "/Users/daniellevy/Code/fashion-group/cxc/.env.local",
].find((p) => fs.existsSync(p));
const env = Object.fromEntries(
  fs
    .readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
const YEAR = new Date().getFullYear();

async function rpc(name, body) {
  const t0 = Date.now();
  const r = await fetch(`${U}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  return { ms: Date.now() - t0, st: r.status, txt };
}

async function serie(label, name, body, n = 6) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await rpc(name, body));
  const oks = out.filter((o) => o.st === 200);
  const ms = out.map((o) => o.ms).sort((a, b) => a - b);
  const p50 = ms[Math.floor(ms.length / 2)];
  console.log(
    `${label.padEnd(46)} ${out.map((o) => String(o.ms).padStart(6)).join(" ")} ms` +
      `  | p50=${p50}  max=${ms[ms.length - 1]}  ok=${oks.length}/${out.length}`,
  );
  const err = out.find((o) => o.st !== 200);
  if (err) console.log(`    FALLO: st=${err.st} ${err.txt.slice(0, 140)}`);
}

console.log(`=== BENCH RPCs de /ventas (año ${YEAR}) ===`);
await serie("ventas_dashboard_summary(anio)", "ventas_dashboard_summary", { p_anio: YEAR });
await serie(
  "ventas_dashboard_summary(2020)  [debe dar 0 filas]",
  "ventas_dashboard_summary",
  { p_anio: 2020 },
  3,
);
await serie("ventas_dashboard_prev_same_period_v2", "ventas_dashboard_prev_same_period_v2", {
  p_year: YEAR,
});
await serie("ventas_proyeccion_cierre_v6", "ventas_proyeccion_cierre_v6", { p_anio: YEAR }, 3);

console.log("\n=== 4 llamadas EN PARALELO (lo que hace la página) ===");
for (let r0 = 1; r0 <= 3; r0++) {
  const t0 = Date.now();
  const rs = await Promise.all([
    rpc("ventas_dashboard_summary", { p_anio: YEAR }),
    rpc("ventas_dashboard_prev_same_period_v2", { p_year: YEAR }),
    rpc("ventas_proyeccion_cierre_v6", { p_anio: YEAR }),
    rpc("multifashion_mensual_v7", { p_year: YEAR, p_mes: new Date().getMonth() + 1 }),
  ]);
  console.log(
    `  ronda ${r0}: total=${Date.now() - t0}ms  ${rs.map((x) => `${x.ms}ms/${x.st}`).join("  ")}`,
  );
}

if (!process.argv.includes("--paridad")) process.exit(0);

// ── PARIDAD del mes en curso: recalculo en JS la fórmula de la RPC nueva desde
// las tablas base y la comparo contra las vistas de hoy. Debe dar 0 diferencias.
console.log("\n=== PARIDAD mes en curso (tablas base vs vistas) ===");
const get = async (p) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: H });
  const t = await r.text();
  if (r.status >= 400) throw new Error(t);
  return JSON.parse(t);
};
const paginar = async (base) => {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const b = await get(`${base}&limit=1000&offset=${off}`);
    out.push(...b);
    if (b.length < 1000) break;
  }
  return out;
};
// numeric(x,4) -> enteros de 1e-4 para sumar sin error de coma flotante
const S = (v) => Math.round(Number(v) * 10000);
const fmt = (n) => (n / 10000).toFixed(4);

const hoy = new Date();
const m0 = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
// Panamá es UTC-5 FIJO (sin horario de verano) -> el mes local empieza a las 05:00Z
const iso = (d) => d.toISOString().slice(0, 10);
const MES = iso(m0);
const FINDATE = iso(new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + 1, 1)));
const INI = `${MES}T05:00:00Z`;
const FIN = `${FINDATE}T05:00:00Z`;
console.log(`  ventana: [${INI}, ${FIN})   mes=${MES}`);

const POS = new Set(["Factura", "Tiquete", "Transacción", "Nota de Débito"]);
const nuevoV = {};
const fact = await paginar(
  `switch_facturas?select=empresa_key,tipo_comprobante,subtotal_descuento&fecha=gte.${INI}&fecha=lt.${FIN}`,
);
for (const f of fact) {
  nuevoV[f.empresa_key] ??= 0;
  if (POS.has(f.tipo_comprobante)) nuevoV[f.empresa_key] += S(f.subtotal_descuento);
  else if (f.tipo_comprobante === "Nota de Crédito")
    nuevoV[f.empresa_key] -= S(f.subtotal_descuento);
}
const nuevoC = {};
const sad = await paginar(
  `switch_articulo_diario?select=empresa_key,tipo,costo_total&fecha=gte.${MES}&fecha=lt.${FINDATE}`,
);
for (const a of sad) {
  nuevoC[a.empresa_key] ??= 0;
  nuevoC[a.empresa_key] += a.tipo === "NC" ? -S(a.costo_total) : S(a.costo_total);
}
console.log(`  filas leídas: switch_facturas=${fact.length}  switch_articulo_diario=${sad.length}`);

const viejoV = Object.fromEntries(
  (await get(`switch_ventas_unificado_vw?select=empresa_key,ventas_netas&mes=eq.${MES}`)).map(
    (r) => [r.empresa_key, S(r.ventas_netas)],
  ),
);
const viejoC = Object.fromEntries(
  (await get(`switch_costo_unificado_vw?select=empresa_key,costo_total&mes=eq.${MES}`)).map((r) => [
    r.empresa_key,
    S(r.costo_total),
  ]),
);

let diffs = 0;
for (const [rot, nuevo, viejo] of [
  ["VENTAS", nuevoV, viejoV],
  ["COSTO ", nuevoC, viejoC],
]) {
  console.log(`\n  ${rot}  empresa`.padEnd(40) + "nuevo".padStart(15) + "viejo".padStart(16));
  for (const k of [...new Set([...Object.keys(nuevo), ...Object.keys(viejo)])].sort()) {
    const a = nuevo[k] ?? 0;
    const b = viejo[k] ?? 0;
    if (a !== b) diffs++;
    console.log(
      `    ${k.padEnd(30)} ${fmt(a).padStart(15)} ${fmt(b).padStart(15)}  ${a === b ? "OK" : "*** Δ " + fmt(a - b)}`,
    );
  }
}
console.log(`\n>>> DIFERENCIAS: ${diffs}`);
process.exit(diffs === 0 ? 0 : 1);
