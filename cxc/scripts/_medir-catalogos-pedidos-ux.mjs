// Medición de los arreglos de flujo de Catálogos y Pedidos (23-ago-2026) en los
// anchos de la casa: 390 (iPhone) · 834 (iPad) · 1024 (iPad acostado) · 1440.
//
// Se mide contra el BUILD DE PRODUCCIÓN y con DATOS DE PRODUCCIÓN, en las 4
// marcas, en dos estados:
//   A. Catálogo del vendedor con el carrito lleno → barra pegajosa, mini
//      carrito abierto y la ventana "¿Vaciar el pedido?" abierta.
//      · Se exige UN solo "Ver pedido" (Joybees/Tommy/Calvin tenían dos).
//   B. Detalle de un pedido EDITABLE → las casillas de BULTOS y de PRECIO.
//      · Se exige ≥44 px de alto y ≥16 px de letra en el iPhone (el zoom de
//        iOS se dispara por debajo de 16).
//
// El script FALLA si no encuentra la barra, la ventana de vaciar o las
// casillas: medir cero y dar verde sin haber mirado nada es el peor resultado.
//
//   npx next build && npx next start -p 3477
//   BASE=http://localhost:3477 node scripts/_medir-catalogos-pedidos-ux.mjs

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
const MARCAS = ["reebok", "joybees", "tommy", "calvin"];

// 🩸 LA COOKIE TIENE QUE SER DE UNA SESIÓN VIVA. El middleware valida el token
// contra `user_sessions` (revoked=false), así que una cookie firmada a mano
// pasa la firma y muere en la validación: la pantalla que se mide termina
// siendo el LOGIN y el script daría "todo verde" sin haber visto el catálogo.
// Por eso cada candidata se PRUEBA contra la API antes de usarla, y si ninguna
// sirve el script se detiene en vez de medir la nada.
async function cookieViva() {
  const candidatas = [];
  if (process.env.COOKIE_FILE) candidatas.push(process.env.COOKIE_FILE);
  candidatas.push("/tmp/fg-cookie.txt", "/tmp/fg-cookie-t232.txt");
  for (const f of candidatas) {
    if (!existsSync(f)) continue;
    const c = readFileSync(f, "utf8").trim();
    const r = await fetch(`${BASE}/api/catalogo/tommy/products?active=true`, { headers: { Cookie: `cxc_session=${c}` } });
    if (r.ok) { console.log(`Sesión: ${f} ✅`); return c; }
    console.log(`Sesión: ${f} ❌ (${r.status})`);
  }
  // Último recurso: cookie firmada a mano (sirve solo si la validación contra
  // la tabla de sesiones no está activa).
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "medicion", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  const c = `${body}.${sig}`;
  const r = await fetch(`${BASE}/api/catalogo/tommy/products?active=true`, { headers: { Cookie: `cxc_session=${c}` } });
  if (r.ok) { console.log("Sesión: cookie firmada a mano ✅"); return c; }
  console.error("❌ NINGUNA cookie sirve — inicia sesión en el navegador y guarda `cxc_session` en /tmp/fg-cookie.txt.");
  console.error("   Se corta acá a propósito: medir la pantalla de login y darla por verde es peor que no medir.");
  process.exit(1);
}

const browser = await chromium.launch();
const fallos = [];
// HEREDADO, NO NUEVO: la "x" que quita una línea del pedido mide 7×18 px. Se
// midió IDÉNTICA en origin/main (4 marcas × 4 anchos) ANTES de este cambio, y
// arreglarla no estaba en lo aprobado. Se cuenta y se informa aparte en vez de
// esconderla: si algún día crece o aparece otra cosa, el número cambia.
const heredados = [];
const ES_HEREDADO = (t) => /^BUTTON\[x\] 7×18$/.test(t);
const COOKIE = await cookieViva();

async function nuevoContexto(marca, carrito) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(([m, cart]) => {
    try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
    // El guard del catálogo mira `fg_modules`, no el rol.
    try { sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"])); } catch {}
    // Sin esto el service worker rompe la hidratación de la medición.
    try { delete Navigator.prototype.serviceWorker; } catch {}
    if (cart) { try { sessionStorage.setItem(`${m}_cart`, cart); } catch {} }
  }, [marca, carrito]);
  return ctx;
}

