// ─────────────────────────────────────────────────────────────────────────────
// MEDICIÓN de los 8 cambios de Catálogos (6-sep-2026). Antes y después.
//
// Qué mide, en el orden del encargo:
//
//   1.1  el número de la TARJETA del hub contra lo que de verdad se ve al
//        entrar al catálogo (la tarjeta contaba lo que existe; el catálogo
//        muestra lo vendible).
//   2.1  el ANCHO de la tarjeta de producto en el catálogo con sesión, contra
//        el del catálogo público, en iPad vertical (834) y en iPhone (390).
//        La barra lateral se lleva 224 px (w-56) y el público no la tiene.
//   2.2  todo control TOCABLE por debajo de 44 px, página por página.
//   3.1  el ALTO REAL de la barra del carrito contra el espacio reservado
//        abajo del grid (pb-28 = 112 px), y si el botón de la última fila
//        queda tapado.
//
// SOLO LECTURA de datos: navega, toca «Agregar» (el carrito vive en la sesión
// de la pestaña) y mide. No guarda, no borra, no manda nada a Switch.
//
//   ETAPA=antes  BASE=http://localhost:3311 node scripts/_medir-catalogos-8-cambios.mjs
//   ETAPA=despues BASE=http://localhost:3311 node scripts/_medir-catalogos-8-cambios.mjs
//
// GOTCHAS heredados de los barridos anteriores (respetarlos o se mide humo):
//   1. Cookie firmada + `sessionStorage.cxc_role`, o todo redirige al login.
//   2. `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//   3. Esperar a que el grid deje de crecer: las fotos entran tarde.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3311";
const SALIDA = process.env.SALIDA ?? "/tmp/catalogos-8-cambios";
const ETAPA = process.env.ETAPA ?? "antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
// El Chromium de Playwright de esta máquina está roto (falta el framework),
// así que se mide con el Chrome del sistema. Mismo motor.
const CANAL = process.env.CANAL ?? "chrome";

const MARCAS = ["reebok", "joybees", "tommy", "calvin"];
const ANCHOS = [
  { w: 390, h: 844, nota: "iPhone" },
  { w: 834, h: 1194, nota: "iPad vertical" },
];

// ── Sonda: tocables por debajo de 44 px ──────────────────────────────────────
const SONDA_TOCABLES = `(() => {
  const seVe = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") return false;
    return true;
  };
  const sel = "button, a[href], input:not([type=hidden]), select, textarea, [role=button]";
  const chicos = [];
  for (const el of document.querySelectorAll(sel)) {
    if (!seVe(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 44 && r.height >= 44) continue;
    chicos.push({
      tag: el.tagName.toLowerCase(),
      texto: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      clase: (el.className && String(el.className).slice(0, 90)) || "",
    });
  }
  return chicos;
})()`;

// ── Sonda: ancho de la tarjeta de producto ───────────────────────────────────
const SONDA_TARJETA = `(() => {
  // La tarjeta es la que envuelve al botón "Agregar"/"Pre-ordenar": subimos
  // hasta el hijo directo de la grilla (grid-cols-2).
  const btn = [...document.querySelectorAll("button")]
    .find(b => /^(Agregar|Pre-ordenar)$/.test((b.textContent || "").trim()));
  if (!btn) return null;
  let el = btn;
  while (el && el.parentElement) {
    const p = getComputedStyle(el.parentElement);
    if (p.display === "grid") break;
    el = el.parentElement;
  }
  const r = el.getBoundingClientRect();
  return {
    ancho: Math.round(r.width * 10) / 10,
    alto: Math.round(r.height * 10) / 10,
    botonAlto: Math.round(btn.getBoundingClientRect().height * 10) / 10,
  };
})()`;

// ── Sonda: barra del carrito vs espacio reservado ────────────────────────────
const SONDA_BARRA = `(() => {
  const barra = document.querySelector("div.fixed.bottom-0.left-0.right-0");
  if (!barra) return null;
  const rb = barra.getBoundingClientRect();
  // El contenedor del grid es el que lleva el pb-*.
  const grid = [...document.querySelectorAll("div")]
    .find(d => getComputedStyle(d).display === "grid" && d.querySelector("button"));
  const cont = grid ? grid.closest("div[class*='pb-'], div[style*='padding-bottom']") : null;
  const reservado = cont ? parseFloat(getComputedStyle(cont).paddingBottom) : null;
  // ¿El último "Agregar"/control de cantidad queda debajo de la barra?
  const botones = [...document.querySelectorAll("button")]
    .filter(b => /^(Agregar|Pre-ordenar|\\+)$/.test((b.textContent || "").trim()));
  const ultimo = botones[botones.length - 1];
  let tapado = null;
  if (ultimo) {
    ultimo.scrollIntoView({ block: "end" });
    const r = ultimo.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const enPunto = document.elementFromPoint(cx, cy);
    tapado = !(enPunto === ultimo || ultimo.contains(enPunto));
  }
  // El botón de subir (↑) también vive pegado abajo.
  const subir = [...document.querySelectorAll("button")]
    .find(b => (b.textContent || "").trim() === "\\u2191");
  let subirTapado = null;
  if (subir) {
    const r = subir.getBoundingClientRect();
    subirTapado = r.bottom > window.innerHeight - rb.height;
  }
  return {
    altoBarra: Math.round(rb.height * 10) / 10,
    reservado: reservado == null ? null : Math.round(reservado * 10) / 10,
    ultimoBotonTapado: tapado,
    subirTapado,
  };
})()`;

