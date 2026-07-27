/**
 * SOLO LECTURA. Diagnóstico de valores imposibles en switch_costo_diario:
 *  1) La fila exacta de confecciones_boston 2026-07-14 (todas sus columnas).
 *  2) Distribución real de costo_total por empresa (para calibrar un umbral
 *     relativo defendible, no un número fijo).
 *  3) Barrido de filas absurdas ya guardadas — NO borra nada, solo lista.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function q(path) {
  const out = [];
  let from = 0;
  for (;;) {
    const res = await fetch(`${URL_}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
  }
  return out;
}

const f = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── 1. LA FILA ───────────────────────────────────────────────────────────────
const mala = await q(
  "switch_costo_diario?select=*&empresa_key=eq.confecciones_boston&fecha=eq.2026-07-14",
);
console.log("=== 1. LA FILA A BORRAR (todas las columnas) ===");
console.log(JSON.stringify(mala, null, 2));

// ── 2. DISTRIBUCIÓN ──────────────────────────────────────────────────────────
const todas = await q("switch_costo_diario?select=*&order=fecha.asc");
console.log(`\n=== 2. DISTRIBUCIÓN — ${todas.length} filas ===`);
console.log(`Rango de fechas: ${todas[0]?.fecha} .. ${todas[todas.length - 1]?.fecha}`);

const porEmpresa = new Map();
for (const r of todas) {
  if (!porEmpresa.has(r.empresa_key)) porEmpresa.set(r.empresa_key, []);
  porEmpresa.get(r.empresa_key).push(r);
}

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
};

console.log(
  "\nempresa".padEnd(24) +
    "n".padStart(5) +
    "mediana".padStart(14) +
    "p90".padStart(14) +
    "p99".padStart(14) +
    "MÁXIMO".padStart(20) +
    "  máx/p99",
);
for (const [emp, rows] of [...porEmpresa.entries()].sort()) {
  const costos = rows.map((r) => Number(r.costo_total));
  const max = Math.max(...costos);
  const p99 = pct(costos, 0.99);
  const p90 = pct(costos, 0.9);
  const med = pct(costos, 0.5);
  console.log(
    emp.padEnd(24) +
      String(rows.length).padStart(5) +
      f(med).padStart(14) +
      f(p90).padStart(14) +
      f(p99).padStart(14) +
      f(max).padStart(20) +
      "  " +
      (p99 > 0 ? (max / p99).toFixed(1) + "x" : "n/a"),
  );
}

// Sin la fila mala, ¿cuál es el techo real?
const sinMala = todas.filter((r) => Number(r.costo_total) < 1e8);
const topGlobal = [...sinMala].sort((a, b) => Number(b.costo_total) - Number(a.costo_total)).slice(0, 15);
console.log("\n--- TOP 15 costos diarios REALES (excluida la fila de mil millones) ---");
for (const r of topGlobal) {
  console.log(
    `  ${r.fecha}  ${r.empresa_key.padEnd(22)} costo ${f(r.costo_total).padStart(14)}  venta ${f(r.venta_total).padStart(14)}`,
  );
}

// Ratio costo/venta (el otro ángulo: un costo que multiplica la venta)
console.log("\n--- TOP 15 por ratio costo/venta (venta > 0) ---");
const conVenta = todas.filter((r) => Number(r.venta_total) > 0);
const porRatio = [...conVenta]
  .sort((a, b) => Number(b.costo_total) / Number(b.venta_total) - Number(a.costo_total) / Number(a.venta_total))
  .slice(0, 15);
for (const r of porRatio) {
  const ratio = Number(r.costo_total) / Number(r.venta_total);
  console.log(
    `  ${r.fecha}  ${r.empresa_key.padEnd(22)} costo ${f(r.costo_total).padStart(16)}  venta ${f(r.venta_total).padStart(12)}  ${ratio.toFixed(2)}x`,
  );
}

// ── 3. BARRIDO DE ABSURDOS ───────────────────────────────────────────────────
console.log("\n=== 3. FILAS SOSPECHOSAS YA GUARDADAS (NO se borran) ===");
console.log("\n(a) costo_total > 1,000,000 (un día de costo por encima del millón):");
for (const r of todas.filter((r) => Number(r.costo_total) > 1_000_000)) {
  console.log(`  🔴 ${r.empresa_key} · ${r.fecha} · costo ${f(r.costo_total)} · venta ${f(r.venta_total)}`);
}
console.log("\n(b) costo_total > 3× venta_total y costo > 1,000:");
for (const r of todas.filter(
  (r) => Number(r.venta_total) > 0 && Number(r.costo_total) > 3 * Number(r.venta_total) && Number(r.costo_total) > 1000,
)) {
  console.log(
    `  ⚠️  ${r.empresa_key} · ${r.fecha} · costo ${f(r.costo_total)} · venta ${f(r.venta_total)} · ${(Number(r.costo_total) / Number(r.venta_total)).toFixed(1)}x`,
  );
}
console.log("\n(c) costo > 0 con venta = 0:");
for (const r of todas.filter((r) => Number(r.venta_total) === 0 && Number(r.costo_total) > 1000)) {
  console.log(`  ⚠️  ${r.empresa_key} · ${r.fecha} · costo ${f(r.costo_total)} · venta 0`);
}
console.log("\n(d) utilidad_total incoherente (|venta - costo - utilidad| > 1):");
let inc = 0;
for (const r of todas) {
  const d = Math.abs(Number(r.venta_total) - Number(r.costo_total) - Number(r.utilidad_total));
  if (d > 1) {
    inc++;
    if (inc <= 10)
      console.log(
        `  ⚠️  ${r.empresa_key} · ${r.fecha} · venta ${f(r.venta_total)} − costo ${f(r.costo_total)} ≠ utilidad ${f(r.utilidad_total)} (Δ ${f(d)})`,
      );
  }
}
console.log(`  total incoherentes: ${inc}`);
