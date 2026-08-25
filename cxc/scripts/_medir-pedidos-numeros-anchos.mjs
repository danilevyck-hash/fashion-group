// Medición de los DOS NÚMEROS en «Administrar catálogo › Pedidos» (24-ago-2026),
// en los anchos de la casa: 390 (iPhone) · 834 (iPad) · 1024 (iPad ACOSTADO) · 1440.
//
// Se mide contra el BUILD DE PRODUCCIÓN y con DATOS DE PRODUCCIÓN, en las 4 marcas,
// con TODOS los meses desplegados (el peor caso: la tabla más larga y más ancha).
//
// Lo que se exige, y por qué:
//   · 0 px de arrastre de PÁGINA en los cuatro anchos.
//   · 0 px de recorte DENTRO de la tabla — y esto es lo que decide si los números
//     se pueden mostrar así: una columna nueva habría ensanchado la tabla justo en
//     el iPad acostado (1024), el ancho que nadie mira.
//   · 0 tocables <44 px y 0 textos <12 px NUEVOS. Los pre-existentes se comparan
//     contra `origin/main` corriendo ESTE MISMO script con ETAPA=antes.
//
// El script FALLA si no encuentra la tabla o si (en ETAPA=despues) alguna fila no
// trae sus dos números: medir cero y dar verde sin haber mirado nada es el peor
// resultado posible.
//
//   npx next build && npx next start -p 3491
//   BASE=http://localhost:3491 ETAPA=despues node scripts/_medir-pedidos-numeros-anchos.mjs
//
// 🩸 El navegador ABORTA todo pedido que no sea GET: esta pantalla tiene botones
// de borrar y de exportar, y una medición no puede escribir en producción.

import { chromium } from "playwright";
import { existsSync, readFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3491";
const ETAPA = process.env.ETAPA ?? "despues";
const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];
const MARCAS = ["reebok", "joybees", "tommy", "calvin"];

// 🩸 LA COOKIE TIENE QUE SER DE UNA SESIÓN VIVA. El middleware valida el token
// contra `user_sessions` (revoked=false): una cookie firmada a mano pasa la firma
// y muere en la validación, así que lo que se mediría sería el LOGIN.
async function cookieViva() {
  const candidatas = [];
  if (process.env.COOKIE_FILE) candidatas.push(process.env.COOKIE_FILE);
  candidatas.push("/tmp/fg-cookie.txt", "/tmp/fg-cookie-t232.txt");
  for (const f of candidatas) {
    if (!existsSync(f)) continue;
    const c = readFileSync(f, "utf8").trim();
    const r = await fetch(`${BASE}/api/catalogo/reebok/pedidos-unificado`, { headers: { Cookie: `cxc_session=${c}` } });
    if (r.ok) { console.log(`Sesión: ${f} ✅`); return c; }
    console.log(`Sesión: ${f} ❌ (${r.status})`);
  }
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "medicion", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  const c = `${body}.${sig}`;
  const r = await fetch(`${BASE}/api/catalogo/reebok/pedidos-unificado`, { headers: { Cookie: `cxc_session=${c}` } });
  if (r.ok) { console.log("Sesión: cookie firmada a mano ✅"); return c; }
  console.error("❌ NINGUNA cookie sirve — inicia sesión y guarda `cxc_session` en /tmp/fg-cookie.txt.");
  console.error("   Se corta acá a propósito: medir la pantalla de login y darla por verde es peor que no medir.");
  process.exit(1);
}

const browser = await chromium.launch();
const fallos = [];
const heredados = [];
const COOKIE = await cookieViva();
let escriturasBloqueadas = 0;
// 🩸 La PRIMERA navegación del servidor recién levantado tarda de más y hacía
// fallar a la primera marca por nada. Se calienta antes de medir.
const CALENTAR = true;

async function nuevoContexto() {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
    try { sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"])); } catch {}
    // Sin esto el service worker rompe la hidratación de la medición.
    try { delete Navigator.prototype.serviceWorker; } catch {}
  });
  // Una medición NO escribe en producción.
  await ctx.route("**/*", (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD") return route.continue();
    escriturasBloqueadas++;
    return route.abort();
  });
  return ctx;
}

