// ¿La tabla ENTRA o no entra? Mide el ancho MÍNIMO real de cada tabla contra el
// ancho ÚTIL de la pantalla, que es lo único que decide entre "achicar la tabla"
// y "pasar a tarjetas".
//
// 🔑 El ancho útil NO es el viewport: la barra lateral se come 223 px y el
// `main` pone otros 56 de padding. Un iPad de 834 deja 555 px — más angosto que
// un iPhone acostado. Por eso una tabla que "se ve bien en la tablet" en
// realidad no cabe.
//
// CÓMO mide el mínimo: clona la tabla fuera de pantalla con `width:auto` y
// `table-layout:auto` dentro de un contenedor de 1 px. El navegador colapsa cada
// columna a su ancho mínimo (parte los textos donde puede) y `scrollWidth` da el
// número: cuánto necesita la tabla SÍ O SÍ. Si ese mínimo pasa del útil, no hay
// relleno que sacar ni encabezado que partir — hay que ir a tarjetas.
//
// También reporta el ancho PREFERIDO (sin partir nada, `white-space:nowrap`),
// que es lo que la tabla querría para leerse cómoda.
//
// Solo lectura.
//
//   BASE=http://localhost:3172 node scripts/_ancho-util-ventas.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3172";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// ⚠️ CONTROL DE VACÍO. A 834 px la corrida del censo dio 0 px en Productos y
// Utilidad con `filas: 0`: no era que entrara, era que la tabla todavía no había
// llegado (los dos tabs se auto-fetchean después de hidratar). Un 0 sin filas es
// "no medido". Acá se ESPERA a que aparezca contenido de verdad antes de medir.
const PANTALLAS = [
  { id: "ventas-clientes", url: "/ventas?tab=clientes", listo: "table tbody tr, [data-fila-cliente]" },
  { id: "ventas-productos", url: "/ventas?tab=productos", listo: "table tbody tr, [data-fila-producto]" },
  { id: "ventas-utilidad", url: "/ventas?tab=utilidad", listo: "table tbody tr, [data-fila-utilidad]" },
  { id: "vista-general", url: "/vista-general", listo: "table tbody tr, [data-fila-semaforo]" },
];

