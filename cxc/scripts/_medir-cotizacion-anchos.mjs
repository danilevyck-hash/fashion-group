// Medición de LA ELECCIÓN "pedido o cotización" en los anchos de la casa:
// 390 (iPhone) · 834 (iPad) · 1024 (iPad acostado) · 1440 (escritorio).
//
// Qué se mide, con el build de PRODUCCIÓN y datos de producción:
//   1. El checkout del catálogo con la elección ABIERTA (el modal nuevo).
//   2. El detalle de un pedido que YA está en Switch — el renglón de estado,
//      que ahora nombra qué se creó (pedido o cotización).
//
// 🔴 NADA SALE A SWITCH. El navegador ABORTA cualquier POST a
// `/api/catalogo/checkout` y a `**/enviar-switch`: abrir la elección no manda
// nada por diseño, y esto lo hace imposible aunque el diseño cambie.
//
// El script FALLA si no encuentra el modal, sus dos opciones, la advertencia de
// que la cotización no aparta mercancía o el renglón de estado del detalle:
// medir cero y dar verde sin haber mirado nada es el peor resultado posible.
//
//   npx next build && npx next start -p 3479
//   BASE=http://localhost:3479 node scripts/_medir-cotizacion-anchos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3479";
const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

// Pedido REAL de producción que ya está en Switch (TOM-002, uno de los 15).
const TOM_EN_SWITCH = "f5568053-5d56-4d9b-91dd-0d7d99b4342c";

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
 * medición. Lo que sí tumba en la pantalla entera es arrastre o recorte —
 * "0 arrastre nuevo" es la regla.
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
      // El modal no puede pasarse de alto tampoco: si no entra, la advertencia
      // queda abajo del corte y nadie la lee.
      alto: Math.round(r.height), ventana: window.innerHeight,
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

let escriturasBloqueadas = 0;

async function nuevoContexto() {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "cxc_session", value: cookieDeSesion(), url: BASE }]);
  // 🔴 El candado del script: ninguna escritura sale de acá.
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const esEscritura = req.method() === "POST" &&
      (req.url().includes("/api/catalogo/checkout") || req.url().includes("/enviar-switch"));
    if (esEscritura) { escriturasBloqueadas++; return route.abort(); }
    return route.continue();
  });
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
    // 🩸 El guard del catálogo mira `fg_modules`, no el rol.
    try { sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"])); } catch {}
    // ⚠️ Sin esto el service worker rompe la hidratación de la medición.
    try { delete Navigator.prototype.serviceWorker; } catch {}
    try {
      sessionStorage.setItem("tommy_cart", JSON.stringify([{
        product_id: "medicion-1", sku: "TH-MEDICION-0001", name: "Sandalia de medición con nombre largo",
        image_url: "", quantity: 3, unit_price: 24.5, category: "footwear", bulto_pzas: 12,
      }]));
    } catch {}
  });
  return ctx;
}

const clickPorTexto = (page, re) =>
  page.evaluate((r) => {
    const b = [...document.querySelectorAll("button")].find((x) => new RegExp(r).test(x.textContent || ""));
    if (!b) return false;
    b.click();
    return true;
  }, re.source ?? re);