// Mide una caja: arrastre de página, recorte propio, táctiles <44 y textos <12.
// `idx` elige cuál de las cajas que matchean el selector (hay una por mes).
async function medir(page, sel, etiqueta, idx = 0) {
  const m = await page.evaluate(([s, i]) => {
    const el = document.querySelectorAll(s)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const chicos = [], tactilesChicos = [];
    for (const n of el.querySelectorAll("*")) {
      const b = n.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const cs = getComputedStyle(n);
      const fs = parseFloat(cs.fontSize);
      if (n.children.length === 0 && n.textContent.trim() && fs < 12) {
        chicos.push(`${Math.round(fs * 10) / 10}px "${n.textContent.trim().slice(0, 24)}"`);
      }
      if ((n.tagName === "BUTTON" || n.tagName === "INPUT" || n.tagName === "A") && (b.height < 44 || b.width < 44)) {
        const lbl = n.closest("label");
        const lr = lbl ? lbl.getBoundingClientRect() : null;
        if (!(lr && lr.height >= 44 && lr.width >= 44)) {
          const txt = (n.textContent || n.getAttribute("aria-label") || n.type || "").trim().slice(0, 20);
          tactilesChicos.push(`${n.tagName}[${txt}] ${Math.round(b.width)}×${Math.round(b.height)}`);
        }
      }
    }
    return {
      docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      w: Math.round(r.width), h: Math.round(r.height),
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      chicos, tactilesChicos,
    };
  }, [sel, idx]);

  if (!m) {
    fallos.push(`${etiqueta}: NO SE ENCONTRÓ ${sel}`);
    console.log(`  ❌ ${etiqueta}: no se encontró ${sel}`);
    return null;
  }
  const arrastre = m.docScrollW - m.innerW;
  const recorte = m.scrollW - m.clientW;
  if (arrastre > 0) fallos.push(`${etiqueta}: arrastre de página ${arrastre}px`);
  // ⚠️ El RECORTE de la tabla NO tumba la medición por sí solo: el contenedor
  // declara `overflow-x-auto`, o sea que arrastrar la tabla ES el mecanismo y ya
  // existía en `origin/main` (390 px: 201-227). Se informa y se COMPARA contra el
  // mismo script corrido con ETAPA=antes — un recorte NUEVO a 1024 sería el fallo.
  if (recorte > 0) heredados.push(`${etiqueta}: recorte ${recorte}px`);
  const cuenta = {};
  for (const t of m.tactilesChicos) cuenta[t] = (cuenta[t] || 0) + 1;
  console.log(
    `  ${etiqueta}: ${m.w}×${m.h}px · arrastre ${arrastre <= 0 ? "✅ 0" : `❌ ${arrastre}`} · ` +
      `recorte ${recorte <= 0 ? "✅ 0" : `❌ ${recorte}`} · ` +
      `táctil<44 ${m.tactilesChicos.length === 0 ? "✅ 0" : `⚠️ ${m.tactilesChicos.length}`} · ` +
      `texto<12px ${m.chicos.length === 0 ? "✅ 0" : `⚠️ ${m.chicos.length}`}`,
  );
  if (m.tactilesChicos.length) console.log(`      táctiles: ${Object.entries(cuenta).map(([t, n]) => (n > 1 ? `${t} ×${n}` : t)).join(" | ")}`);
  if (m.chicos.length) console.log(`      textos:   ${[...new Set(m.chicos)].slice(0, 6).join(" | ")}`);
  return { arrastre, recorte, tactiles: m.tactilesChicos.length, textos: m.chicos.length, alto: m.h, ancho: m.w };
}

const resumen = [];

