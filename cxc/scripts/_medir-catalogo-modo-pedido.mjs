// SOLO LECTURA de la pantalla (no escribe en el pedido ni en la base). Mide el
// catálogo en MODO PEDIDO (`?agregarA=<id>`) y el detalle del pedido en los
// anchos de la casa: cuánto ARRASTRA la página, cuánto se RECORTA, si algún
// blanco táctil baja de 44 px y si algún texto baja de 12 px.
//
//   BASE=http://localhost:3000 PEDIDO=<uuid> MARCA=tommy node scripts/_medir-catalogo-modo-pedido.mjs
//
// 🩸 LO QUE SE COMPARA IMPORTA. El catálogo trae de antes sus controles de
// cantidad de 36 px de alto y sus textos de 10-11 px (Bulto de N,
// Disponibilidad) — cientos. Exigirle 0 al modo pedido sería medir el catálogo
// entero, no el cambio. Por eso:
//   · la BARRA nueva se mide con exigencia PLENA (44 px / 12 px);
//   · el resto se compara contra el MISMO catálogo sin el modo y CON un
//     producto en el carrito, que es el estado equivalente (las tarjetas
//     muestran el mismo control de cantidad en los dos casos).
// El carrito de esa comparación se llena tocando "Agregar" en el catálogo
// NORMAL: eso solo escribe en sessionStorage, nunca en la base.
//
// Gotchas de medición de la casa: sembrar la cookie de sesión, `cxc_role` Y
// `fg_modules` (el guard del catálogo mira los módulos), y
// `delete Navigator.prototype.serviceWorker` antes de navegar.

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PEDIDO = process.env.PEDIDO;
const MARCA = process.env.MARCA ?? "tommy";
const SALIDA = `/tmp/modo-pedido-${MARCA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = (process.env.ANCHOS ?? "390,834,1024,1440").split(",").map(Number);

if (!PEDIDO) { console.error("Falta PEDIDO=<uuid del pedido de prueba>"); process.exit(1); }
mkdirSync(SALIDA, { recursive: true });

const MEDIR = () => {
  const de = document.documentElement;
  const arrastre = Math.max(0, de.scrollWidth - de.clientWidth);
  const chicos = [];
  const textos = [];
  const recortados = [];
  for (const e of document.querySelectorAll("button, a, input, select")) {
    const r = e.getBoundingClientRect();
    if (r.width > 1 && r.height > 0 && (r.height < 44 || r.width < 44)) {
      chicos.push({ t: (e.textContent || e.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  for (const e of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const px = parseFloat(cs.fontSize);
    if (e.children.length === 0 && (e.textContent || "").trim() && px && px < 12) {
      textos.push({ t: e.textContent.trim().slice(0, 30), px });
    }
    // Recorte REAL: contenido fuera de su caja SIN scroller declarado (un
    // overflow:auto es el mecanismo, no un defecto), y sin `truncate`.
    const desborde = e.scrollWidth - e.clientWidth;
    if (desborde > 4 && cs.overflowX !== "auto" && cs.overflowX !== "scroll") {
      const r = e.getBoundingClientRect();
      if (r.width > 40 && !e.className.toString().includes("truncate")) {
        recortados.push({ t: (e.textContent || e.tagName).trim().slice(0, 30), px: desborde });
      }
    }
  }
  const barra = document.querySelector("[data-modo-pedido]");
  const barraChicos = [];
  const barraTextos = [];
  if (barra) {
    for (const e of barra.querySelectorAll("button, a")) {
      const r = e.getBoundingClientRect();
      if (r.width > 1 && r.height > 0 && (r.height < 44 || r.width < 44)) {
        barraChicos.push({ t: (e.textContent || e.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    for (const e of barra.querySelectorAll("*")) {
      const cs = getComputedStyle(e);
      const px = parseFloat(cs.fontSize);
      if (e.children.length === 0 && (e.textContent || "").trim() && px && px < 12) {
        barraTextos.push({ t: e.textContent.trim().slice(0, 30), px });
      }
    }
  }
  return {
    arrastre, chicos, textos, recortados, barraChicos, barraTextos,
    barra: barra
      ? { texto: barra.textContent.replace(/\s+/g, " ").trim(), alto: Math.round(barra.getBoundingClientRect().height), estado: barra.getAttribute("data-modo-pedido") }
      : null,
  };
};

const nav = await chromium.launch();
let malas = 0;

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_name", "daniel");
    sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
  });
  const page = await ctx.newPage();
  const medidas = {};

  // 1) Catálogo NORMAL con un producto en el carrito (el estado comparable).
  await page.goto(`${BASE}/catalogo/${MARCA}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.locator('button:has-text("Agregar")').first().click();
  await page.waitForTimeout(1200);
  medidas.normal = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/${ancho}-catalogo-normal.png` });

  // 2) Catálogo en MODO PEDIDO.
  await page.goto(`${BASE}/catalogo/${MARCA}?agregarA=${PEDIDO}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.locator("[data-modo-pedido]").first().waitFor({ timeout: 20000 });
  medidas.modo = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/${ancho}-modo-pedido.png` });

  // 3) Detalle del pedido (de donde se sale y a donde se vuelve).
  await page.goto(`${BASE}/catalogo/${MARCA}/pedido/${PEDIDO}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  medidas.pedido = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/${ancho}-detalle-pedido.png` });

  const { normal, modo, pedido } = medidas;
  const dT = modo.chicos.length - normal.chicos.length;
  const dX = modo.textos.length - normal.textos.length;
  const dR = modo.recortados.length - normal.recortados.length;
  const ok =
    modo.arrastre === 0 && pedido.arrastre === 0 && normal.arrastre === 0 &&
    modo.barraChicos.length === 0 && modo.barraTextos.length === 0 &&
    dT <= 0 && dX <= 0 && dR <= 0;
  if (!ok) malas++;

  console.log(`\n═══ ${ancho}px — ${ok ? "🟢" : "🔴"}`);
  console.log(`  arrastre de página: modo pedido ${modo.arrastre}px · catálogo normal ${normal.arrastre}px · detalle ${pedido.arrastre}px`);
  console.log(`  BARRA (${modo.barra.estado}, ${modo.barra.alto}px de alto): "${modo.barra.texto}"`);
  console.log(`  BARRA: táctiles <44 ${modo.barraChicos.length} · textos <12 ${modo.barraTextos.length}`);
  for (const c of modo.barraChicos) console.log(`    · táctil ${c.w}×${c.h} "${c.t}"`);
  for (const t of modo.barraTextos) console.log(`    · texto ${t.px}px "${t.t}"`);
  console.log(`  DELTA vs catálogo normal (mismo build, con 1 en el carrito):`);
  console.log(`    táctiles <44 ${normal.chicos.length} → ${modo.chicos.length} (${dT >= 0 ? "+" : ""}${dT})`);
  console.log(`    textos <12  ${normal.textos.length} → ${modo.textos.length} (${dX >= 0 ? "+" : ""}${dX})`);
  console.log(`    recortados  ${normal.recortados.length} → ${modo.recortados.length} (${dR >= 0 ? "+" : ""}${dR})`);
  console.log(`  DETALLE del pedido: táctiles <44 ${pedido.chicos.length} · textos <12 ${pedido.textos.length} · recortados ${pedido.recortados.length}`);
  for (const r of modo.recortados.slice(0, 4)) console.log(`    · (también en el catálogo normal) recorte ${Math.round(r.px)}px "${r.t}"`);

  await ctx.close();
}

await nav.close();
console.log(malas === 0 ? "\n🟢 TODO LIMPIO" : `\n🔴 ${malas} ancho(s) con hallazgos`);
process.exit(malas === 0 ? 0 : 1);