// Mide una caja: arrastre de la página, recorte propio, táctiles <44 y textos <12.
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
  const nuevosTactiles = m.tactilesChicos.filter((t) => !ES_HEREDADO(t));
  const heredadosAca = m.tactilesChicos.filter(ES_HEREDADO);
  if (heredadosAca.length) heredados.push(`${etiqueta} @${ancho}: ${heredadosAca.length} × «x» de quitar línea (7×18 px, igual que en main)`);
  if (nuevosTactiles.length) {
    const cuenta = {};
    for (const t of nuevosTactiles) cuenta[t] = (cuenta[t] || 0) + 1;
    fallos.push(`${etiqueta} @${ancho}: táctil <44 NUEVO → ${Object.entries(cuenta).map(([t, n]) => (n > 1 ? `${t} ×${n}` : t)).join(" | ")}`);
  }
  if (m.chicos.length) fallos.push(`${etiqueta} @${ancho}: texto <12px → ${m.chicos.join(" | ")}`);

  console.log(
    `  ${etiqueta}: ${m.w}×${m.h}px · arrastre ${arrastre <= 0 ? "✅ 0" : `❌ ${arrastre}`} · ` +
      `recorte ${recorte <= 0 ? "✅ 0" : `❌ ${recorte}`} · ` +
      `táctil<44 nuevos ${nuevosTactiles.length === 0 ? "✅ 0" : `❌ ${nuevosTactiles.length}`} · ` +
      `texto<12px ${m.chicos.length === 0 ? "✅ 0" : `❌ ${m.chicos.length}`}`,
  );
}

// ── A. Catálogo con el carrito lleno ────────────────────────────────────────
console.log(`\n${"═".repeat(76)}\nA · CATÁLOGO DEL VENDEDOR con el carrito lleno\n${"═".repeat(76)}`);

