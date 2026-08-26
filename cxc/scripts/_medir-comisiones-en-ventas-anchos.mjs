// ─────────────────────────────────────────────────────────────────────────────
// Los 4 anchos de la pestaña Comisiones DENTRO de Ventas — y de la tira de 5.
//
// 🩸 QUÉ PODÍA ROMPERSE. Con CUATRO pestañas la tira medía 315 px de texto + 32
// de relleno = 347 en una pantalla de 390: 43 px de aire. «Comisiones» tiene
// las MISMAS 10 letras que tenía «Referencia» —la 5ª que en agosto obligó a
// esconder los iconos y a bajar la letra a 13 px— así que devuelve el mismo
// apriete. Este script mide si la PÁGINA se arrastra, no si "se ve bien".
//
// Mide, en `/comisiones` (la puerta de siempre) y en `/ventas?tab=comisiones`
// (la nueva), a 390 · 834 · 1024 · 1440, en los DOS modos:
//   A. ARRASTRE DE LA PÁGINA  — documentElement.scrollWidth − clientWidth.
//   B. ARRASTRE DE LA TIRA    — cuánto se puede scrollear el TabsList.
//   C. ARRASTRE INTERNO de la tabla y RECORTE (lo que no se alcanza ni
//      arrastrando).
//   D. Textos < 12 px y tocables < 44 px.
//
// GOTCHAS (no tocar sin leer): cookie firmada + `sessionStorage.cxc_role` +
// `delete Navigator.prototype.serviceWorker` ANTES de navegar; y tocar la
// pestaña/empresa que YA está activa no dispara ningún pedido.
//
// Solo lectura: nunca toca "Actualizar ahora" ni "Excel".
//
//   BASE=http://localhost:3164 node scripts/_medir-comisiones-en-ventas-anchos.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3164";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const COOKIE = readFileSync(process.env.COOKIE_FILE ?? "/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true },
  { nombre: "834", width: 834, height: 1194, movil: true },
  { nombre: "1024", width: 1024, height: 768, movil: true },
  { nombre: "1440", width: 1440, height: 900, movil: false },
];

const PUERTAS = [
  { nombre: "modulo  /comisiones", url: "/comisiones", tira: false },
  { nombre: "pestaña /ventas", url: "/ventas?tab=comisiones", tira: true },
];

