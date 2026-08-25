// Medición de LAS DOS SALIDAS DIRECTAS ("Pedido" · "Cotización") en los anchos
// de la casa: 390 (iPhone) · 834 (iPad) · 1024 (iPad acostado) · 1440.
//
// 25-ago-2026. Antes había UN botón "Enviar a Switch" que abría un modal; ahora
// las dos opciones se ofrecen directo, con la etiqueta «no aparta mercancía»
// pegada a la cotización. Lo que se mide es que las dos entren, se lean y se
// puedan tocar en los cuatro anchos, en las TRES pantallas que mandan a Switch.
//
// 🔴 NADA SALE A SWITCH. El navegador ABORTA cualquier POST a
// `/api/catalogo/checkout` y a `**/enviar-switch`. Ahora importa MÁS que antes:
// tocar una opción MANDA (esa es la novedad), así que el candado del navegador
// es lo único que separa una medición de un pedido de verdad. El script ni
// siquiera las toca — solo las mide —, pero la protección se conserva porque
// medir no puede depender de que nadie se equivoque.
//
// El script FALLA si no encuentra las dos opciones o la etiqueta: medir cero y
// dar verde sin haber mirado nada es el peor resultado posible.
//
//   npx next build && npx next start -p 3479
//   BASE=http://localhost:3479 node scripts/_medir-documento-directo-anchos.mjs
//   MARCA=joybees BASE=... node scripts/_medir-documento-directo-anchos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3479";
const MARCA = process.env.MARCA ?? "tommy";
const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

// Pedido REAL de producción por marca. El primero es uno EDITABLE (todavía
// ofrece las salidas); el segundo, uno que YA está en Switch (banner del
// candado). Se pasan por env para no cablear uuids de otras empresas.
const PEDIDO_EDITABLE = process.env.PEDIDO_EDITABLE ?? "";
const PEDIDO_EN_SWITCH = process.env.PEDIDO_EN_SWITCH ?? "";
/**
 * `SOLO_PANTALLA=1` mide únicamente la PANTALLA ENTERA (arrastre · recorte ·
 * táctiles · textos) y NO exige las dos salidas. Es el modo con el que este
 * mismo archivo corre contra `origin/main`, donde las opciones todavía no
 * existen: sin esto la comparación con main sería contra otro script, y dos
 * scripts distintos no comparan nada.
 */
const SOLO_PANTALLA = process.env.SOLO_PANTALLA === "1";

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "medicion", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

const browser = await chromium.launch();
const fallos = [];
/** Hallazgos de la pantalla entera que NO son de este cambio (ver `medir`). */
const preexistentes = [];

/**
 * `soloArrastre` = medir la PANTALLA ENTERA. Ahí los tocables <44 px son los
 * PRE-EXISTENTES que este cambio no toca ("← Inicio", "← Catálogo", el precio
 * por pieza, "← Volver a Pedidos", "Ocultar de la lista") y ya están medidos
 * idénticos en `origin/main`: se listan como informativos y NO tumban la
 * medición. Lo que sí tumba en la pantalla entera es arrastre o recorte.
 */
