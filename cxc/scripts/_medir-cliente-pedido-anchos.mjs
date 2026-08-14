// Medición de "el cliente del pedido" en los anchos de la casa:
// 390 (iPhone) · 834 (iPad) · 1024 (iPad acostado) · 1440 (escritorio).
//
// CINCO estados, todos con DATOS DE PRODUCCIÓN y el build de producción:
//   1. Checkout del catálogo SIN cliente elegido (el arranque nuevo).
//   2. El mismo con el selector abierto (la lista + la opción de mostrador).
//   3. Detalle de un pedido INTERNO sin cliente (TOM-005) — botón apagado.
//   4. Detalle de un pedido INTERNO con cliente (TOM-002) — el caso normal.
//   5. Detalle de un pedido del LINK (PED-022) — conserva su campo de nombre.
//
// El script FALLA si no encuentra la caja del cliente, el aviso de lo que
// falta, el botón de enviar o el campo de nombre del pedido del link: medir
// cero y dar verde sin haber mirado nada es el peor resultado posible.
//
//   npx next start -p 3477
//   BASE=http://localhost:3477 node scripts/_medir-cliente-pedido-anchos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3477";
const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

// Pedidos REALES de producción (medidos el 14-ago-2026).
const TOM_SIN_CLIENTE = "c68f1479-adb0-4863-b74e-1177df23cac2"; // TOM-005, cliente null
const TOM_CON_CLIENTE = "f5568053-5d56-4d9b-91dd-0d7d99b4342c"; // TOM-002, cliente 1
const PED_DEL_LINK = "35c81d33-f77c-4f85-bb08-599035b2cc23";    // PED-022, short_id 3singskc

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

async function medir(page, sel, etiqueta, ancho) {
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
        // Un control chico DENTRO de una etiqueta de 44px cumple la regla.
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
    return;
  }
  const arrastre = m.docScrollW - m.innerW;
  const recorte = m.scrollW - m.clientW;
  if (arrastre > 0) fallos.push(`${etiqueta} @${ancho}: arrastre ${arrastre}px`);
  if (recorte > 0) fallos.push(`${etiqueta} @${ancho}: recorte ${recorte}px`);
  if (m.desbordes.length) fallos.push(`${etiqueta} @${ancho}: hijos fuera → ${m.desbordes.join(" | ")}`);
  if (m.tactilesChicos.length) {
    const cuenta = {};
    for (const t of m.tactilesChicos) cuenta[t] = (cuenta[t] || 0) + 1;
    const resumen = Object.entries(cuenta).map(([t, n]) => (n > 1 ? `${t} ×${n}` : t)).join(" | ");
    fallos.push(`${etiqueta} @${ancho}: táctil <44 → ${resumen}`);
  }
  if (m.chicos.length) fallos.push(`${etiqueta} @${ancho}: texto <12px → ${m.chicos.join(" | ")}`);

  console.log(
    `  ${etiqueta}: ${m.w}×${m.h}px · arrastre ${arrastre <= 0 ? "✅ 0" : `❌ ${arrastre}`} · ` +
      `recorte ${recorte <= 0 ? "✅ 0" : `❌ ${recorte}`} · ` +
      `táctil<44 ${m.tactilesChicos.length === 0 ? "✅ 0" : `❌ ${m.tactilesChicos.length}`} · ` +
      `texto<12px ${m.chicos.length === 0 ? "✅ 0" : `❌ ${m.chicos.length}`}`,
  );
}

async function nuevoContexto() {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "cxc_session", value: cookieDeSesion(), url: BASE }]);
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
    // 🩸 El guard del catálogo NO mira el rol: mira `fg_modules`. Sin esto la
    // pantalla redirige a "/" y la medición se queda esperando un selector que
    // no va a existir — verde imposible, pero una hora perdida.
    try { sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"])); } catch {}
    // ⚠️ Sin esto el service worker rompe la hidratación de la medición.
    try { delete Navigator.prototype.serviceWorker; } catch {}
    // Carrito de la SESIÓN de la pestaña — el checkout no existe sin él.
    try {
      sessionStorage.setItem("tommy_cart", JSON.stringify([{
        product_id: "medicion-1", sku: "TH-MEDICION-0001", name: "Sandalia de medición con nombre largo",
        image_url: "", quantity: 3, unit_price: 24.5, category: "footwear", bulto_pzas: 12,
      }]));
    } catch {}
  });
  return ctx;
}