const MEDIR = `(() => {
  const doc = document.documentElement;
  const arrastrePagina = doc.scrollWidth - doc.clientWidth;

  // La TIRA de pestañas (solo existe en /ventas).
  let tira = null;
  const lista = document.querySelector('[role="tablist"]');
  if (lista) {
    tira = {
      arrastre: lista.scrollWidth - lista.clientWidth,
      anchoContenido: lista.scrollWidth,
      anchoCaja: lista.clientWidth,
      pestanas: lista.querySelectorAll('[role="tab"]').length,
      overflowX: getComputedStyle(lista).overflowX,
    };
  }

  // Tabla / tarjetas.
  const tabla = document.querySelector("table");
  let detalle = { tabla: null, tarjetas: document.querySelectorAll("[data-comision-card]").length, arrastreInterno: 0, recorte: 0 };
  if (tabla) {
    const r = tabla.getBoundingClientRect();
    let hayScroller = false, recorte = 0, arrastreInterno = 0;
    for (let el = tabla.parentElement; el && el !== document.body; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === "visible") continue;
      const ax = el.scrollWidth - el.clientWidth;
      const rr = el.getBoundingClientRect();
      const puede = cs.overflowX === "auto" || cs.overflowX === "scroll";
      const fuera = puede || hayScroller ? 0
        : Math.max(0, Math.round(r.right - rr.right)) + Math.max(0, Math.round(rr.left - r.left));
      if (puede && ax > 0) hayScroller = true;
      if (puede) arrastreInterno = Math.max(arrastreInterno, ax);
      recorte = Math.max(recorte, fuera);
    }
    detalle = {
      tabla: { columnas: tabla.querySelectorAll("thead th").length, filas: tabla.querySelectorAll("tbody tr").length },
      tarjetas: document.querySelectorAll("[data-comision-card]").length,
      arrastreInterno, recorte,
    };
  }

  // Letra chica y tocables chicos, en lo que se VE.
  const visible = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  let textosChicos = 0, tocablesChicos = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (propio && parseFloat(cs.fontSize) < 12) textosChicos += 1;
    if (el.matches('button, a[href], [role="tab"], input, select, [role="option"]')) {
      const b = el.getBoundingClientRect();
      if (b.height < 44) tocablesChicos += 1;
    }
  }

  return { arrastrePagina, tira, ...detalle, textosChicos, tocablesChicos, anchoViewport: window.innerWidth };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const filas = [];
let malas = 0;

for (const puerta of PUERTAS) {
  for (const t of TAMANOS) {
    const ctx = await navegador.newContext({
      viewport: { width: t.width, height: t.height },
      deviceScaleFactor: 2,
      ...(t.movil ? { hasTouch: true, isMobile: false } : {}),
    });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
    await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
    await ctx.addInitScript(() => {
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("fg_is_owner", "1");
      localStorage.setItem("fg_comisiones_mode", "todas");
    });
    const page = await ctx.newPage();
    const erroresJs = [];
    page.on("pageerror", (e) => erroresJs.push(String(e.message)));

    await page.goto(`${BASE}${puerta.url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    const r = { puerta: puerta.nombre, tamano: t.nombre };
    r.todas = await page.evaluate(MEDIR);
    await page.screenshot({ path: path.join(SALIDA, `comi-ventas-${puerta.tira ? "pestana" : "modulo"}-${t.nombre}-todas.png`), fullPage: true });

    // 🩸 Tocar el modo que YA está activo no dispara nada.
    const btn = page.getByRole("button", { name: "Por empresa", exact: true });
    if (await btn.count()) {
      await Promise.all([
        page.waitForResponse((x) => x.url().includes("/api/ventas/comisiones?"), { timeout: 30000 }).catch(() => null),
        btn.first().click(),
      ]);
      await page.waitForTimeout(1800);
      r.porEmpresa = await page.evaluate(MEDIR);
      await page.screenshot({ path: path.join(SALIDA, `comi-ventas-${puerta.tira ? "pestana" : "modulo"}-${t.nombre}-empresa.png`), fullPage: true });
    }
    r.erroresJs = erroresJs.slice(0, 3);
    filas.push(r);

    const linea = (m, etiqueta) =>
      `    ${etiqueta.padEnd(11)} página ${String(m.arrastrePagina).padStart(4)}px` +
      `  tira ${m.tira ? String(m.tira.arrastre).padStart(4) + "px (" + m.tira.pestanas + " pestañas, " + m.tira.anchoContenido + "/" + m.tira.anchoCaja + ")" : "  —"}` +
      `  interno ${String(m.arrastreInterno).padStart(4)}px  recorte ${String(m.recorte).padStart(4)}px` +
      `  ${m.tabla ? `tabla ${m.tabla.columnas}col×${m.tabla.filas}f` : `tarjetas ${m.tarjetas}`}` +
      `  <12px ${m.textosChicos}  <44px ${m.tocablesChicos}`;
    console.error(`[${puerta.nombre}] @${t.nombre}`);
    console.error(linea(r.todas, "todas"));
    if (r.porEmpresa) console.error(linea(r.porEmpresa, "por empresa"));
    if (r.erroresJs.length) console.error(`    ⚠️ JS: ${r.erroresJs.join(" | ")}`);

    for (const m of [r.todas, r.porEmpresa].filter(Boolean)) {
      if (m.arrastrePagina > 0) { malas += 1; console.error(`    🔴 LA PÁGINA SE ARRASTRA ${m.arrastrePagina}px`); }
      if (m.tira && m.tira.arrastre > 0) { malas += 1; console.error(`    🔴 LA TIRA SE ARRASTRA ${m.tira.arrastre}px`); }
      if (m.recorte > 0) { malas += 1; console.error(`    🔴 RECORTE ${m.recorte}px`); }
    }
    await ctx.close();
  }
}

await navegador.close();
writeFileSync(path.join(SALIDA, "comisiones-en-ventas-anchos.json"), JSON.stringify(filas, null, 2));
console.error(`\n${malas === 0 ? "✅" : "🔴"} casos con arrastre/recorte: ${malas}   (medidos ${filas.length} × 2 modos)`);
process.exit(malas === 0 ? 0 : 1);