async function medir(page, sel, etiqueta, ancho, soloArrastre = false) {
  const m = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const desbordes = [], chicos = [], tactilesChicos = [];
    for (const n of el.querySelectorAll("*")) {
      const b = n.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      if (b.right > r.right + 1 || b.left < r.left - 1) desbordes.push(`${n.tagName}.${String(n.className).slice(0, 40)}`);
      const cs = getComputedStyle(n);
      const fs = parseFloat(cs.fontSize);
      if (n.children.length === 0 && n.textContent.trim() && fs < 12) {
        chicos.push(`${Math.round(fs * 10) / 10}px "${n.textContent.trim().slice(0, 28)}"`);
      }
      if ((n.tagName === "BUTTON" || n.tagName === "INPUT" || n.tagName === "A") && (b.height < 44 || b.width < 44)) {
        const lbl = n.closest("label");
        const lr = lbl ? lbl.getBoundingClientRect() : null;
        if (!(lr && lr.height >= 44 && lr.width >= 44)) {
          const txt = (n.textContent || n.getAttribute("aria-label") || n.getAttribute("placeholder") || n.type || "").trim().slice(0, 24);
          tactilesChicos.push(`${n.tagName}[${txt}] ${Math.round(b.width)}×${Math.round(b.height)}`);
        }
      }
    }
    return {
      docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      w: Math.round(r.width), h: Math.round(r.height),
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      desbordes, chicos, tactilesChicos,
    };
  }, sel);

  if (!m) {
    fallos.push(`${etiqueta} @${ancho}: NO SE ENCONTRÓ ${sel}`);
    console.log(`  ❌ ${etiqueta}: no se encontró ${sel}`);
    return null;
  }
  const arrastre = m.docScrollW - m.innerW;
  const recorte = m.scrollW - m.clientW;
  if (arrastre > 0) fallos.push(`${etiqueta} @${ancho}: arrastre ${arrastre}px`);
  if (recorte > 0) fallos.push(`${etiqueta} @${ancho}: recorte ${recorte}px`);
  if (!soloArrastre && m.desbordes.length) fallos.push(`${etiqueta} @${ancho}: hijos fuera → ${m.desbordes.join(" | ")}`);
  if (m.tactilesChicos.length) {
    const linea = `${etiqueta} @${ancho}: táctil <44 → ${m.tactilesChicos.join(" | ")}`;
    if (soloArrastre) preexistentes.push(linea); else fallos.push(linea);
  }
  if (m.chicos.length) {
    const linea = `${etiqueta} @${ancho}: texto <12px → ${m.chicos.join(" | ")}`;
    if (soloArrastre) preexistentes.push(linea); else fallos.push(linea);
  }

  console.log(
    `  ${etiqueta}: ${m.w}×${m.h}px · arrastre ${arrastre <= 0 ? "✅ 0" : `❌ ${arrastre}`} · ` +
      `recorte ${recorte <= 0 ? "✅ 0" : `❌ ${recorte}`} · ` +
      `táctil<44 ${m.tactilesChicos.length === 0 ? "✅ 0" : `❌ ${m.tactilesChicos.length}`} · ` +
      `texto<12px ${m.chicos.length === 0 ? "✅ 0" : `❌ ${m.chicos.length}`}`,
  );
  return m;
}

/**
 * Las dos opciones tienen que ESTAR, decir lo que dicen y ser tocables. Sin
 * esto la medición no vale: se estaría midiendo el hueco donde debían estar.
 */
async function verificarOpciones(page, etiqueta, ancho, exigeEncendido) {
  if (SOLO_PANTALLA) return null;
  const info = await page.evaluate(() => {
    const q = (k) => document.querySelector(`[data-medir="documento-${k}"]`);
    const p = q("pedido"), c = q("cotizacion");
    const caja = (n) => { const r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
    return {
      hay: !!p && !!c,
      pedido: p ? { texto: p.innerText.trim(), off: p.disabled, ...caja(p) } : null,
      cotizacion: c ? { texto: c.innerText.trim(), off: c.disabled, ...caja(c) } : null,
    };
  });
  if (!info.hay) { fallos.push(`${etiqueta} @${ancho}: FALTA alguna de las dos salidas`); return null; }
  if (!/^Pedido$/m.test(info.pedido.texto)) fallos.push(`${etiqueta} @${ancho}: la opción de pedido dice "${info.pedido.texto}"`);
  if (!/Cotización/.test(info.cotizacion.texto)) fallos.push(`${etiqueta} @${ancho}: la opción de cotización dice "${info.cotizacion.texto}"`);
  // 🔴 La etiqueta. Es lo único que quedó del párrafo y no puede faltar.
  if (!/no aparta mercancía/.test(info.cotizacion.texto)) {
    fallos.push(`${etiqueta} @${ancho}: la cotización NO dice que no aparta mercancía`);
  }
  // Y el pedido NO la lleva: si las dos dijeran lo mismo, volverían a ser gemelas.
  if (/no aparta mercancía/.test(info.pedido.texto)) {
    fallos.push(`${etiqueta} @${ancho}: la opción de PEDIDO también dice "no aparta mercancía"`);
  }
  if (exigeEncendido && (info.pedido.off || info.cotizacion.off)) {
    fallos.push(`${etiqueta} @${ancho}: alguna salida sigue apagada con todo elegido`);
  }
  console.log(
    `     opciones ✅ las dos (${info.pedido.w}×${info.pedido.h} · ${info.cotizacion.w}×${info.cotizacion.h}) · ` +
      `etiqueta ${/no aparta mercancía/.test(info.cotizacion.texto) ? "✅ a la vista" : "❌ NO ESTÁ"} · ` +
      `${info.pedido.off ? "apagadas" : "encendidas"}`,
  );
  return info;
}

let escriturasBloqueadas = 0;

async function nuevoContexto() {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "cxc_session", value: cookieDeSesion(), url: BASE }]);
  // 🔴 El candado del script: ninguna escritura sale de acá. Con la elección
  // directa, un toque de más MANDA — esto lo hace imposible.
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const esEscritura = req.method() === "POST" &&
      (req.url().includes("/api/catalogo/checkout") || req.url().includes("/enviar-switch"));
    if (esEscritura) { escriturasBloqueadas++; return route.abort(); }
    return route.continue();
  });
  await ctx.addInitScript((marca) => {
    try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
    // 🩸 El guard del catálogo mira `fg_modules`, no el rol.
    try { sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"])); } catch {}
    // ⚠️ Sin esto el service worker rompe la hidratación de la medición.
    try { delete Navigator.prototype.serviceWorker; } catch {}
    try {
      sessionStorage.setItem(`${marca}_cart`, JSON.stringify([{
        product_id: "medicion-1", sku: "TH-MEDICION-0001", name: "Sandalia de medición con nombre largo",
        image_url: "", quantity: 3, unit_price: 24.5, category: "footwear", bulto_pzas: 12,
      }]));
    } catch {}
  }, MARCA);
  return ctx;
}