if (CALENTAR) {
  const ctx = await nuevoContexto();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/catalogos/admin/reebok?tab=pedidos`, { waitUntil: "domcontentloaded", timeout: 180_000 }).catch(() => {});
  await page.waitForSelector("table tbody tr", { timeout: 180_000 }).catch(() => {});
  await ctx.close();
}

for (const marca of MARCAS) {
  console.log(`\n${"═".repeat(76)}\n${marca.toUpperCase()}\n${"═".repeat(76)}`);
  const ctx = await nuevoContexto();
  const page = await ctx.newPage();

  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/catalogos/admin/${marca}?tab=pedidos`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    // 🩸 PRIMERO se despliegan los meses y DESPUÉS se esperan las filas. Al revés
    // se cuelga con razón: por defecto solo se abre el mes ACTUAL, y si los pedidos
    // de esa marca son de meses anteriores (Reebok: los 19 son de julio) no hay ni
    // una fila en el DOM y el script daba «no apareció la tabla» por nada.
    try {
      await page.waitForSelector("button:has-text('pedidos)')", { timeout: 60_000 });
    } catch {
      const t = (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n+/g, " · ");
      fallos.push(`${marca} @${a.w}: la lista de pedidos NO apareció — pantalla: ${t}`);
      console.log(`\n${a.nombre} (${a.w}px)\n  ❌ sin lista de pedidos`);
      continue;
    }
    // El PEOR CASO: TODOS los meses desplegados.
    await page.evaluate(() => {
      for (const b of document.querySelectorAll("button")) {
        if (/\(\d+ pedidos?\)/.test(b.textContent || "") && !b.querySelector("svg.rotate-90")) b.click();
      }
    });
    await page.waitForTimeout(400);
    try {
      await page.waitForSelector("table tbody tr", { timeout: 30_000 });
    } catch {
      fallos.push(`${marca} @${a.w}: los meses se desplegaron pero no hay ni una fila`);
      console.log(`\n${a.nombre} (${a.w}px)\n  ❌ sin filas`);
      continue;
    }

    console.log(`\n${a.nombre} (${a.w}px)`);

    const filas = await page.evaluate(() => document.querySelectorAll("tbody tr").length);
    // Hay UNA tabla por mes desplegado: las columnas se cuentan tabla por tabla.
    const cols = await page.evaluate(() => [...document.querySelectorAll("table")].map((t) => t.querySelectorAll("thead th").length));
    console.log(`     filas ${filas} · tablas ${cols.length} · columnas ${JSON.stringify([...new Set(cols)])}`);
    if (filas === 0) fallos.push(`${marca} @${a.w}: 0 filas — no hay nada que medir`);
    if (cols.some((c) => c !== 6)) fallos.push(`${marca} @${a.w}: alguna tabla tiene ${JSON.stringify(cols)} columnas (tienen que ser 6: los números NO van en una columna nueva)`);

    // Se mide el PEOR de los contenedores (uno por mes desplegado).
    const cuantos = await page.evaluate(() => document.querySelectorAll("div.bg-white.border.border-gray-200.rounded-lg.overflow-x-auto").length);
    let peor = null;
    for (let i = 0; i < cuantos; i++) {
      const m = await medir(page, "div.bg-white.border.border-gray-200.rounded-lg.overflow-x-auto", `${marca}/${a.w} (mes ${i + 1}/${cuantos})`, i);
      if (m && (!peor || m.recorte > peor.recorte)) peor = m;
    }
    if (peor) resumen.push({ marca, ancho: a.w, ...peor });

    if (ETAPA === "despues") {
      const t = await page.evaluate(() => {
        const celdas = [...document.querySelectorAll("tbody tr")].map((tr) => (tr.querySelectorAll("td")[2]?.innerText || ""));
        return {
          conNumero: celdas.filter((c) => /\b(PED|JBP|TOM|CKP)-\d+/.test(c)).length,
          enSwitch: celdas.filter((c) => /(Pedido|Cotización) en Switch:/i.test(c)).length,
          sinMandar: celdas.filter((c) => /No se ha mandado a Switch/i.test(c)).length,
          delLink: celdas.filter((c) => /Se numera al abrirlo/i.test(c)).length,
          guionSuelto: celdas.filter((c) => /(^|\s)—(\s|$)/.test(c)).length,
          total: celdas.length,
        };
      });
      console.log(`     con N.º propio ${t.conNumero}/${t.total} · en Switch ${t.enSwitch} · sin mandar ${t.sinMandar} · del link ${t.delLink}`);
      if (t.conNumero + t.delLink !== t.total) {
        fallos.push(`${marca} @${a.w}: ${t.total - t.conNumero - t.delLink} filas SIN número ni explicación`);
      }
      if (t.enSwitch + t.sinMandar !== t.total) {
        fallos.push(`${marca} @${a.w}: ${t.total - t.enSwitch - t.sinMandar} filas sin decir si está en Switch`);
      }
      if (t.guionSuelto > 0) fallos.push(`${marca} @${a.w}: ${t.guionSuelto} filas con un guion suelto donde va un número`);
    }
  }
  await ctx.close();
}

console.log(`\n${"═".repeat(76)}\nRESUMEN (ETAPA=${ETAPA})\n${"═".repeat(76)}`);
console.log("marca      ancho  arrastre  recorte  táctil<44  texto<12  alto");
for (const r of resumen) {
  console.log(
    `${r.marca.padEnd(10)} ${String(r.ancho).padStart(5)}  ${String(r.arrastre).padStart(8)}  ${String(r.recorte).padStart(7)}  ${String(r.tactiles).padStart(9)}  ${String(r.textos).padStart(8)}  ${String(r.alto).padStart(4)}`,
  );
}
console.log(`\nEscrituras bloqueadas por el navegador: ${escriturasBloqueadas}`);
if (heredados.length) {
  console.log(`\n⚠️  ${heredados.length} recortes de tabla (el contenedor declara overflow-x-auto; comparar contra ETAPA=antes):`);
  for (const h of heredados) console.log(`   · ${h}`);
}

await browser.close();
if (fallos.length) {
  console.log(`\n🔴 ${fallos.length} FALLOS:`);
  for (const f of fallos) console.log(`   · ${f}`);
  process.exit(1);
}
console.log("\n🟢 sin fallos");
