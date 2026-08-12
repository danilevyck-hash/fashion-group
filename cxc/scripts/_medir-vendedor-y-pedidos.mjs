// SOLO LECTURA. Mide los anchos de la casa (390 · 834 · 1024 · 1440) en las tres
// pantallas que este cambio toca, en las 4 marcas:
//
//   1. El CATÁLOGO con "Pedidos" ya mudado a la fila de "Compartir".
//   2. El CHECKOUT con el bloque "Vendedor" y su selector ABIERTO.
//   3. El DETALLE de un pedido con el bloque "Vendedor" y su ventana ABIERTA.
//
//   BASE=http://localhost:3164 node scripts/_medir-vendedor-y-pedidos.mjs
//   (opcional) PEDIDO_CALVIN=<uuid> para medir el detalle de un pedido real.
//
// 🔴 NO TOCA SWITCH NI ESCRIBE NADA. La lista de vendedores se INTERCEPTA en el
// navegador (Switch admite un solo login por empresa y este script correría en
// plena ventana de crons), y el PATCH del vendedor se bloquea: un clic de más
// no puede cambiarle el vendedor a un pedido de verdad.
//
// Reglas de lectura de la casa: recortado ≠ arrastrable (lo que vive dentro de
// un scroller declarado NO cuenta como recorte), blancos tocables ≥ 44 px,
// textos ≥ 12 px, y el BODY nunca arrastra.
//
// ⚠️ EL ARRASTRE SE MIDE DE LA PÁGINA ENTERA; los recortes, táctiles y textos
// se miden DENTRO de lo que este cambio dibuja (`data-medir=...`). Medirlos
// sobre el body entero devuelve el ruido PRE-EXISTENTE del catálogo (los 1.347
// textos de 10-11 px de las tarjetas de producto, el "← Inicio" de 34 px), que
// es idéntico en main y ahogaría lo que sí hay que mirar.

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3164";
const SALIDA = process.env.SALIDA ?? "/tmp/vendedor-pedidos";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = (process.env.ANCHOS ?? "390,834,1024,1440").split(",").map(Number);
const MARCAS = (process.env.MARCAS ?? "reebok,joybees,tommy,calvin").split(",");
// PEDIDOS="marca:uuid,marca:uuid" — pedidos REALES, solo se leen.
const PEDIDOS = (process.env.PEDIDOS ?? "").split(",").filter(Boolean).map((x) => x.split(":"));

const VENDEDORES_FALSOS = [
  { id: 7, nombre: "Ana Pérez" },
  { id: 9, nombre: "Beto Ruiz" },
  { id: 11, nombre: "Carlos Rodríguez de la Vega" }, // el nombre más largo posible
];

mkdirSync(SALIDA, { recursive: true });
const nav = await chromium.launch();
let malas = 0;

