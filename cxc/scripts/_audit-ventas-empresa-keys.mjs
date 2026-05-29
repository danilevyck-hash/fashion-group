// Audit one-shot: keys de empresa en ventas_raw + queries de validación
// para el gap de Vistana mayo 2026 y triangulito enero 2026.
//
// NO commitear este script (es para diagnóstico, no para producción).
//
// Uso: node scripts/_audit-ventas-empresa-keys.mjs

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const ALL_EMPRESA_KEYS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
  "confecciones_boston",
  "american_classic",
];

// ── Paginated fetch helper ──
async function fetchAll(table, select, filter) {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    let q = sb.from(table).select(select).range(offset, offset + pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

console.log("⏳ Fetching all ventas_raw rows (empresa, anio, mes, subtotal, fecha, uploaded_at)...");
const t0 = Date.now();
const rows = await fetchAll(
  "ventas_raw",
  "empresa, anio, mes, subtotal, fecha, uploaded_at"
);
console.log(`✓ ${rows.length.toLocaleString()} filas en ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

// ── Q1: distinct empresa keys ──
const byEmpresa = new Map();
for (const r of rows) {
  const k = r.empresa ?? "(null)";
  const e = byEmpresa.get(k) ?? { count: 0, sum: 0, minDate: null, maxDate: null };
  e.count++;
  e.sum += Number(r.subtotal ?? 0);
  if (!e.minDate || r.fecha < e.minDate) e.minDate = r.fecha;
  if (!e.maxDate || r.fecha > e.maxDate) e.maxDate = r.fecha;
  byEmpresa.set(k, e);
}

console.log("═══ Q1: Empresa keys en ventas_raw ═══");
const empresaKeys = [...byEmpresa.keys()].sort();
const knownInMap = new Set(ALL_EMPRESA_KEYS);
const unknownKeys = [];
console.log("KEY".padEnd(30) + "COUNT".padStart(10) + "SUM".padStart(18) + "  RANGE".padEnd(30) + "  IN_MAP");
console.log("─".repeat(95));
for (const k of empresaKeys) {
  const e = byEmpresa.get(k);
  const inMap = knownInMap.has(k);
  if (!inMap) unknownKeys.push(k);
  console.log(
    k.padEnd(30) +
    e.count.toLocaleString().padStart(10) +
    ("$" + Math.round(e.sum).toLocaleString()).padStart(18) +
    `  ${e.minDate} → ${e.maxDate}`.padEnd(30) +
    (inMap ? "  ✓" : "  ✗ UNKNOWN")
  );
}
console.log();
const missingFromData = ALL_EMPRESA_KEYS.filter(k => !byEmpresa.has(k));
if (missingFromData.length) {
  console.log(`⚠️ Keys en ALL_EMPRESA_KEYS sin filas en ventas_raw: ${missingFromData.join(", ")}`);
}
if (unknownKeys.length) {
  console.log(`⚠️ Keys en ventas_raw que NO están en ALL_EMPRESA_KEYS (se ignoran en el frontend): ${unknownKeys.join(", ")}`);
}
console.log();

// ── Q2: Vistana mes=1 año=2025 ──
console.log("═══ Q2: Enero 2025 por empresa ═══");
const ene25 = new Map();
for (const r of rows) {
  if (r.anio !== 2025 || r.mes !== 1) continue;
  const k = r.empresa ?? "(null)";
  const e = ene25.get(k) ?? { count: 0, sum: 0 };
  e.count++;
  e.sum += Number(r.subtotal ?? 0);
  ene25.set(k, e);
}
console.log("KEY".padEnd(30) + "COUNT".padStart(10) + "SUM".padStart(18));
console.log("─".repeat(58));
for (const k of [...ene25.keys()].sort()) {
  const e = ene25.get(k);
  console.log(k.padEnd(30) + e.count.toLocaleString().padStart(10) + ("$" + Math.round(e.sum).toLocaleString()).padStart(18));
}
console.log();

// ── Q3: Mayo 2026 por empresa ──
console.log("═══ Q3: Mayo 2026 por empresa ═══");
const may26 = new Map();
for (const r of rows) {
  if (r.anio !== 2026 || r.mes !== 5) continue;
  const k = r.empresa ?? "(null)";
  const e = may26.get(k) ?? { count: 0, sum: 0, maxFecha: null };
  e.count++;
  e.sum += Number(r.subtotal ?? 0);
  if (!e.maxFecha || r.fecha > e.maxFecha) e.maxFecha = r.fecha;
  may26.set(k, e);
}
console.log("KEY".padEnd(30) + "COUNT".padStart(10) + "SUM".padStart(18) + "  MAX_FECHA");
console.log("─".repeat(73));
for (const k of [...may26.keys()].sort()) {
  const e = may26.get(k);
  console.log(k.padEnd(30) + e.count.toLocaleString().padStart(10) + ("$" + Math.round(e.sum).toLocaleString()).padStart(18) + `  ${e.maxFecha}`);
}
console.log();

// ── Q4: Último upload (max uploaded_at) ──
console.log("═══ Q4: Últimas filas creadas ═══");
let maxCreated = null;
let maxCreatedAnio = null;
let maxCreatedMes = null;
const recentByDay = new Map();
for (const r of rows) {
  if (!r.uploaded_at) continue;
  const day = r.uploaded_at.slice(0, 10);
  recentByDay.set(day, (recentByDay.get(day) ?? 0) + 1);
  if (!maxCreated || r.uploaded_at > maxCreated) {
    maxCreated = r.uploaded_at;
    maxCreatedAnio = r.anio;
    maxCreatedMes = r.mes;
  }
}
const recentDays = [...recentByDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);
console.log(`Último uploaded_at: ${maxCreated}  (anio=${maxCreatedAnio}, mes=${maxCreatedMes})`);
console.log("Filas creadas por día (últimos 10 días con uploads):");
for (const [day, count] of recentDays) {
  console.log(`  ${day}: ${count.toLocaleString()} filas`);
}
console.log();

// ── Q5: Vistana específico — todos los meses ──
console.log("═══ Q5: Vistana — totales mensuales 2025 vs 2026 ═══");
console.log("MES".padEnd(6) + "2025".padStart(15) + "2026".padStart(15));
console.log("─".repeat(36));
for (let m = 1; m <= 12; m++) {
  let s25 = 0, s26 = 0;
  for (const r of rows) {
    if (r.empresa !== "vistana" || r.mes !== m) continue;
    if (r.anio === 2025) s25 += Number(r.subtotal ?? 0);
    if (r.anio === 2026) s26 += Number(r.subtotal ?? 0);
  }
  const lbl = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][m - 1];
  console.log(lbl.padEnd(6) + ("$" + Math.round(s25).toLocaleString()).padStart(15) + ("$" + Math.round(s26).toLocaleString()).padStart(15));
}
console.log();

// ── Q6: Fashion Shoes ene 2025 vs ene 2026 (el otro caso del bug) ──
console.log("═══ Q6: Fashion Shoes — comparativo enero ═══");
const fs25e = rows.filter(r => r.empresa === "fashion_shoes" && r.anio === 2025 && r.mes === 1);
const fs26e = rows.filter(r => r.empresa === "fashion_shoes" && r.anio === 2026 && r.mes === 1);
console.log(`  fashion_shoes ene 2025: ${fs25e.length} filas, $${Math.round(fs25e.reduce((s,r) => s + Number(r.subtotal ?? 0), 0)).toLocaleString()}`);
console.log(`  fashion_shoes ene 2026: ${fs26e.length} filas, $${Math.round(fs26e.reduce((s,r) => s + Number(r.subtotal ?? 0), 0)).toLocaleString()}`);
