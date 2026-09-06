// ─────────────────────────────────────────────────────────────────────────────
// LOS CUATRO NÚMEROS DEL RESUMEN DE VENTAS, medidos contra PRODUCCIÓN.
//
// Ventas netas · Utilidad · Margen · Proyección de cierre del grupo. Es la
// medición de "ningún número se movió": se corre ANTES y DESPUÉS del cambio y
// los cuatro tienen que salir idénticos.
//
// 🔴 SOLO LECTURA. Dos RPC (`ventas_dashboard_summary_v2` y
// `ventas_proyeccion_cierre_v7`) y ni una escritura.
//
// La cuenta NO se inventa acá: es la misma de `fetchVentasResumen`
// (src/lib/ventas/queries.ts) — el margen se calcula filtrando los empresa-mes
// con costo > 0, igual que allá, porque un margen calculado de otra forma no
// probaría nada.
//
//   node scripts/_medir-ventas-cuatro-numeros.mjs [año]
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local"); process.exit(1); }

async function rpc(fn, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.json();
}

const YEAR = Number(process.argv[2] ?? new Date().getFullYear());
const num = (v) => (v == null ? 0 : Number(v));
const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const redondo = (n) => "$" + Math.round(n).toLocaleString("en-US");

const [cur, prev, proy] = await Promise.all([
  rpc("ventas_dashboard_summary_v2", { p_anio: YEAR }),
  rpc("ventas_dashboard_prev_same_period_v4", { p_year: YEAR }).catch(() =>
    rpc("ventas_dashboard_prev_same_period_v3", { p_year: YEAR })),
  rpc("ventas_proyeccion_cierre_v7", { p_anio: YEAR }),
]);

const filasPrev = prev?.rows ?? [];
const serie = (filas, campo) => {
  const m = {};
  for (const f of filas) {
    if (f.mes < 1 || f.mes > 12) continue;
    (m[f.empresa] ??= Array(12).fill(null))[f.mes - 1] = num(f[campo]);
  }
  return m;
};
const v26 = serie(cur, "total_subtotal"), u26 = serie(cur, "total_utilidad"), c26 = serie(cur, "total_costo");
const v25 = serie(filasPrev, "total_subtotal"), u25 = serie(filasPrev, "total_utilidad"), c25 = serie(filasPrev, "total_costo");

let mesActual = 0;
for (const k of Object.keys(v26)) for (let i = 0; i < 12; i++) if (v26[k][i] != null && i + 1 > mesActual) mesActual = i + 1;
const upTo = Math.max(mesActual, 1);

const sumYTD = (a) => (a ?? []).reduce((s, v) => s + (v ?? 0), 0);
const sumFiltrado = (vals, costo, hasta = 12) => {
  let s = 0;
  for (let i = 0; i < Math.min(hasta, 12); i++) if (costo?.[i] != null && costo[i] > 0) s += vals?.[i] ?? 0;
  return s;
};

const claves = new Set([...Object.keys(v26), ...Object.keys(v25)]);
let ventasNetas = 0, utilidad = 0, fUtil = 0, fVenta = 0, fUtilP = 0, fVentaP = 0;
for (const k of claves) {
  ventasNetas += sumYTD(v26[k]);
  utilidad += sumYTD(u26[k]);
  fUtil += sumFiltrado(u26[k], c26[k]);
  fVenta += sumFiltrado(v26[k], c26[k]);
  fUtilP += sumFiltrado(u25[k], c25[k], upTo);
  fVentaP += sumFiltrado(v25[k], c25[k], upTo);
}
const margen = fVenta > 0 ? fUtil / fVenta : 0;
const margenPrev = fVentaP > 0 ? fUtilP / fVentaP : 0;
const g = proy.totales_grupo;
const prevYtdSp = proy.empresas.reduce((s, e) => s + num(e.ventas_prev_ytd_sp), 0);

console.log(`\nVentas ${YEAR} — medido ${new Date().toISOString()}  (corte ${proy.fecha_corte})\n`);
console.log("  Ventas netas         ", money(ventasNetas));
console.log("  Utilidad             ", money(utilidad));
console.log("  Margen               ", (margen * 100).toFixed(4) + "%",
  "  → pantalla hoy:", (margen * 100).toFixed(1) + "%", " · sin decimal:", Math.round(margen * 100) + "%");
console.log("  Margen año anterior  ", (margenPrev * 100).toFixed(4) + "%");
console.log("  Proyección grupo     ", redondo(g.proyeccion_cierre));
console.log("  Δ vs cierre anterior ", (g.delta_vs_anio_anterior_total >= 0 ? "+" : "−") + redondo(Math.abs(g.delta_vs_anio_anterior_total)));
console.log("  Cerró año anterior   ", redondo(g.cierre_anio_anterior_total));
console.log("  Σ prev YTD (mismos días)", money(prevYtdSp),
  " → llevaba el", ((prevYtdSp / g.cierre_anio_anterior_total) * 100).toFixed(0) + "% del año");
console.log("  mesActual            ", mesActual, "\n");
