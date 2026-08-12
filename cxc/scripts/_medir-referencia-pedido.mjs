// SOLO LECTURA del MODO PEDIDO de /ventas?tab=referencia. Pega VARIOS códigos,
// verifica que salga la TABLA (no tarjetas), abre una fila y mide los anchos de
// la casa: arrastre de PÁGINA, recortes, blancos táctiles y textos chicos.
//
//   BASE=http://localhost:3126 node scripts/_medir-referencia-pedido.mjs
//
// 🔴 LA TABLA PUEDE SCROLLEAR ELLA SOLA (overflow-x-auto es el mecanismo, no un
// defecto — regla de la casa: recortado ≠ arrastrable); lo que NO puede es
// arrastrar el BODY. Los elementos dentro de un scroller declarado no cuentan
// como recortados.
//
// 🔴 NO ESCRIBE NADA. Solo teclea en el buscador y lee la pantalla.

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const CODIGOS = process.env.CODIGOS ?? "CVM253CR02001 NB2570001 QD3958033 40HM265032 NB3705906";
const ABRIR = process.env.ABRIR ?? "NB2570001";
const ETIQUETA = process.env.ETIQUETA ?? "rama";
const SALIDA = `/tmp/referencia-pedido-${ETIQUETA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = (process.env.ANCHOS ?? "390,834,1024,1440").split(",").map(Number);

mkdirSync(SALIDA, { recursive: true });
const nav = await chromium.launch();
let malas = 0;

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
  });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/ventas?tab=referencia`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);

  const input = page.locator('input[aria-label="Buscar referencia"]').first();
  await input.waitFor({ timeout: 20000 });
  await input.fill(CODIGOS);
  await page.locator('button:has-text("Buscar")').first().click();
  await page.waitForSelector("tbody tr", { timeout: 20000 });
  await page.waitForTimeout(1500);

  for (const estado of ["cerrada", "abierta"]) {
    if (estado === "abierta") {
      await page.locator(`tbody td:has-text("${ABRIR}")`).first().click();
      await page.waitForTimeout(800);
    }

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const arrastre = Math.max(0, de.scrollWidth - de.clientWidth);

      const hayTabla = !!document.querySelector("thead");
      const hayTarjetasSueltas = document.querySelectorAll("section.rounded-xl h4").length;
      const filas = document.querySelectorAll("tbody tr").length;

      const dentroDeScroller = (e) => {
        for (let n = e; n; n = n.parentElement) {
          const o = getComputedStyle(n).overflowX;
          if (o === "auto" || o === "scroll") return true;
        }
        return false;
      };

      const chicos = [];
      const textos = [];
      const recortados = [];
      const raiz = document.querySelector("section.overflow-hidden") ?? document.body;
      for (const e of raiz.querySelectorAll("button, a, input")) {
        const r = e.getBoundingClientRect();
        if (r.width > 1 && r.height > 0 && (r.height < 44 || r.width < 44)) {
          chicos.push({ t: (e.textContent || e.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
      for (const e of raiz.querySelectorAll("*")) {
        if (!e.childNodes.length) continue;
        const propio = [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim());
        if (!propio) continue;
        const px = parseFloat(getComputedStyle(e).fontSize);
        if (px < 12) textos.push({ t: (e.textContent || "").trim().slice(0, 30), px: Math.round(px * 10) / 10 });
        const r = e.getBoundingClientRect();
        // Dentro del scroller declarado, el recorte ES el mecanismo (se arrastra).
        if (r.width > 0 && e.scrollWidth - e.clientWidth > 1 && !dentroDeScroller(e)) {
          recortados.push({ t: (e.textContent || "").trim().slice(0, 30), px: e.scrollWidth - e.clientWidth });
        }
      }

      // Orden de las filas (para verificar el orden pegado) y las columnas:
      // desde el 12-ago-2026 la tabla dice VENDIDO · MESES, nunca "90% en".
      const orden = [...document.querySelectorAll("tbody td:first-child span:first-child")].map(
        (s) => s.textContent?.trim() ?? "",
      );
      const encabezados = [...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
      const detalle = document.querySelector("dl") ? "detalle abierto (tres grandes montados)" : null;

      return { arrastre, hayTabla, hayTarjetasSueltas, filas, chicos, textos, recortados, orden, encabezados, detalle };
    });

    const columnasOk =
      m.encabezados.includes("Vendido") && m.encabezados.includes("Meses") && !m.encabezados.includes("90% en");
    const ok =
      m.arrastre === 0 &&
      m.hayTabla &&
      columnasOk &&
      m.chicos.length === 0 &&
      m.textos.length === 0 &&
      m.recortados.length === 0;
    if (!ok) malas += 1;
    console.log(
      `${ok ? "🟢" : "🔴"} ${ancho} px · ${estado} · arrastre PÁGINA ${m.arrastre} px · tabla=${m.hayTabla} · ` +
        `columnas VENDIDO·MESES=${columnasOk} · ${m.filas} filas · blancos <44: ${m.chicos.length} · ` +
        `textos <12: ${m.textos.length} · recortados: ${m.recortados.length}`,
    );
    if (estado === "cerrada") console.log(`   orden: ${m.orden.join(" · ")}`);
    if (estado === "cerrada") console.log(`   encabezados: ${m.encabezados.filter(Boolean).join(" · ")}`);
    if (m.detalle) console.log(`   ${m.detalle}`);
    if (m.chicos.length) console.log("   chicos:", JSON.stringify(m.chicos));
    if (m.textos.length) console.log("   textos:", JSON.stringify(m.textos));
    if (m.recortados.length) console.log("   recortados:", JSON.stringify(m.recortados));

    await page.screenshot({ path: `${SALIDA}/pedido-${ancho}-${estado}.png`, fullPage: true });
  }

  await ctx.close();
}

await nav.close();
console.log(malas === 0 ? "\n🟢 TODO LIMPIO" : `\n🔴 ${malas} estado(s) con hallazgos`);
process.exit(malas === 0 ? 0 : 1);