// ── Sonda: ¿el número del carrito se puede teclear? ──────────────────────────
const SONDA_TECLEAR = `(() => {
  const num = [...document.querySelectorAll("button")]
    .find(b => /^\\d+\\s*(bulto|bultos)$/.test((b.textContent || "").replace(/\\s+/g, " ").trim()));
  if (!num) return { hayNumero: false };
  num.click();
  const input = document.querySelector('input[type="number"]');
  const abierto = !!input;
  // Cerrar si se abrió (Escape lo cierra; si no, clic en Cancelar).
  if (abierto) {
    const cancelar = [...document.querySelectorAll("button")].find(b => (b.textContent || "").trim() === "Cancelar");
    if (cancelar) cancelar.click();
  }
  return { hayNumero: true, seTeclea: abierto };
})()`;

async function esperarGrid(page) {
  // El grid no está hasta que aparece el primer «Agregar»: en dev la lectura
  // del catálogo tarda, y un conteo de botones «estable» en 2 mide el
  // esqueleto. Se espera al botón, no al reloj.
  await page.waitForFunction(
    `[...document.querySelectorAll("button")].some(b => /^(Agregar|Pre-ordenar)$/.test((b.textContent || "").trim()))`,
    null,
    { timeout: 180000 },
  ).catch(() => { /* si no llega, se mide igual y se ve en el reporte */ });
  await page.waitForTimeout(1200);
}

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch({ channel: CANAL });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{
    name: "cxc_session", value: COOKIE, url: BASE,
  }]);
  await ctx.addInitScript(() => {
    // @ts-ignore
    delete Navigator.prototype.serviceWorker;
    try {
      sessionStorage.setItem("cxc_role", "admin");
      // 🩸 `CatalogoAuthGuard` mira `fg_modules`, NO el rol: sin esto la
      // pantalla se va a `/` y se mide el login.
      sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
    } catch { /* */ }
    // El portapapeles no existe en headless: se anota lo que se habría copiado.
    // @ts-ignore
    window.__copiado = null;
    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        // @ts-ignore
        value: { writeText: (t) => { window.__copiado = t; return Promise.resolve(); } },
      });
    } catch { /* */ }
  });

  const out = { etapa: ETAPA, base: BASE, cuando: new Date().toISOString(), conteos: {}, pantallas: [] };

  // ── 1.1 · conteos: lo que existe vs lo vendible ────────────────────────────
  const page = await ctx.newPage();
  // Hay que estar EN el origen antes de hacer fetch relativo: en about:blank
  // el fetch a localhost falla por origen, no por la ruta.
  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  for (const marca of MARCAS) {
    const r = await page.evaluate(async ([base, m]) => {
      const j = async (u) => { const r = await fetch(base + u); return r.ok ? r.json() : null; };
      const prods = await j(`/api/catalogo/${m}/products?active=true`);
      const inv = m === "reebok" ? await j(`/api/catalogo/${m}/inventory`) : null;
      if (!Array.isArray(prods)) return { total: null };
      const stockMap = {};
      for (const i of inv || []) stockMap[i.product_id] = (stockMap[i.product_id] || 0) + i.quantity;
      const disp = (p, fb) => {
        if (typeof p.disponibilidad === "number") return Math.max(0, p.disponibilidad);
        if (typeof p.existencia === "number") return Math.max(0, p.existencia);
        if (typeof p.stock === "number") return Math.max(0, p.stock);
        if (typeof fb === "number") return Math.max(0, fb);
        return 0;
      };
      const vendibles = prods.filter((p) =>
        disp(p, stockMap[p.id]) > 0 || p.is_regalia || p.badge === "proximamente");
      return { total: prods.length, vendibles: vendibles.length };
    }, [BASE, marca]);
    out.conteos[marca] = r;
  }

  // El texto que la TARJETA del hub dice hoy.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/catalogos/marcas`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  out.hub = await page.evaluate(`(() => {
    const t = [];
    for (const h2 of document.querySelectorAll("h2")) {
      const card = h2.closest("div.relative");
      t.push({ marca: h2.textContent.trim(), texto: (card ? card.textContent : "").replace(/\\s+/g, " ").slice(0, 120) });
    }
    return t;
  })()`);
  out.hubBotones = await page.evaluate(`[...document.querySelectorAll("a, button")].map(a => a.textContent.trim()).filter(Boolean)`);

  // 4.3 · ¿de qué ancho es el contenedor del hub y cómo caen las 4 tarjetas?
  out.hubAnchos = [];
  for (const w of [390, 834, 1024, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(700);
    out.hubAnchos.push({
      w,
      ...(await page.evaluate(`(() => {
        const h2 = document.querySelector("h2");
        if (!h2) return null;
        const card = h2.closest("div.relative.overflow-hidden");
        const grid = card ? card.parentElement : null;
        const cont = grid ? grid.parentElement : null;
        const r = card.getBoundingClientRect();
        const cr = cont ? cont.getBoundingClientRect() : null;
        return {
          tarjeta: Math.round(r.width),
          contenedor: cr ? Math.round(cr.width) : null,
          columnas: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : null,
          arrastre: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      })()`)),
    });
  }
  out.hubChicos = await page.evaluate(SONDA_TOCABLES);
  await page.close();

  // ── 2.1 · 2.2 · 3.1 — pantalla por pantalla ───────────────────────────────
  const RUTAS = [];
  for (const m of MARCAS) {
    RUTAS.push({ nombre: `catálogo con sesión · ${m}`, url: `/catalogo/${m}`, tipo: "vendedor" });
    RUTAS.push({ nombre: `catálogo público · ${m}`, url: `/catalogo-publico/${m}`, tipo: "publico" });
  }

  for (const ruta of RUTAS) {
    for (const a of ANCHOS) {
      const p = await ctx.newPage();
      await p.setViewportSize({ width: a.w, height: a.h });
      try {
        await p.goto(BASE + ruta.url, { waitUntil: "domcontentloaded", timeout: 240000 });
        await esperarGrid(p);

        const tarjeta = await p.evaluate(SONDA_TARJETA);
        const chicosSinCarrito = await p.evaluate(SONDA_TOCABLES);

        // Agregar el primer producto para que aparezcan la barra y el ±.
        const agregar = await p.$$("button");
        for (const b of agregar) {
          const txt = (await b.textContent() || "").trim();
          if (txt === "Agregar" || txt === "Pre-ordenar") { await b.click(); break; }
        }
        await p.waitForTimeout(900);
        if (ruta.tipo === "publico") {
          const inp = await p.$("#catalogo-cliente-nombre");
          if (inp) await inp.fill("Medicion");
          await p.waitForTimeout(400);
        }

        // 4.1 · qué dirección copia «Compartir › Copiar link público».
        let copiado = null;
        if (ruta.tipo === "vendedor") {
          copiado = await p.evaluate(`(() => {
            const btns = [...document.querySelectorAll("button")];
            const compartir = btns.find(b => b.querySelector("svg circle[cx='18'][cy='5']"));
            if (!compartir) return "sin-boton-compartir";
            compartir.click();
            const copiar = [...document.querySelectorAll("button")]
              .find(b => /Copiar link/i.test(b.textContent || ""));
            if (!copiar) return "sin-opcion-copiar";
            copiar.click();
            return window.__copiado;
          })()`);
        }
        const pdfPublico = ruta.tipo === "publico"
          ? await p.evaluate(`[...document.querySelectorAll("button")].some(b => /PDF/i.test(b.textContent || ""))`)
          : null;

        const barra = await p.evaluate(SONDA_BARRA);
        const teclear = await p.evaluate(SONDA_TECLEAR);
        await p.waitForTimeout(300);
        const chicosConCarrito = await p.evaluate(SONDA_TOCABLES);

        out.pantallas.push({
          ...ruta, ancho: a.w, nota: a.nota, tarjeta, barra, teclear, copiado, pdfPublico,
          chicos: chicosConCarrito, chicosSinCarrito: chicosSinCarrito.length,
        });
        console.log(
          `${ruta.nombre} @${a.w} · tarjeta ${tarjeta ? tarjeta.ancho : "?"}px · ` +
          `barra ${barra ? barra.altoBarra : "?"} vs reservado ${barra ? barra.reservado : "?"} · ` +
          `tapado=${barra ? barra.ultimoBotonTapado : "?"} · teclea=${teclear.seTeclea} · ` +
          `chicos=${chicosConCarrito.length}` + (copiado ? ` · copia=${copiado}` : "") +
          (pdfPublico === null ? "" : ` · pdfPublico=${pdfPublico}`),
        );
      } catch (e) {
        out.pantallas.push({ ...ruta, ancho: a.w, error: String(e).slice(0, 200) });
        console.log(`${ruta.nombre} @${a.w} · ERROR ${String(e).slice(0, 120)}`);
      }
      await p.close();
    }
  }

  // Total de tocables chicos, sin repetir por ancho.
  out.totalChicos = out.pantallas.reduce((s, x) => s + (x.chicos ? x.chicos.length : 0), 0);
  const dest = path.join(SALIDA, `${ETAPA}.json`);
  writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log(`\n→ ${dest}`);
  console.log(`conteos: ${JSON.stringify(out.conteos)}`);
  console.log(`tocables < 44 px (suma de pantallas × anchos): ${out.totalChicos}`);
  await browser.close();
}

main();