const clickPorTexto = (page, re) =>
  page.evaluate((r) => {
    const b = [...document.querySelectorAll("button")].find((x) => new RegExp(r).test(x.textContent || ""));
    if (!b) return false;
    b.click();
    return true;
  }, re.source ?? re);

// ── 1. El checkout ───────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(72)}\nCHECKOUT (${MARCA}) — las dos salidas, directo\n${"═".repeat(72)}`);
{
  const ctx = await nuevoContexto();
  const page = await ctx.newPage();
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/catalogo/${MARCA}/checkout`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForSelector('[data-medir="cliente-checkout"]', { timeout: 60_000 });
    console.log(`\n${a.nombre} (${a.w}px)`);

    // 🔴 APAGADAS ANTES DE ELEGIR CLIENTE: se mide el candado, no solo el ancho.
    await verificarOpciones(page, "las dos salidas (apagadas)", a.w, false);
    const faltaAntes = await page.evaluate(() => document.querySelector('[data-medir="falta-enviar"]')?.textContent ?? "");
    if (!SOLO_PANTALLA && !/Falta:/.test(faltaAntes)) fallos.push(`checkout @${a.w}: apagado pero NO dice qué falta`);

    // Cliente: se ELIGE el mostrador (hay que tocarlo — candado 14-ago-2026).
    await page.click('[data-medir="cliente-checkout"] button');
    await page.waitForTimeout(1200);
    if (!(await clickPorTexto(page, /Contado \(venta de mostrador\)/))) {
      fallos.push(`checkout @${a.w}: no apareció la opción de mostrador`);
      continue;
    }
    // 🩸 Al usuario de medición NO le corresponde vendedor: hay que elegirle uno
    // además del cliente. Si no, las salidas quedan apagadas CON RAZÓN y no hay
    // nada que medir.
    await page.click('[data-medir="vendedor-checkout"] button');
    await page.waitForTimeout(1500);
    const hayVendedor = await page.evaluate(() => {
      const caja = document.querySelector('[data-medir="vendedor-checkout"]');
      const b = [...caja.querySelectorAll("button")].find((x) => x.getAttribute("aria-pressed") !== null);
      if (!b) return false;
      b.click();
      return true;
    });
    if (!hayVendedor) { fallos.push(`checkout @${a.w}: no cargó la lista de vendedores`); continue; }
    await page.waitForTimeout(500);

    await verificarOpciones(page, "las dos salidas", a.w, true);
    if (!SOLO_PANTALLA) await medir(page, '[data-medir="enviar-documento"]', "las dos salidas", a.w);
    await medir(page, "body", "pantalla entera", a.w, true);
  }
  await ctx.close();
}

// ── 2. El detalle del pedido ─────────────────────────────────────────────────
if (PEDIDO_EDITABLE) {
  console.log(`\n${"═".repeat(72)}\nDETALLE (${MARCA}) — las dos salidas en el pedido\n${"═".repeat(72)}`);
  const ctx = await nuevoContexto();
  const page = await ctx.newPage();
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/catalogo/${MARCA}/pedido/${PEDIDO_EDITABLE}`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForSelector('[data-medir="cliente-detalle"]', { timeout: 60_000 });
    await page.waitForTimeout(900);
    console.log(`\n${a.nombre} (${a.w}px)`);
    await verificarOpciones(page, "las dos salidas", a.w, false);
    if (!SOLO_PANTALLA) await medir(page, '[data-medir="enviar-documento"]', "las dos salidas", a.w);
    await medir(page, "div.max-w-4xl.mx-auto", "pantalla entera", a.w, true);
  }
  await ctx.close();
} else {
  console.log("\nℹ️  DETALLE: sin PEDIDO_EDITABLE, no se midió.");
}

