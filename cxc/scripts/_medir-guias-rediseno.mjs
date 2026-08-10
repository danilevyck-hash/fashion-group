// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. Mide los TRES anchos del módulo Guías tras el rediseño:
//   · /guias                      — la lista, cerrada y con una guía abierta
//   · /guias/[id]  (pendiente)    — la página donde se despacha
//   · /guias/[id]  (despachada)   — la misma página, de solo lectura
//
// 🔴 NO TOCA "Despachar" ni ningún botón que guarde. Solo abre, mide y saca
//    capturas.
//
//   BASE=http://localhost:3111 GUIA_PENDIENTE=<uuid> GUIA_DESPACHADA=<uuid> \
//     node scripts/_medir-guias-rediseno.mjs
//
// Gotchas de medición de la casa (los mismos de siempre):
//   · sembrar `sessionStorage.cxc_role`, si no `useAuth` redirige al login;
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar — bloquearlo
//     de otra forma mata la hidratación.
//
// 🔑 El ancho que decide NO es el de la ventana: la barra lateral se lleva
//    224 px desde `md:`, así que un iPad de 834 deja 610 útiles — más angosto
//    que un iPhone acostado. Ese es el ancho del medio, el que nadie mira.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3111";
const ETIQUETA = process.env.ETIQUETA ?? "rama";
const SALIDA = `/tmp/guias-rediseno-${ETIQUETA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const PENDIENTE = process.env.GUIA_PENDIENTE ?? "";
const DESPACHADA = process.env.GUIA_DESPACHADA ?? "";
const ANCHOS = [390, 834, 1440];

mkdirSync(SALIDA, { recursive: true });

/** Lo que se mide, siempre lo mismo en las tres pantallas. */
const MEDIR = () => {
  const de = document.documentElement;
  const arrastrePagina = Math.max(0, de.scrollWidth - de.clientWidth);

  // Un hijo que se sale de su contenedor. Se excluyen los que TIENEN scroller
  // propio (`overflow-x:auto|scroll`): ahí desplazarse es el mecanismo, no un
  // defecto. `sr-only` mide 1 px a propósito.
  const recortados = [...document.querySelectorAll("main *, body > div *")]
    .filter((e) => {
      const s = getComputedStyle(e);
      if (s.overflowX === "auto" || s.overflowX === "scroll") return false;
      return e.clientWidth > 1 && e.scrollWidth - e.clientWidth > 2;
    })
    .map((e) => ({
      tag: e.tagName,
      cls: (e.className || "").toString().slice(0, 40),
      extra: e.scrollWidth - e.clientWidth,
      txt: (e.textContent || "").trim().slice(0, 32),
    }));

  // Scrollers legítimos: cuánto hay que arrastrar DENTRO de ellos.
  const scrollers = [...document.querySelectorAll("*")]
    .filter((e) => {
      const s = getComputedStyle(e);
      return (s.overflowX === "auto" || s.overflowX === "scroll") && e.scrollWidth - e.clientWidth > 2;
    })
    .map((e) => ({ cls: (e.className || "").toString().slice(0, 40), extra: e.scrollWidth - e.clientWidth }));

  // Blancos táctiles por debajo de 44 px.
  const chicos = [...document.querySelectorAll("button, a, input, select, textarea")]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
    })
    .map((e) => {
      const r = e.getBoundingClientRect();
      return { t: (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) };
    });

  // Nada de letra por debajo de 12 px en guías.
  const letraChica = [...document.querySelectorAll("*")]
    .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
    .map((e) => parseFloat(getComputedStyle(e).fontSize))
    .filter((n) => n && n < 12);

  return { arrastrePagina, recortados, scrollers, chicos, letraChica: letraChica.length };
};

const informe = {};

const nav = await chromium.launch();
for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => { sessionStorage.setItem("cxc_role", "admin"); sessionStorage.setItem("fg_is_owner", "1"); });
  const page = await ctx.newPage();

  // ── 1. La lista, cerrada ────────────────────────────────────────────────
  await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  const lista = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/lista-${ancho}.png`, fullPage: false });

  // ── 2. La lista, con una guía abierta ───────────────────────────────────
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /GT-\d+/.test(x.textContent || ""));
    b?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(4000);
  const listaAbierta = await page.evaluate(MEDIR);
  const botones = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .filter((t) => /^(Editar|Imprimir|Despachar)$/.test(t))
  );
  await page.screenshot({ path: `${SALIDA}/lista-abierta-${ancho}.png`, fullPage: false });

  // ── 3. La página de la guía, PENDIENTE ──────────────────────────────────
  let guiaPend = null;
  if (PENDIENTE) {
    await page.goto(`${BASE}/guias/${PENDIENTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);
    guiaPend = await page.evaluate(MEDIR);
    guiaPend.falta = await page.evaluate(() => {
      const p = [...document.querySelectorAll("p")].find((x) => /^Falta:/.test((x.textContent || "").trim()));
      return p ? p.textContent.trim() : null;
    });
    guiaPend.camposTransp = await page.evaluate(() => document.querySelectorAll('input[id^="transp-"]').length);
    guiaPend.botonApagado = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "Despachar");
      return b ? b.disabled : null;
    });
    await page.screenshot({ path: `${SALIDA}/guia-pendiente-${ancho}.png`, fullPage: true });
  }

  // ── 4. La página de la guía, DESPACHADA ─────────────────────────────────
  let guiaDesp = null;
  if (DESPACHADA) {
    await page.goto(`${BASE}/guias/${DESPACHADA}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);
    guiaDesp = await page.evaluate(MEDIR);
    await page.screenshot({ path: `${SALIDA}/guia-despachada-${ancho}.png`, fullPage: true });
  }

  informe[ancho] = { lista, listaAbierta, botones, guiaPend, guiaDesp };

  const r = (m) => (m ? `arrastre ${m.arrastrePagina} · recortados ${m.recortados.length} · <44px ${m.chicos.length} · letra<12 ${m.letraChica}` : "—");
  console.log(`\n══ ${ancho} px ══`);
  console.log(`  lista            ${r(lista)}`);
  console.log(`  lista abierta    ${r(listaAbierta)}  botones: ${JSON.stringify(botones)}`);
  console.log(`  guía pendiente   ${r(guiaPend)}`);
  if (guiaPend) console.log(`                   campos N° transp: ${guiaPend.camposTransp} · botón apagado: ${guiaPend.botonApagado} · "${guiaPend.falta}"`);
  console.log(`  guía despachada  ${r(guiaDesp)}`);
  for (const [k, m] of Object.entries({ lista, listaAbierta, guiaPend, guiaDesp })) {
    if (!m) continue;
    for (const c of m.chicos) console.log(`      ⚠️ ${k}: blanco ${c.w}×${c.h} "${c.t}"`);
    for (const c of m.recortados) console.log(`      ⚠️ ${k}: recortado ${c.extra}px <${c.tag}> "${c.txt}"`);
    for (const s of m.scrollers) console.log(`      ↔️ ${k}: scroller ${s.extra}px (${s.cls})`);
  }
  await ctx.close();
}
await nav.close();
writeFileSync(`${SALIDA}/informe.json`, JSON.stringify(informe, null, 2));
console.log(`\ncapturas e informe en ${SALIDA}`);