/** Lectura cruda de la pantalla: arrastre, recortes, táctiles y textos. */
const MEDIR = (raizSel) => {
  const de = document.documentElement;
  const arrastre = Math.max(0, de.scrollWidth - de.clientWidth);
  const dentroDeScroller = (e) => {
    for (let n = e.parentElement; n; n = n.parentElement) {
      const o = getComputedStyle(n).overflowX;
      if (o === "auto" || o === "scroll") return true;
    }
    return false;
  };
  const chicos = [];
  const textos = [];
  const recortados = [];
  const raiz = (raizSel && document.querySelector(raizSel)) || document.body;
  for (const e of raiz.querySelectorAll("button, a, input, select")) {
    const r = e.getBoundingClientRect();
    if (r.width > 1 && r.height > 0 && (r.height < 44 || r.width < 44)) {
      chicos.push({ t: (e.textContent || e.tagName).trim().slice(0, 34), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  for (const e of raiz.querySelectorAll("*")) {
    if (!e.childNodes.length) continue;
    const propio = [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim());
    if (propio) {
      const px = parseFloat(getComputedStyle(e).fontSize);
      if (px < 12) textos.push({ t: (e.textContent || "").trim().slice(0, 34), px: Math.round(px * 10) / 10 });
    }
    const r = e.getBoundingClientRect();
    if (r.width > 0 && e.scrollWidth - e.clientWidth > 1 && !dentroDeScroller(e)) {
      recortados.push({ t: (e.textContent || "").trim().slice(0, 34), px: e.scrollWidth - e.clientWidth });
    }
  }
  const txt = document.body.innerText;
  return {
    arrastre, chicos, textos, recortados,
    pedidos: (txt.match(/\bPedidos\b/g) || []).length,
    compartir: txt.includes("Compartir"),
    vendedor: txt.includes("Vendedor"),
  };
};

function reportar(etiqueta, ancho, m, extra = "") {
  const ok = m.arrastre === 0 && m.chicos.length === 0 && m.textos.length === 0 && m.recortados.length === 0;
  if (!ok) malas += 1;
  console.log(
    `${ok ? "🟢" : "🔴"} ${String(ancho).padStart(4)} px · ${etiqueta.padEnd(28)} · arrastre ${m.arrastre} px · ` +
      `blancos <44: ${m.chicos.length} · textos <12: ${m.textos.length} · recortados: ${m.recortados.length}${extra}`,
  );
  if (m.chicos.length) console.log("     chicos:", JSON.stringify(m.chicos.slice(0, 6)));
  if (m.textos.length) console.log("     textos:", JSON.stringify(m.textos.slice(0, 6)));
  if (m.recortados.length) console.log("     recortados:", JSON.stringify(m.recortados.slice(0, 6)));
  return ok;
}

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => { sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
    sessionStorage.setItem("fg_user_name", "Medicion");
    // Carrito sembrado en la SESIÓN (donde vive de verdad) para que el checkout
    // tenga qué dibujar. Nombre largo a propósito: es el peor caso de ancho.
    const linea = [{
      product_id: "00000000-0000-4000-8000-000000000001",
      sku: "MED-0001",
      name: "Camisa cuadros marino",
      image_url: "",
      quantity: 2,
      unit_price: 38.5,
      category: "apparel",
      bulto_pzas: 12,
    }];
    for (const k of ["reebok_cart", "joybees_cart", "tommy_cart", "calvin_cart"]) {
      sessionStorage.setItem(k, JSON.stringify(linea));
    }
  });

  const page = await ctx.newPage();
  // 🔴 Ni Switch ni escrituras: ver la cabecera.
  await page.route("**/api/admin/switch-vendedores*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ vendedores: VENDEDORES_FALSOS }) }));
  await page.route("**/vendedores-switch", (r) =>
    r.request().method() === "PATCH"
      ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, vendedorSwitchId: 9, nombre: "Beto Ruiz" }) })
      : r.continue());

  for (const marca of MARCAS) {
    // ── 1. Catálogo: "Pedidos" junto a "Compartir" ──
    await page.goto(`${BASE}/catalogo/${marca}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4500);
    const cat = await page.evaluate(MEDIR, "[data-medir='acciones-catalogo']");
    // Los dos botones tienen que estar, y a la MISMA altura (misma fila).
    const alturas = await page.evaluate(() => {
      const uno = [...document.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Pedidos");
      const dos = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Compartir");
      if (!uno || !dos) return null;
      const a = uno.getBoundingClientRect(), b = dos.getBoundingClientRect();
      return { pedidos: Math.round(a.top), compartir: Math.round(b.top), altoP: Math.round(a.height), altoC: Math.round(b.height) };
    });
    const juntos = alturas && Math.abs(alturas.pedidos - alturas.compartir) <= 2;
    if (!juntos) malas += 1;
    reportar(`catálogo ${marca}`, ancho, cat, ` · Pedidos+Compartir a la misma altura: ${juntos ? "sí" : "NO " + JSON.stringify(alturas)}`);
    await page.screenshot({ path: `${SALIDA}/catalogo-${marca}-${ancho}.png`, fullPage: false });

    // ── 2. Checkout con el selector de vendedor ABIERTO ──
    await page.goto(`${BASE}/catalogo/${marca}/checkout`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);
    const cambiar = page.locator("section", { hasText: "Vendedor" }).locator("button", { hasText: /^(Cambiar|Cerrar)$/ }).first();
    if (await cambiar.count()) {
      if ((await cambiar.innerText()).trim() === "Cambiar") await cambiar.click();
      await page.waitForTimeout(900);
      reportar(`checkout ${marca} (selector)`, ancho, await page.evaluate(MEDIR, "[data-medir='vendedor-checkout']"));
      await page.screenshot({ path: `${SALIDA}/checkout-${marca}-${ancho}.png`, fullPage: false });
    } else {
      console.log(`   ⚪ ${ancho} px · checkout ${marca}: carrito vacío, sin bloque de vendedor`);
    }
  }

  // ── 3. Detalle de pedidos REALES con la ventana de vendedor abierta ──
  for (const [marca, id] of PEDIDOS) {
    await page.goto(`${BASE}/catalogo/${marca}/pedido/${id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const bloque = page.locator('[data-medir="vendedor-detalle"]');
    if (!(await bloque.count())) {
      console.log(`   ⚪ ${ancho} px · detalle ${marca}/${id.slice(0, 8)}: sin bloque de vendedor`);
      continue;
    }
    const dice = (await bloque.innerText()).replace(/\n+/g, " · ");
    reportar(`detalle ${marca} (cerrado)`, ancho, await page.evaluate(MEDIR, "[data-medir='vendedor-detalle']"), ` · dice: ${dice}`);
    await page.screenshot({ path: `${SALIDA}/detalle-${marca}-${ancho}.png`, fullPage: false });

    const cambiar = bloque.locator("button", { hasText: "Cambiar" });
    if (await cambiar.count()) {
      await cambiar.click();
      await page.waitForTimeout(900);
      reportar(`detalle ${marca} (selector)`, ancho, await page.evaluate(MEDIR, "[data-medir='vendedor-modal']"));
      await page.screenshot({ path: `${SALIDA}/detalle-${marca}-selector-${ancho}.png`, fullPage: false });
      await page.keyboard.press("Escape");
    } else {
      console.log(`   ⚪ ${ancho} px · detalle ${marca}: sin "Cambiar" (ya está en Switch) — correcto`);
    }
  }

  await ctx.close();
}

await nav.close();
console.log(malas === 0 ? "\n🟢 TODO LIMPIO" : `\n🔴 ${malas} estado(s) con hallazgos`);
process.exit(malas === 0 ? 0 : 1);
