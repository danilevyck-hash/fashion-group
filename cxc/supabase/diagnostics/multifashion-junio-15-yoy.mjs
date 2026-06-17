// Diagnóstico read-only: ventas retail mostrador Multifashion día por día,
// junio 1–15 de 2025 vs junio 1–15 de 2026. Valida el delta "VS 2025" del subtab
// Detalle mensual. Misma fuente que el RPC: _multifashion_sf_vw, is_wholesale=false,
// ventas = SUM(subtotal) por día. No escribe nada.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function fetchDias(desde, hasta) {
  // Trae filas crudas (fecha, subtotal) y agrega por día en JS.
  const url =
    `${URL_BASE}/rest/v1/_multifashion_sf_vw` +
    `?select=fecha,subtotal&is_wholesale=eq.false` +
    `&fecha=gte.${desde}&fecha=lte.${hasta}`;
  const rows = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const r = await fetch(url, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
    const batch = await r.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  const porDia = new Map();
  for (const row of rows) {
    const dia = Number(row.fecha.slice(8, 10));
    porDia.set(dia, (porDia.get(dia) ?? 0) + Number(row.subtotal));
  }
  return { porDia, nFilas: rows.length };
}

const a2025 = await fetchDias("2025-06-01", "2025-06-15");
const a2026 = await fetchDias("2026-06-01", "2026-06-15");

const fmt = (n) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let tot25 = 0;
let tot26 = 0;
console.log("Día |   2025 ret. |   2026 ret.");
console.log("----+-------------+------------");
for (let d = 1; d <= 15; d++) {
  const v25 = a2025.porDia.get(d) ?? 0;
  const v26 = a2026.porDia.get(d) ?? 0;
  tot25 += v25;
  tot26 += v26;
  console.log(
    `${String(d).padStart(3)} | ${fmt(v25).padStart(11)} | ${fmt(v26).padStart(10)}`,
  );
}
console.log("----+-------------+------------");
console.log(`TOT | ${fmt(tot25).padStart(11)} | ${fmt(tot26).padStart(10)}`);
console.log("");
console.log(`Filas crudas: 2025=${a2025.nFilas}, 2026=${a2026.nFilas}`);
console.log(`Total jun 1-15 2025: $${fmt(tot25)}`);
console.log(`Total jun 1-15 2026: $${fmt(tot26)}`);
const delta = tot25 > 0 ? (tot26 - tot25) / tot25 : null;
console.log(`Delta 2026 vs 2025:  ${delta == null ? "—" : (delta * 100).toFixed(1) + "%"}`);
