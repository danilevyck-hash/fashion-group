// DRY-RUN read-only del sync de catálogo Reebok. NO escribe nada en la DB ni en
// Switch. Replica la MISMA estrategia del cron (/lista bulk + /stock al set
// acotado = catálogo activo ∪ disponible>=1) y reporta qué HARÍA: cuántos
// refrescaría / agregaría / ocultaría / reactivaría + los nuevos sin foto.
//
// Correr una vez ANTES de habilitar el cron:
//   node scripts/dry-run-reebok-catalogo.mjs
//
// Nota: si todavía no corriste la migración (columna keep_visible), el dry-run
// asume keep_visible=false (correcto pre-migración). Tras la migración, el plan
// exacto también se puede ver en /api/cron/reebok-catalogo?dryRun=1 (con el
// Bearer CRON_SECRET), que corre la lib real.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const SB = env.NEXT_PUBLIC_REEBOK_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SK = env.REEBOK_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const SH = { apikey: SK, Authorization: `Bearer ${SK}` };
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };

// FILTRO PROVEEDOR — réplica exacta de sync-catalogo-reebok.ts: catálogo Reebok =
// SOLO Latin Fitness Group (distribuidor Reebok) y código no-"KL". Excluye la
// basura no-Reebok de active_wear (BELI 18, AMERICAN UNIQUE, GENERAL).
const REEBOK_PROVEEDOR = "LATIN FITNESS GROUP";
const isReebok = (a) => {
  if (String(a.proveedor ?? "").trim().toUpperCase() !== REEBOK_PROVEEDOR) return false;
  if (String(a.codigo ?? "").trim().toUpperCase().startsWith("KL")) return false;
  return true;
};

async function switchAuth(KEY) {
  const URL = (env[`SWITCH_${KEY}_API_URL`] || "").replace(/\/+$/, "");
  const a = await fetch(`${URL}/autenticacion`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ usuario: env[`SWITCH_${KEY}_API_USER`], password: env[`SWITCH_${KEY}_API_PASSWORD`] }) });
  const token = JSON.parse(await a.text())?.data?.token;
  if (typeof token !== "string") throw new Error(`auth ${KEY} HTTP ${a.status}`);
  return { URL, token };
}
async function listAll({ URL, token }) {
  const all = []; let p = 1;
  for (;;) { const r = await fetch(`${URL}/apiarticulos/lista?porPagina=50&paginaActual=${p}`, { headers: { Authorization: token, Accept: "application/json" } }); const arr = (JSON.parse(await r.text())?.data?.articulos) ?? []; all.push(...arr); if (arr.length < 50) break; p++; if (p > 80) break; }
  return all;
}
async function getStock({ URL, token }, articuloId) {
  const r = await fetch(`${URL}/apiarticulos/stock?articuloId=${articuloId}`, { headers: { Authorization: token, Accept: "application/json" } });
  const rows = (JSON.parse(await r.text())?.data?.stock) ?? [];
  return { existencia: Math.trunc(rows.reduce((s, x) => s + num(x.saldo), 0)), disponibilidad: Math.trunc(rows.reduce((s, x) => s + num(x.disponible), 0)) };
}
async function catalogProducts(cats) {
  const inList = cats.map((c) => `"${c}"`).join(",");
  const r = await fetch(`${SB}/rest/v1/products?select=id,sku,name,active,image_url,badge&category=in.(${inList})`, { headers: SH });
  return await r.json();
}

const EMPRESAS = [
  { KEY: "ACTIVE_WEAR", cats: ["apparel", "accessories"] },
  { KEY: "ACTIVE_SHOES", cats: ["footwear"] },
];

for (const { KEY, cats } of EMPRESAS) {
  console.log("\n" + "═".repeat(72) + `\n  ${KEY} (DRY-RUN — no escribe)\n` + "═".repeat(72));
  try {
    const sw = await switchAuth(KEY);
    const artsAll = await listAll(sw);
    if (artsAll.length === 0) { console.log("  Switch devolvió 0 — FAIL-SAFE: el cron NO tocaría este catálogo."); continue; }
    const arts = artsAll.filter(isReebok); // solo Reebok real (Latin Fitness, no-KL)

    const prods = await catalogProducts(cats);
    const bySku = new Map(); const activeSkus = new Set();
    for (const p of prods) { if (!p.sku) continue; bySku.set(String(p.sku), p); if (p.active) activeSkus.add(String(p.sku)); }

    // Productos YA en el catálogo que NO pasarían el filtro (no-Latin-Fitness).
    // NO se tocan; solo se reportan para que Daniel decida después.
    const artByCodigo = new Map(artsAll.map((a) => [String(a.codigo), a]));
    const noPasanFiltro = [];
    for (const p of prods) {
      if (!p.sku) continue;
      const a = artByCodigo.get(String(p.sku));
      if (!a) continue; // no está en /lista de Switch → no clasificable aquí
      if (!isReebok(a)) noPasanFiltro.push(`${p.sku}[${(a.proveedor ?? "").trim() || "sin proveedor"}]${p.active ? "·activo" : "·oculto"}`);
    }

    const stockSet = arts.filter((a) => activeSkus.has(String(a.codigo)) || num(a.disponible) >= 1);
    process.stdout.write(`  /lista=${artsAll.length} (Reebok ${arts.length}) · catálogo=${prods.length} (activos ${activeSkus.size}) · /stock a consultar=${stockSet.length} … `);

    let actualizados = 0, agregados = 0, ocultados = 0, reactivados = 0;
    const nuevos = [], aOcultar = [];
    for (const a of stockSet) {
      const { existencia } = await getStock(sw, a.id);
      const p = bySku.get(String(a.codigo));
      if (p) {
        const keepVisible = p.badge === "proximamente"; // keep_visible col asumida false (pre-migración)
        const shouldShow = existencia >= 1 || keepVisible;
        if (p.active === false && shouldShow) reactivados++;
        else if (p.active === true && !shouldShow) { ocultados++; aOcultar.push(`${a.codigo}(${p.name ?? ""})`); }
        else actualizados++;
      } else if (existencia >= 1) { agregados++; nuevos.push(String(a.codigo)); }
    }
    console.log("listo.");
    console.log(`  REFRESCARÍA: ${actualizados} · AGREGARÍA: ${agregados} · OCULTARÍA: ${ocultados} · REACTIVARÍA: ${reactivados}`);
    if (nuevos.length) console.log(`  NUEVOS sin foto (${nuevos.length}): ${nuevos.slice(0, 30).join(", ")}${nuevos.length > 30 ? `, +${nuevos.length - 30} más` : ""}`);
    if (aOcultar.length) console.log(`  Se ocultarían: ${aOcultar.slice(0, 15).join(", ")}${aOcultar.length > 15 ? `, +${aOcultar.length - 15} más` : ""}`);
    if (noPasanFiltro.length) console.log(`  ⚠️  EN CATÁLOGO pero NO pasan el filtro (${noPasanFiltro.length}) — NO se tocan, Daniel decide: ${noPasanFiltro.slice(0, 20).join(", ")}${noPasanFiltro.length > 20 ? `, +${noPasanFiltro.length - 20} más` : ""}`);
  } catch (err) {
    console.log(`  ERROR: ${err.message} — el cron NO tocaría este catálogo (fail-safe).`);
  }
}
console.log("\n(dry-run read-only — no se escribió nada)");