// ── 1 y 2: el checkout ───────────────────────────────────────────────────────
for (const abierto of [false, true]) {
  console.log(`\n${"═".repeat(72)}\nCHECKOUT ${abierto ? "con el selector ABIERTO" : "recién abierto (sin cliente)"}\n${"═".repeat(72)}`);
  const ctx = await nuevoContexto();
  const page = await ctx.newPage();
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/catalogo/tommy/checkout`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForSelector('[data-medir="cliente-checkout"]', { timeout: 60_000 });
    if (abierto) {
      await page.click('[data-medir="cliente-checkout"] button');
      await page.waitForTimeout(900); // el selector debounce 300ms + red
    }
    await page.waitForTimeout(300);
    console.log(`\n${a.nombre} (${a.w}px)`);

    const t = await page.evaluate(() => document.body.innerText);
    if (!abierto) {
      if (!t.includes("Elige el cliente")) fallos.push(`checkout @${a.w}: NO dice "Elige el cliente"`);
      if (!t.includes("Falta: elegir el cliente")) fallos.push(`checkout @${a.w}: NO dice qué falta`);
      const apagado = await page.evaluate(() =>
        [...document.querySelectorAll("button")].find((b) => /Enviar a Switch/.test(b.textContent))?.disabled);
      if (apagado !== true) fallos.push(`checkout @${a.w}: el botón NO está apagado`);
      console.log(`     "Elige el cliente" ${t.includes("Elige el cliente") ? "✅" : "❌"} · "Falta:" ${t.includes("Falta: elegir el cliente") ? "✅" : "❌"} · botón apagado ${apagado === true ? "✅" : "❌"}`);
    } else if (!t.includes("Contado (venta de mostrador)")) {
      fallos.push(`checkout abierto @${a.w}: la opción de mostrador NO está`);
    }

    await medir(page, '[data-medir="cliente-checkout"]', "caja Cliente", a.w);
    await medir(page, "div.mx-auto.w-full.max-w-3xl", "pantalla entera", a.w);
  }
  await ctx.close();
}

// ── 3, 4 y 5: el detalle del pedido ──────────────────────────────────────────
const CASOS = [
  { nombre: "INTERNO sin cliente (TOM-005)", url: `/catalogo/tommy/pedido/${TOM_SIN_CLIENTE}`, sinCliente: true, delLink: false },
  { nombre: "INTERNO con cliente (TOM-002)", url: `/catalogo/tommy/pedido/${TOM_CON_CLIENTE}`, sinCliente: false, delLink: false },
  // ⚠️ PED-022 es HOY el ÚNICO pedido del link vivo en todo el sistema y está
  // `verificado`, o sea bajo el candado post-envío: su título ya era de solo
  // lectura ANTES de este cambio. Lo que se exige acá es que el nombre que
  // escribió la persona SIGA A LA VISTA.
  //
  // 🩸 EL PEDIDO DEL LINK **EDITABLE** NO SE PUEDE MEDIR EN EL NAVEGADOR, y se
  // dice de frente en vez de simularlo mal. El intento fue neutralizar la
  // consulta del estado del envío para ver la pantalla editable — y se
  // desarma sola: con el candado apagado el autoguardado dispara un PUT, el
  // SERVIDOR (que sí sabe que el pedido está en Switch) responde 409, la
  // pantalla recarga y el candado vuelve. Medido: en el estado REAL no sale
  // ningún PUT, ni acá ni en main. Ese caso lo cubre el candado de conducta
  // `pedido-cliente-obligatorio.test.tsx`, que renderiza el pedido del link
  // editable sin servidor de por medio.
  { nombre: "DEL LINK bajo candado de Switch (PED-022, tal cual está hoy)", url: `/catalogo/reebok/pedido/${PED_DEL_LINK}`, sinCliente: false, delLink: true, soloLectura: true },
];

for (const caso of CASOS) {
  console.log(`\n${"═".repeat(72)}\nDETALLE — ${caso.nombre}\n${"═".repeat(72)}`);
  const ctx = await nuevoContexto();
  const page = await ctx.newPage();
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}${caso.url}`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForSelector('[data-medir="cliente-detalle"]', { timeout: 60_000 });
    await page.waitForTimeout(900);
    console.log(`\n${a.nombre} (${a.w}px)`);

    const info = await page.evaluate(() => ({
      // 🩸 `innerText` NO incluye el VALOR de un <input>: el primer intento
      // acusaba al pedido del link de haber perdido "Nathalie" mientras el
      // campo lo tenía escrito. Se lee el valor aparte.
      texto: document.body.innerText + " " + [...document.querySelectorAll("input")].map((i) => i.value).join(" "),
      hayInput: !!document.querySelector('input[class*="text-xl"]'),
      hayTitulo: !!document.querySelector('[data-medir="titulo-pedido"]'),
      enviarApagado: [...document.querySelectorAll("button")].find((b) => /Enviar a Switch/.test(b.textContent))?.disabled ?? null,
    }));

    if (caso.delLink && caso.soloLectura) {
      // Bajo el candado de Switch NADIE edita, ni antes ni ahora. Lo que se
      // exige acá es que el nombre que escribió la persona SIGA A LA VISTA.
      if (info.hayInput) fallos.push(`${caso.nombre} @${a.w}: un pedido en Switch no debería ser editable`);
      if (!info.texto.includes("Nathalie")) fallos.push(`${caso.nombre} @${a.w}: se perdió el nombre "Nathalie"`);
      console.log(`     nombre a la vista ${info.texto.includes("Nathalie") ? "✅" : "❌"} · de solo lectura ${info.hayInput ? "❌" : "✅"}`);
    } else if (caso.delLink) {
      if (!info.hayInput) fallos.push(`${caso.nombre} @${a.w}: el pedido del link PERDIÓ su campo de nombre`);
      if (!info.texto.includes("Nathalie")) fallos.push(`${caso.nombre} @${a.w}: se perdió el nombre "Nathalie"`);
      console.log(`     campo de nombre a mano ${info.hayInput ? "✅ está" : "❌ SE PERDIÓ"} · dice "Nathalie" ${info.texto.includes("Nathalie") ? "✅" : "❌"}`);
    } else {
      if (info.hayInput) fallos.push(`${caso.nombre} @${a.w}: quedó un campo de texto libre en un pedido interno`);
      if (!info.hayTitulo) fallos.push(`${caso.nombre} @${a.w}: no se encontró el título del pedido`);
      console.log(`     sin texto libre ${info.hayInput ? "❌" : "✅"} · título ${info.hayTitulo ? "✅" : "❌"}`);
    }

    if (caso.sinCliente) {
      if (!info.texto.includes("Elige el cliente")) fallos.push(`${caso.nombre} @${a.w}: NO dice "Elige el cliente"`);
      if (!info.texto.includes("Falta: elegir el cliente")) fallos.push(`${caso.nombre} @${a.w}: NO dice qué falta`);
      if (info.enviarApagado !== true) fallos.push(`${caso.nombre} @${a.w}: el botón NO está apagado`);
      console.log(`     "Elige el cliente" ${info.texto.includes("Elige el cliente") ? "✅" : "❌"} · botón apagado ${info.enviarApagado === true ? "✅" : "❌"}`);
    }

    await medir(page, '[data-medir="cliente-detalle"]', "caja Cliente", a.w);
    await medir(page, "div.max-w-4xl.mx-auto", "pantalla entera", a.w);
  }
  await ctx.close();
}

await browser.close();

console.log(`\n${"═".repeat(72)}`);
if (fallos.length === 0) {
  console.log("🟢 390 · 834 · 1024 · 1440 → 0 arrastre · 0 recorte · 0 táctil <44px · 0 texto <12px");
} else {
  console.log(`🔴 ${fallos.length} hallazgos:`);
  for (const f of fallos) console.log(`   · ${f}`);
}
process.exit(fallos.length === 0 ? 0 : 1);