// ── 1. El checkout, con la elección abierta ──────────────────────────────────
console.log(`\n${"═".repeat(72)}\nCHECKOUT — la elección "pedido o cotización" ABIERTA\n${"═".repeat(72)}`);
{
  const ctx = await nuevoContexto();
  const page = await ctx.newPage();
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/catalogo/tommy/checkout`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForSelector('[data-medir="cliente-checkout"]', { timeout: 60_000 });
    console.log(`\n${a.nombre} (${a.w}px)`);

    // Cliente: se ELIGE el mostrador (hay que tocarlo — es el candado de
    // 14-ago-2026, y esta medición lo respeta como cualquier persona).
    await page.click('[data-medir="cliente-checkout"] button');
    await page.waitForTimeout(1200);
    if (!(await clickPorTexto(page, /Contado \(venta de mostrador\)/))) {
      fallos.push(`checkout @${a.w}: no apareció la opción de mostrador`);
      continue;
    }
    // Vendedor: al usuario de medición NO le corresponde ninguno (no está
    // mapeado), así que se elige el primero de la lista viva de Switch. Sin
    // esto el botón queda apagado con razón y no hay nada que medir.
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
    await page.waitForTimeout(400);

    const apagado = await page.evaluate(() =>
      [...document.querySelectorAll("button")].find((b) => /Enviar a Switch/.test(b.textContent))?.disabled);
    if (apagado !== false) { fallos.push(`checkout @${a.w}: el botón sigue apagado con cliente y vendedor elegidos`); continue; }

    // 🔴 El toque. Abre la ELECCIÓN; no manda nada.
    await clickPorTexto(page, /Enviar a Switch/);
    await page.waitForSelector('[data-medir="elegir-documento"]', { timeout: 15_000 }).catch(() => {});

    const info = await page.evaluate(() => {
      const m = document.querySelector('[data-medir="elegir-documento"]');
      return {
        hay: !!m,
        texto: m ? m.innerText : "",
        pedido: !!document.querySelector('[data-medir="documento-pedido"]'),
        cotizacion: !!document.querySelector('[data-medir="documento-cotizacion"]'),
      };
    });
    if (!info.hay) { fallos.push(`checkout @${a.w}: la elección NO se abrió`); continue; }
    if (!info.pedido) fallos.push(`checkout @${a.w}: falta la opción PEDIDO`);
    if (!info.cotizacion) fallos.push(`checkout @${a.w}: falta la opción COTIZACIÓN`);
    if (!/NO aparta la mercancía/.test(info.texto)) {
      fallos.push(`checkout @${a.w}: la elección NO dice que la cotización no aparta mercancía`);
    }
    console.log(
      `     opciones ${info.pedido && info.cotizacion ? "✅ las dos" : "❌"} · ` +
        `advertencia ${/NO aparta la mercancía/.test(info.texto) ? "✅ a la vista" : "❌ NO ESTÁ"}`,
    );

    const m = await medir(page, '[data-medir="elegir-documento"]', "la elección", a.w);
    if (m && m.alto > m.ventana) {
      fallos.push(`checkout @${a.w}: la elección mide ${m.alto}px de alto y la ventana ${m.ventana}px — la advertencia queda abajo del corte`);
    }
    await medir(page, "body", "pantalla entera", a.w, true);
  }
  await ctx.close();
}

// ── 2. El detalle: el renglón de estado ahora nombra QUÉ está en Switch ──────
console.log(`\n${"═".repeat(72)}\nDETALLE — el estado del envío (TOM-002, ya en Switch)\n${"═".repeat(72)}`);
{
  const ctx = await nuevoContexto();
  const page = await ctx.newPage();
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/catalogo/tommy/pedido/${TOM_EN_SWITCH}`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForSelector('[data-medir="cliente-detalle"]', { timeout: 60_000 });
    await page.waitForTimeout(900);
    console.log(`\n${a.nombre} (${a.w}px)`);

    const texto = await page.evaluate(() => document.body.innerText);
    // Un pedido viejo (sin la columna, o con documento='pedido') se sigue
    // leyendo como PEDIDO: la palabra no puede haberse perdido.
    // ⚠️ Bajo el candado post-envío la pantalla NO dibuja el renglón de estado
    // (`switchLock ? null : …`, comportamiento de siempre): lo que se lee es el
    // BANNER, y es ahí donde ahora se nombra el documento.
    const dice = /ya está en Switch como (pedido|cotización) #/.test(texto) ||
      /(Pedido|Cotización) (creado|creada) en Switch|(Enviado|Cotización enviada) a Switch/.test(texto);
    if (!dice) fallos.push(`detalle @${a.w}: NO dice qué está en Switch`);
    console.log(`     nombra el documento ${dice ? "✅" : "❌"}`);
    await medir(page, "div.max-w-4xl.mx-auto", "pantalla entera", a.w, true);
  }
  await ctx.close();
}

await browser.close();

console.log(`\n${"═".repeat(72)}`);
console.log(`Escrituras BLOQUEADAS por el script: ${escriturasBloqueadas} (tienen que ser 0 — abrir la elección no manda nada)`);
if (preexistentes.length) {
  console.log(`\nℹ️  ${preexistentes.length} hallazgos PRE-EXISTENTES de la pantalla entera (idénticos en origin/main, fuera de este cambio):`);
  for (const f of preexistentes) console.log(`   · ${f}`);
}
if (fallos.length === 0) {
  console.log("🟢 390 · 834 · 1024 · 1440 → 0 arrastre · 0 recorte · 0 táctil <44px · 0 texto <12px");
} else {
  console.log(`🔴 ${fallos.length} hallazgos:`);
  for (const f of fallos) console.log(`   · ${f}`);
}
process.exit(fallos.length === 0 ? 0 : 1);