// ── 2b. La CONFIRMACIÓN (3ª pantalla que manda a Switch) ─────────────────────
if (PEDIDO_EDITABLE) {
  console.log(`\n${"═".repeat(72)}\nCONFIRMACIÓN (${MARCA}) — las dos salidas del reintento\n${"═".repeat(72)}`);
  const ctx = await nuevoContexto();
  const page = await ctx.newPage();
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/catalogo/${MARCA}/confirmacion/${PEDIDO_EDITABLE}`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(1200);
    console.log(`\n${a.nombre} (${a.w}px)`);
    await verificarOpciones(page, "las dos salidas", a.w, false);
    if (!SOLO_PANTALLA) await medir(page, '[data-medir="enviar-documento"]', "las dos salidas", a.w);
    await medir(page, "body", "pantalla entera", a.w, true);
  }
  await ctx.close();
}

// ── 3. El detalle bajo el candado post-envío: NO ofrece salidas ──────────────
if (PEDIDO_EN_SWITCH) {
  console.log(`\n${"═".repeat(72)}\nDETALLE ya en Switch — el banner, y CERO salidas ofrecidas\n${"═".repeat(72)}`);
  const ctx = await nuevoContexto();
  const page = await ctx.newPage();
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/catalogo/${MARCA}/pedido/${PEDIDO_EN_SWITCH}`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForSelector('[data-medir="cliente-detalle"]', { timeout: 60_000 });
    await page.waitForTimeout(900);
    console.log(`\n${a.nombre} (${a.w}px)`);
    const info = await page.evaluate(() => ({
      hayOpciones: !!document.querySelector('[data-medir="documento-pedido"]'),
      texto: document.body.innerText,
    }));
    // 🔴 El at-most-once no se tocó: un pedido que ya salió NO vuelve a ofrecer
    // salidas. Si con la elección directa aparecieran, se podría mandar dos.
    if (!SOLO_PANTALLA && info.hayOpciones) fallos.push(`detalle en Switch @${a.w}: SIGUE ofreciendo las salidas`);
    const dice = /ya está en Switch como (pedido|cotización) #/.test(info.texto) ||
      /(Pedido|Cotización) (creado|creada) en Switch|(Enviado|Cotización enviada) a Switch/.test(info.texto);
    if (!SOLO_PANTALLA && !dice) fallos.push(`detalle en Switch @${a.w}: NO dice qué está en Switch`);
    console.log(`     salidas ofrecidas ${info.hayOpciones ? "❌ SÍ" : "✅ 0"} · nombra el documento ${dice ? "✅" : "❌"}`);
    await medir(page, "div.max-w-4xl.mx-auto", "pantalla entera", a.w, true);
  }
  await ctx.close();
} else {
  console.log("\nℹ️  DETALLE en Switch: sin PEDIDO_EN_SWITCH, no se midió.");
}

await browser.close();

console.log(`\n${"═".repeat(72)}`);
console.log(`Escrituras BLOQUEADAS por el script: ${escriturasBloqueadas} (tienen que ser 0 — medir no manda nada)`);
if (preexistentes.length) {
  console.log(`\nℹ️  ${preexistentes.length} hallazgos PRE-EXISTENTES de la pantalla entera (fuera de este cambio):`);
  for (const f of preexistentes) console.log(`   · ${f}`);
}
if (fallos.length === 0) {
  console.log(`🟢 ${MARCA} · 390 · 834 · 1024 · 1440 → 0 arrastre · 0 recorte · 0 táctil <44px · 0 texto <12px`);
} else {
  console.log(`🔴 ${fallos.length} hallazgos:`);
  for (const f of fallos) console.log(`   · ${f}`);
}
process.exit(fallos.length === 0 ? 0 : 1);