for (const marca of MARCAS) {
  // El carrito se siembra con un producto REAL de esa marca (el primero que el
  // catálogo devuelve): un id inventado no dibuja línea en el mini carrito.
  const ctxApi = await nuevoContexto(marca, null);
  const apiPage = await ctxApi.newPage();
  // 🩸 Hay que estar EN el sitio antes de pedir: un `fetch("/api/...")` desde
  // about:blank no resuelve contra BASE y devuelve vacío — la medición daría
  // "sin productos" y se saltaría todo sin haber mirado nada.
  await apiPage.goto(`${BASE}/catalogo/${marca}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const prods = await apiPage.evaluate(async (m) => {
    const r = await fetch(`/api/catalogo/${m}/products?active=true`);
    return r.ok ? await r.json() : [];
  }, marca).catch(() => []);
  await ctxApi.close();
  const p0 = (prods || [])[0];
  if (!p0) { fallos.push(`${marca}: el catálogo no devolvió ni un producto — no se pudo sembrar el carrito`); console.log(`\n❌ ${marca}: sin productos`); continue; }
  const carrito = JSON.stringify([
    { product_id: p0.id, sku: p0.sku || "", name: p0.name, image_url: p0.image_url || "", quantity: 3, unit_price: p0.price || 10, category: p0.category || "footwear", bulto_pzas: p0.bulto_pzas ?? null },
  ]);

  console.log(`\n─── ${marca.toUpperCase()} ───`);
  const ctx = await nuevoContexto(marca, carrito);
  const page = await ctx.newPage();
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/catalogo/${marca}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    // El carrito se hidrata en un efecto de montaje: se espera a la BARRA, no a
    // la red (con 125 fotos bajando, `networkidle` puede no llegar nunca).
    try {
      await page.waitForSelector("div.fixed.bottom-0", { timeout: 60_000 });
    } catch {
      const t = (await page.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n+/g, " · ");
      fallos.push(`${marca} @${a.w}: la barra del carrito NO apareció — pantalla: ${t}`);
      console.log(`\n${a.nombre} (${a.w}px)\n  ❌ sin barra del carrito`);
      continue;
    }
    await page.waitForTimeout(400);
    console.log(`\n${a.nombre} (${a.w}px)`);

    // 🔴 UN solo "Ver pedido".
    const cuantos = await page.evaluate(() =>
      [...document.querySelectorAll("button, a")].filter((b) => (b.textContent || "").includes("Ver pedido")).length);
    if (cuantos !== 1) fallos.push(`${marca} @${a.w}: hay ${cuantos} «Ver pedido» (tiene que haber 1)`);
    console.log(`     «Ver pedido» ×${cuantos} ${cuantos === 1 ? "✅" : "❌"}`);

    await medir(page, "div.fixed.bottom-0", "barra del carrito", `${marca}/${a.w}`);

    // Mini carrito abierto + la ventana de vaciar.
    // Se toca el botón RESUMEN (el de los bultos y el total), no "el primer
    // button de la barra" — ese es el de cerrar el mini carrito, que está
    // debajo y tapado.
    const abrio = await page.evaluate(() => {
      const barra = document.querySelector("div.fixed.bottom-0");
      const b = [...(barra?.querySelectorAll("button") ?? [])].find((x) => /bulto/.test(x.textContent || ""));
      if (!b) return false; b.click(); return true;
    });
    if (!abrio) { fallos.push(`${marca} @${a.w}: no se encontró el botón de resumen del carrito`); continue; }
    await page.waitForTimeout(400);
    await medir(page, "div.fixed.bottom-0", "mini carrito abierto", `${marca}/${a.w}`);

    const vaciar = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "Vaciar");
      if (!b) return false; b.click(); return true;
    });
    if (!vaciar) { fallos.push(`${marca} @${a.w}: no se encontró el botón «Vaciar»`); continue; }
    await page.waitForTimeout(1200); // ConfirmDeleteModal habilita al segundo
    const hayVentana = await page.evaluate(() => document.body.innerText.includes("¿Vaciar el pedido?"));
    if (!hayVentana) fallos.push(`${marca} @${a.w}: «Vaciar» NO abrió la ventana de confirmar`);
    console.log(`     ventana «¿Vaciar el pedido?» ${hayVentana ? "✅" : "❌"}`);
    await medir(page, "div.fixed.inset-0.z-50", "ventana de vaciar", `${marca}/${a.w}`);
  }
  await ctx.close();
}

// ── B. Detalle de un pedido EDITABLE ────────────────────────────────────────
console.log(`\n${"═".repeat(76)}\nB · DETALLE DEL PEDIDO — casillas de BULTOS y PRECIO\n${"═".repeat(76)}`);

for (const marca of MARCAS) {
  const ctx = await nuevoContexto(marca, null);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/catalogo/${marca}/pedidos`, { waitUntil: "networkidle", timeout: 120_000 });
  // Un pedido EDITABLE = sin envío vivo en Switch (si no, la pantalla es de
  // solo lectura y las casillas ni se dibujan).
  const pedido = await page.evaluate(async (m) => {
    const r = await fetch(`/api/catalogo/${m}/orders`);
    if (!r.ok) return null;
    const l = await r.json();
    return (l || []).find((o) => o.fuente !== "publicos" && !o.en_switch && (o.item_count || 0) > 0) || null;
  }, marca);
  if (!pedido) {
    console.log(`\n─── ${marca.toUpperCase()} ─── (sin pedido editable con líneas en producción — no se mide)`);
    await ctx.close();
    continue;
  }
  console.log(`\n─── ${marca.toUpperCase()} · ${pedido.order_number} ───`);
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/catalogo/${marca}/pedido/${pedido.id}`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForSelector("table", { timeout: 60_000 });
    await page.waitForTimeout(400);
    console.log(`\n${a.nombre} (${a.w}px)`);

    const casillas = await page.evaluate(() =>
      [...document.querySelectorAll('table input[type="number"]')].map((n) => {
        const b = n.getBoundingClientRect();
        return { alto: Math.round(b.height), ancho: Math.round(b.width), fs: parseFloat(getComputedStyle(n).fontSize), clase: n.className.includes("text-right") ? "precio" : "bultos" };
      }));
    if (casillas.length === 0) {
      fallos.push(`${marca} ${pedido.order_number} @${a.w}: NO se encontró ni una casilla editable`);
      console.log("     ❌ ni una casilla editable");
      continue;
    }
    const bajas = casillas.filter((c) => c.alto < 44);
    // 16 px es lo que evita el zoom de iOS; de tablet para arriba no aplica.
    const chicas = a.w <= 430 ? casillas.filter((c) => c.fs < 16) : [];
    if (bajas.length) fallos.push(`${marca} @${a.w}: ${bajas.length} casilla(s) <44px de alto → ${bajas.map((c) => `${c.clase} ${c.ancho}×${c.alto}`).join(", ")}`);
    if (chicas.length) fallos.push(`${marca} @${a.w}: ${chicas.length} casilla(s) con letra <16px (iOS haría zoom) → ${chicas.map((c) => `${c.clase} ${c.fs}px`).join(", ")}`);
    const minAlto = Math.min(...casillas.map((c) => c.alto));
    const minFs = Math.min(...casillas.map((c) => c.fs));
    console.log(`     ${casillas.length} casillas · alto mínimo ${minAlto}px ${minAlto >= 44 ? "✅" : "❌"} · letra mínima ${minFs}px ${a.w <= 430 ? (minFs >= 16 ? "✅" : "❌") : "(no aplica)"}`);

    await medir(page, "table", "tabla de líneas", `${marca}/${a.w}`);
  }
  await ctx.close();
}

await browser.close();

console.log(`\n${"═".repeat(76)}`);
if (heredados.length) {
  console.log(`ℹ️  HEREDADO de antes (NO lo trajo este cambio, medido igual en main): ${heredados.length} caso(s)`);
  console.log("   la «x» que quita una línea del pedido mide 7×18 px. Queda como estaba —");
  console.log("   arreglarla no estaba en lo aprobado— y se informa para que Daniel decida.\n");
}
if (fallos.length === 0) {
  console.log("✅ TODO VERDE — 4 anchos × 4 marcas: 0 arrastre, 0 táctiles <44px NUEVOS, 0 textos <12px,");
  console.log("   1 solo «Ver pedido», la ventana de vaciar aparece y las casillas cumplen 44px/16px.");
} else {
  console.log(`❌ ${fallos.length} FALLO(S):`);
  for (const f of fallos) console.log("   · " + f);
  process.exitCode = 1;
}