const SONDA = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const salida = [];
  for (const t of document.querySelectorAll("table")) {
    if (!vis(t)) continue;
    const cont = t.parentElement;
    const util = cont ? cont.clientWidth : 0;

    // Ancho MÍNIMO: el navegador colapsa columnas partiendo texto donde puede.
    const jaula = document.createElement("div");
    jaula.style.cssText = "position:absolute;left:-99999px;top:0;width:1px;";
    document.body.appendChild(jaula);
    const c1 = t.cloneNode(true);
    c1.style.cssText = "width:auto;min-width:0;table-layout:auto;";
    jaula.appendChild(c1);
    const minimo = c1.scrollWidth;

    // Ancho PREFERIDO: nada se parte.
    const jaula2 = document.createElement("div");
    jaula2.style.cssText = "position:absolute;left:-99999px;top:0;width:99999px;";
    document.body.appendChild(jaula2);
    const c2 = t.cloneNode(true);
    c2.style.cssText = "width:auto;min-width:0;table-layout:auto;white-space:nowrap;";
    jaula2.appendChild(c2);
    const preferido = c2.scrollWidth;

    // Ancho por columna con el layout ACTUAL (para saber quién se lleva el ancho).
    const cabeceras = [...t.querySelectorAll("thead th")].map((th) => ({
      txt: (th.textContent ?? "").replace(/\\s+/g, " ").trim().slice(0, 18),
      px: Math.round(th.getBoundingClientRect().width),
    }));

    salida.push({
      cols: t.querySelectorAll("thead th").length,
      filas: t.querySelectorAll("tbody tr").length,
      minCSS: getComputedStyle(t).minWidth,
      utilDelContenedor: util,
      anchoActual: Math.round(t.getBoundingClientRect().width),
      minimoReal: minimo,
      preferido,
      cabeceras,
    });
    jaula.remove();
    jaula2.remove();
  }
  // ── Todo lo que recorta o arrastra, SIN UMBRALES ───────────────────────────
  // 🩸 El censo (_medir-scroll-lateral.mjs) descarta los recortes de menos de
  // 100 px para no contar los textos con puntos suspensivos. Es lo correcto para
  // barrer 26 pantallas, pero ESCONDE los recortes chicos: hubo una pantalla que
  // reportaba 0 y recortaba 92 px de verdad. Para dar por buena una pantalla
  // hace falta el número crudo. Acá se lista TODO lo que sobra, y el filtro se
  // hace después, a mano, leyendo la etiqueta.
  const crudos = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1) continue;
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;
    crudos.push({
      etiqueta: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 70) : ""),
      sobraPx: Math.round(sobra),
      arrastrable: cs.overflowX === "auto" || cs.overflowX === "scroll",
      hoja: el.children.length === 0,
      texto: (el.textContent ?? "").replace(/\\s+/g, " ").trim().slice(0, 30),
    });
  }
  crudos.sort((a, b) => b.sobraPx - a.sobraPx);

  return {
    anchoUtilMain: (() => { const m = document.querySelector("main"); return m ? m.clientWidth : null; })(),
    tablas: salida,
    crudos: crudos.slice(0, 8),
    // Control de vacío para las TARJETAS: un 0 sin tarjetas no prueba nada.
    tarjetas: document.querySelectorAll("[data-fila-cliente], [data-fila-utilidad], [data-fila-semaforo], [data-fila-producto]").length,
  };
})()`;

const nav = await chromium.launch();
// 810 = iPad Air vertical, el ancho REAL más apretado con barra lateral (531 px
// útiles, menos que los 552 de un 834). 1194 = iPad horizontal.
for (const ancho of [390, 810, 834, 1024, 1194, 1440]) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto },
    deviceScaleFactor: 1,
    hasTouch: ancho < 1200,
    isMobile: false,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem("fg_modules", JSON.stringify(["ventas", "cxc", "clientes", "vista-general", "admin"]));
  });
  const page = await ctx.newPage();
  for (const p of PANTALLAS) {
    await page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(p.listo, { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const r = await page.evaluate(SONDA);
    console.log(`\n[${ancho}px] ${p.id}  main útil=${r.anchoUtilMain}  ·  filas/tarjetas con datos: ${r.tarjetas}`);
    if (r.tarjetas === 0) console.log("   ⚠️ SIN DATOS — cualquier 0 de acá abajo NO prueba nada");
    for (const t of r.tablas) {
      if (t.filas === 0) continue;
      console.log(
        `   tabla ${t.cols} col × ${t.filas} filas · caja=${t.utilDelContenedor} · min-width CSS=${t.minCSS} · ` +
        `MÍNIMO REAL=${t.minimoReal} · preferido=${t.preferido} → ${t.minimoReal <= t.utilDelContenedor ? "ENTRA" : "NO ENTRA"}`,
      );
      console.log("      " + t.cabeceras.map((c) => `${c.txt}:${c.px}`).join(" | "));
    }
    // Sin umbrales: si acá aparece algo que no sea un texto con puntos
    // suspensivos (hoja de texto), es arrastre de verdad por chico que sea.
    const sospechosos = r.crudos.filter((c) => !c.hoja);
    if (sospechosos.length === 0) {
      console.log("   crudo (sin umbral): nada que recorte ni arrastre, fuera de textos con puntos suspensivos");
    } else {
      for (const c of sospechosos) {
        console.log(`   ⚠️ crudo ${String(c.sobraPx).padStart(4)} px  ${c.arrastrable ? "arrastra" : "RECORTA "}  ${c.etiqueta}`);
      }
    }
  }
  await ctx.close();
}
await nav.close();
