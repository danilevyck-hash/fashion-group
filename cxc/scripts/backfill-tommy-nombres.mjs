#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Backfill de los nombres del catálogo Tommy (25-jul-2026).
//
// Los 490 productos se sembraron con el nombre viejo "{codigo} · {categoría}
// {género}" traducido al español ("FM03971-OGY · Flip Flops Hombre"), que
// duplicaba el código en la card. El nombre nuevo es la descripcion de Switch
// tal cual: "Men-Flip Flops" (ver src/lib/tommy-nombres.ts).
//
// SEGURIDAD:
//   · escribe SOLO la columna `name` — jamás image_url (hay fotos subiéndose en
//     paralelo), ni precios, ni stock, ni active.
//   · category/gender ya guardan los slugs correctos; el nombre se re-arma
//     desde ellos con los MISMOS labels que usa el sync, así el próximo cron
//     escribe exactamente lo mismo y no hay ida y vuelta.
//   · respeta nombre_manual=true (el admin es dueño de ese nombre).
//   · un UPDATE por par (gender, category) — 16 pares, filtro server-side.
//
// Uso:  node scripts/backfill-tommy-nombres.mjs [--apply]
//       (sin --apply es DRY RUN: solo lista lo que cambiaría)
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
  readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error("faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

// Espejo EXACTO de src/lib/tommy-nombres.ts (labels del vocabulario de Switch).
const GENERO = { women: "Women", men: "Men", boys: "Boys", girls: "Girls" };
const CATEGORIA = {
  sneakers: "Sneakers",
  flip_flops: "Flip Flops",
  sandals: "Sandals",
  shoes: "Shoes",
  slippers: "Slippers",
  boots: "Boots",
};

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const res = await fetch(
  `${URL_BASE}/rest/v1/tommy_products?select=id,sku,name,category,gender,nombre_manual&limit=2000`,
  { headers: H },
);
if (!res.ok) throw new Error(`GET falló: ${res.status} ${await res.text()}`);
const rows = await res.json();
console.log(`tommy_products: ${rows.length} filas`);

const porPar = new Map();
let manual = 0;
let sinMapa = 0;
for (const r of rows) {
  if (r.nombre_manual === true) { manual++; continue; }
  const g = GENERO[r.gender];
  const c = CATEGORIA[r.category];
  if (!g || !c) { sinMapa++; continue; } // "otros"/null: se dejan como están
  const nuevo = `${g}-${c}`;
  if (r.name === nuevo) continue;
  const k = `${r.gender}|${r.category}`;
  if (!porPar.has(k)) porPar.set(k, { gender: r.gender, category: r.category, nuevo, ejemplo: r, n: 0 });
  porPar.get(k).n++;
}

const totalCambios = [...porPar.values()].reduce((s, v) => s + v.n, 0);
console.log(`respetados por nombre_manual=true: ${manual}`);
console.log(`sin mapa (category 'otros' / gender null) — SIN TOCAR: ${sinMapa}`);
console.log(`a renombrar: ${totalCambios} filas en ${porPar.size} pares (gender, category)\n`);
for (const v of porPar.values()) {
  console.log(`  ${v.gender}/${v.category}  ×${v.n}   "${v.ejemplo.name}"  →  "${v.nuevo}"`);
}

if (!APPLY) {
  console.log("\nDRY RUN — nada escrito. Correr con --apply para ejecutar.");
  process.exit(0);
}

console.log("\nAplicando (solo columna name)…");
let ok = 0;
for (const v of porPar.values()) {
  const qs = `gender=eq.${encodeURIComponent(v.gender)}&category=eq.${encodeURIComponent(v.category)}&nombre_manual=is.false`;
  const r = await fetch(`${URL_BASE}/rest/v1/tommy_products?${qs}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ name: v.nuevo }),
  });
  if (!r.ok) throw new Error(`PATCH ${v.gender}/${v.category} falló: ${r.status} ${await r.text()}`);
  const actualizados = await r.json();
  ok += actualizados.length;
  console.log(`  ${v.gender}/${v.category}: ${actualizados.length} filas → "${v.nuevo}"`);
}
console.log(`\nListo: ${ok} filas renombradas.`);
