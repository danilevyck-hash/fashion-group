// La tabla "Mes a mes" dice lo MISMO en celular que en escritorio, y nada quedó
// por debajo de 44 px.
//
// 🩸 El cambio del 30-jul-2026 reparte la fila en dos líneas por debajo de `md`.
// Mover cosas de lugar es exactamente cuando se cuela un número perdido o un
// formato distinto, así que se compara celda por celda: mes, monto del año
// actual, monto del año anterior y Δ (porcentaje + absoluto).
//
// 🩸 La comparación va contra `data-col`, NO contra la clase del breakpoint:
// buscar por `.md\\:block` devuelve vacío en cuanto el corte se mueve, el
// chequeo compara CERO celdas y pasa en verde sin haber mirado nada. Y falla si
// encuentra cero.
//
// GOTCHAS heredados: sembrar la cookie + `sessionStorage.cxc_role` (si no, todo
// al login) y `delete Navigator.prototype.serviceWorker` antes de navegar.
//
// Solo lectura: no toca ningún botón que ejecute nada.
//
//   node scripts/_verif-mes-a-mes.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3184";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const LEER_FILAS = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };
  const t = document.querySelector('[data-tabla="mes-a-mes"]');
  if (!t) return [];
  return [...t.querySelectorAll('[data-fila="mes"]')].filter(visible).map((f) => ({
    mes: (f.querySelector('[data-col="mes"]')?.textContent ?? "").replace(/\\s+/g, " ").trim(),
    actual: (f.querySelector('[data-col="actual"]')?.textContent ?? "").trim(),
    previo: (f.querySelector('[data-col="previo"]')?.textContent ?? "").trim(),
    delta: (f.querySelector('[data-col="delta"]')?.textContent ?? "").replace(/\\s+/g, " ").trim(),
  }));
})()`;

const PILDORAS = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };
  const main = document.querySelector("main") ?? document.body;
  const out = [];
  for (const el of main.querySelectorAll("button, a[href], [role=button], input, select")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width >= 44) continue;
    out.push({
      etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\\s+/g, " ").trim().slice(0, 26),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }
  return out;
})()`;

async function abrir(nav, url, ancho, espera) {
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844 },
    deviceScaleFactor: 1,
    hasTouch: ancho < 1200,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(espera);
  return { ctx, page };
}

const nav = await chromium.launch();
let fallo = false;

// ── 1. Mismos datos en celular y en escritorio ──────────────────────────────
const a = await abrir(nav, "/multifashion?subtab=resumen", 390, 13000);
const movil = await a.page.evaluate(LEER_FILAS);
await a.ctx.close();

const b = await abrir(nav, "/multifashion?subtab=resumen", 1440, 13000);
const escritorio = await b.page.evaluate(LEER_FILAS);
await b.ctx.close();

console.error(`\n=== Mes a mes: celular vs escritorio ===`);
console.error(`  390: ${movil.length} filas · 1440: ${escritorio.length} filas`);
if (!movil.length || !escritorio.length) {
  console.error("  ✗ NO MEDIDO — no encontré las filas. El chequeo no probó nada.");
  fallo = true;
} else if (movil.length !== escritorio.length) {
  console.error(`  ✗ distinta cantidad de filas`);
  fallo = true;
} else {
  let dif = 0;
  for (let i = 0; i < movil.length; i++) {
    for (const campo of ["mes", "actual", "previo", "delta"]) {
      if (movil[i][campo] !== escritorio[i][campo]) {
        dif++;
        console.error(`  ✗ fila ${i} · ${campo}: celular "${movil[i][campo]}" ≠ escritorio "${escritorio[i][campo]}"`);
      }
    }
  }
  console.error(`  ${movil.length * 4} celdas comparadas · ${dif} distintas`);
  if (dif) fallo = true;
}

// ── 2. Blancos táctiles ──────────────────────────────────────────────────────
console.error(`\n=== blancos táctiles < 44 px ===`);
for (const [nombre, url] of [
  ["multifashion-resumen", "/multifashion?subtab=resumen"],
  ["multifashion-clientes", "/multifashion?subtab=clientes"],
]) {
  for (const ancho of [390, 834]) {
    const { ctx, page } = await abrir(nav, url, ancho, 13000);
    const chicos = await page.evaluate(PILDORAS);
    await ctx.close();
    console.error(`  ${nombre.padEnd(22)} @${ancho}: ${chicos.length}${chicos.length ? " " + JSON.stringify(chicos.slice(0, 5)) : ""}`);
    if (chicos.length) fallo = true;
  }
}

await nav.close();
console.error(fallo ? "\n⚠️ REVISAR" : "\n✅ ningún número cambió y nada quedó bajo 44 px");
process.exit(fallo ? 1 : 0);
