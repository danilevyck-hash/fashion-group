// Medición de "Ventas › Referencia" con el RESUMEN del artículo, en los TRES
// anchos: 390 · 834 · 1440.
//
// Qué mide, con datos de PRODUCCIÓN y en dos casos reales:
//   · NB2570001 — 5 compras, 2 agotadas, resumen con las dos frases.
//   · QD3958033 — 1 compra viva; es el caso del defecto que cazó Daniel
//     ("me sale dos veces mi inv").
// Y en cada uno:
//   · ARRASTRE — contenedor con `overflow-x:auto` que pide más de lo que ve.
//     🔴 La tabla YA medía bien; si la línea nueva agrega arrastre, es un fallo.
//   · RECORTE  — lo mismo con `overflow:hidden`: el dato queda fuera y NO hay
//                forma de alcanzarlo, ni arrastrando. Es el peor de los dos.
//   · Blancos táctiles por debajo de 44 px.
//   · Textos por debajo de 12 px.
//   · El alto de la línea de resumen (crecer hacia ABAJO es lo único que un
//     resumen puede regalar).
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado. Y a 1024 deja
// 766, que es donde la tabla queda más apretada.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`
// (si no, todo redirige al login) y `delete Navigator.prototype.serviceWorker`
// antes de navegar.
//
// Solo lectura:
//   npx next build && npx next start -p 3197
//   BASE=http://localhost:3197 node scripts/_medir-referencia-resumen.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3197";
const ETAPA = process.env.ETAPA ?? "ahora";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];
const CODIGOS = ["NB2570001", "QD3958033"];

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };

  const desbordes = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1) continue;
    if (!visible(el)) continue;
    if (el.children.length === 0) continue;         // texto truncado, no es esto
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;
    desbordes.push({
      modo: cs.overflowX === "auto" || cs.overflowX === "scroll" ? "ARRASTRA" : "RECORTA",
      sobra: Math.round(sobra), ve: el.clientWidth, pide: el.scrollWidth,
      etiqueta: el.tagName.toLowerCase() + "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 70),
    });
  }
  desbordes.sort((a, b) => b.sobra - a.sobra);

  const chicos = [];
  for (const el of document.querySelectorAll("button, a, select, input, [role=button]")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 44 || r.width < 44) {
      chicos.push({ h: Math.round(r.height), w: Math.round(r.width),
        txt: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40) });
    }
  }

  const chicosTexto = [];
  for (const el of document.querySelectorAll("main *")) {
    if (!visible(el)) continue;
    if (!el.textContent || el.children.length > 0) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px && px < 12) chicosTexto.push({ px: Math.round(px * 10) / 10, txt: el.textContent.trim().slice(0, 30) });
  }

  const main = document.querySelector("main") ?? document.body;
  // La línea de resumen: primer bloque con el texto "En bodega".
  let resumen = null;
  for (const el of document.querySelectorAll("section > div")) {
    if (el.textContent && el.textContent.startsWith("En bodega")) {
      const r = el.getBoundingClientRect();
      resumen = { alto: Math.round(r.height), ancho: Math.round(r.width), texto: el.textContent.trim().slice(0, 140) };
      break;
    }
  }

  const tabla = document.querySelector('[data-vista="tabla"]');
  const tarjetas = document.querySelector('[data-vista="tarjetas"]');
  const visibleTabla = tabla && visible(tabla);

  return {
    util: main.clientWidth,
    bodySobra: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
    desbordes: desbordes.slice(0, 6),
    chicos: chicos.slice(0, 8),
    chicosTexto: chicosTexto.slice(0, 6),
    resumen,
    vista: visibleTabla ? "tabla" : tarjetas && visible(tarjetas) ? "tarjetas" : "?",
    tablaSobra: tabla ? Math.round(tabla.scrollWidth - tabla.clientWidth) : null,
    encabezados: visibleTabla ? [...tabla.querySelectorAll("th")].map((t) => t.textContent.trim()) : null,
  };
})()`;

const navegador = await chromium.launch();
let fallos = 0;

for (const codigo of CODIGOS) {
  console.error(`\n═══════════ ${codigo} ═══════════`);
  for (const ancho of ANCHOS) {
    const ctx = await navegador.newContext({
      viewport: { width: ancho, height: ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844 },
      deviceScaleFactor: 1,
      hasTouch: ancho < 1200,
    });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
    await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
    await ctx.addInitScript(() => {
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("fg_is_owner", "1");
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/ventas?tab=referencia`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    // Se envía con Enter, NO clickeando "Buscar": el encabezado global tiene su
    // propio botón de buscar y `.first()` caía en ése — la búsqueda no corría y
    // la medición daba 0 desbordes sobre una pantalla VACÍA, o sea verde por no
    // haber mirado nada. Por eso abajo se exige encontrar la tabla o la tarjeta.
    const caja = page.getByRole("textbox", { name: /Buscar referencia/ });
    await caja.fill(codigo);
    await caja.press("Enter");
    // A 390 la tabla existe pero está `hidden lg:block`: esperar por VISIBILIDAD
    // de un [data-vista] se cuelga. Se espera a que haya UNO visible, sea cual sea.
    await page.waitForFunction(() => {
      for (const el of document.querySelectorAll("[data-vista]")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return true;
      }
      return false;
    }, { timeout: 30000 });
    await page.waitForTimeout(1200);

    const r = await page.evaluate(SONDA);
    const arrastre = r.desbordes.filter((d) => d.modo === "ARRASTRA").reduce((s, d) => s + d.sobra, 0);
    const recorte = r.desbordes.filter((d) => d.modo === "RECORTA").reduce((s, d) => s + d.sobra, 0);
    if (r.bodySobra > 1 || recorte > 0) fallos += 1;

    console.error(
      `@${ancho}  útil=${r.util}px  vista=${r.vista}  ·  body ${r.bodySobra}px  ·  ` +
      `tabla arrastra ${r.tablaSobra ?? "—"}px  ·  ${r.desbordes.length} desborde(s) ` +
      `(arrastre ${arrastre}px / recorte ${recorte}px)  ·  ${r.chicos.length} blanco(s) <44px  ·  ` +
      `${r.chicosTexto.length} texto(s) <12px`,
    );
    if (r.resumen) {
      console.error(`     resumen: ${r.resumen.alto}px de alto, ${r.resumen.ancho}px de ancho`);
      console.error(`     texto:   ${r.resumen.texto}`);
    } else {
      console.error(`     ⚠ NO se encontró la línea de resumen`);
      fallos += 1;
    }
    if (r.encabezados) console.error(`     columnas: ${r.encabezados.join(" · ")}`);
    for (const d of r.desbordes) {
      console.error(`     ${d.modo} ${String(d.sobra).padStart(4)}px  ve ${d.ve} pide ${d.pide}  ${d.etiqueta}`);
    }
    for (const c of r.chicos) console.error(`     <44px: ${c.w}×${c.h}  ${c.txt}`);
    for (const t of r.chicosTexto) console.error(`     <12px: ${t.px}px  ${t.txt}`);

    await page.screenshot({ path: `/tmp/referencia-${ETAPA}-${codigo}-${ancho}.png`, fullPage: true });
    await ctx.close();
  }
}

await navegador.close();
console.error(`\n${fallos === 0 ? "🟢 sin arrastre de página ni recortes" : `🔴 ${fallos} caso(s) con problema`}`);
