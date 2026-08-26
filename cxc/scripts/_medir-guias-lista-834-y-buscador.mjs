// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — LA LISTA DE GUÍAS a 390 · 834 · 1024 · 1440, y EL BUSCADOR.
//
// Dos cosas, medidas en el navegador contra el build de producción y con datos
// de producción:
//
//   1. 🔴 **LA COLUMNA DEL TRANSPORTISTA A 834 px.** El barrido del iPhone la
//      encontró en 0 px: «Edwin» y «Entrega directa» se veían como UNA LETRA.
//      Es el mismo defecto que `FormulasConfig` (PR #639): una fila de columnas
//      de ANCHO FIJO que suman más que el viewport, y la única columna elástica
//      —`flex-1 truncate`, cuyo `min-width` lo anula el `overflow-hidden` del
//      `truncate`— se aplasta a CERO en vez de quedarse corta.
//      Se mide el ANCHO REAL de cada celda de la fila, no el alto.
//
//   2. 🔴 **EL BUSCADOR CONTRA LOS TRES NOMBRES.** Desde #638 la pantalla
//      muestra el nombre del cliente ATADO y el buscador solo miraba el texto
//      TECLEADO: quien lee lo que ve y lo escribe NO encontraba la guía.
//      Se teclea de verdad y se cuentan las filas que quedan.
//
//   BASE=http://localhost:3213 ETAPA=despues node scripts/_medir-guias-lista-834-y-buscador.mjs
//   BASE=http://localhost:3214 ETAPA=antes   node scripts/_medir-guias-lista-834-y-buscador.mjs
//
// 🔴 NO TOCA NINGUNA GUÍA: el navegador ABORTA todo pedido que no sea GET.
//
// 🩸 GOTCHAS DE LA CASA:
//   · la lista dibuja los DOS layouts (fila `hidden md:flex` y tarjeta
//     `md:hidden`) y esconde uno con CSS → hay que medir SOLO el visible;
//   · hay que sembrar `sessionStorage.cxc_role` y `delete
//     Navigator.prototype.serviceWorker` ANTES de navegar;
//   · el acordeón NO desmonta las filas cerradas.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3213";
const ETAPA = process.env.ETAPA ?? "despues";
const SALIDA = process.env.SALIDA ?? `/tmp/guias-lista-${ETAPA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

/**
 * 🔴 LAS BÚSQUEDAS, elegidas contra los datos REALES de producción.
 *
 * `Sporting Shoes` es EL caso: 21 renglones escritos «Sporting Shoes N4» están
 * atados a D-142, que se llama «Sporting Shoes N 4» (con espacio). Lo que se ve
 * en pantalla es el nombre CON espacio; lo que estaba guardado en el texto es
 * el de SIN espacio. Antes de este arreglo, teclear lo que se ve daba 0.
 */
const BUSQUEDAS = [
  { q: "Sporting Shoes N4", que: "el TIPEO guardado (tiene que seguir andando)", exigeDespues: ">0", exigeAntes: ">0" },
  { q: "Sporting Shoes N 4", que: "el NOMBRE OFICIAL, el que se VE en pantalla", exigeDespues: ">0", exigeAntes: null },
  { q: "D-142", que: "el CÓDIGO del cliente atado", exigeDespues: ">0", exigeAntes: null },
  { q: "D-25", que: "el CÓDIGO de City Mall Paso Canoa", exigeDespues: ">0", exigeAntes: null },
  // 🔴 CONTROL NEGATIVO. Sin esto, "encontró algo" no distingue entre buscar
  // bien y no filtrar nada: la lista muestra 15 filas por página y el contador
  // satura. Si esto devuelve algo, el filtro está roto al revés.
  { q: "zapateria que no existe", que: "CONTROL: no es de nadie", exigeDespues: "0", exigeAntes: "0" },
];

mkdirSync(SALIDA, { recursive: true });

const visibleFn = `(e) => {
  const r = e.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const s0 = getComputedStyle(e);
  if (s0.visibility === "hidden" || s0.display === "none") return false;
  for (let p = e.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.visibility === "hidden" || s.display === "none") return false;
  }
  return true;
}`;

/** El ancho de cada celda de la PRIMERA fila visible de la lista. */
const MEDIR_FILA = new Function(`
  const visible = ${visibleFn};
  const de = document.documentElement;
  // La fila de escritorio: el contenedor 'hidden md:flex'. Se toma el PRIMERO
  // que esté realmente visible, para no medir el layout escondido.
  // 🩸 SE MIRAN TODAS LAS FILAS, no la primera. Los chips ámbar ("Falta N°
  // transportista", "Salió incompleta") solo salen en ALGUNAS guías y son los
  // que empujan la fila: medir la de arriba de todo daba verde sobre el caso
  // fácil. El selector cubre los dos cortes posibles (md y lg) para poder
  // comparar main contra la rama con EL MISMO archivo.
  const SEL_FILA = "div.hidden.md\\\\:flex, div.hidden.lg\\\\:flex";
  const SEL_TARJETA = "div.md\\\\:hidden, div.lg\\\\:hidden";
  const filas = [...document.querySelectorAll(SEL_FILA)].filter(visible);
  const tarjetas = [...document.querySelectorAll(SEL_TARJETA)].filter(visible);
  const usada = filas[0] || tarjetas[0] || null;
  // El peor caso de TODAS las filas visibles: cualquier celda aplastada a 0.
  const todas = (filas.length ? filas : tarjetas);
  const peores = [];
  for (const f of todas) {
    for (const sp of [...f.querySelectorAll("span")].filter(visible)) {
      const w = Math.round(sp.getBoundingClientRect().width);
      const t = (sp.textContent || "").trim();
      if (!t) continue;
      // El resumen de clientes es la celda gris chica; el resto (transportista,
      // fecha, bultos…) es texto de primera línea. Truncar un RESUMEN con
      // puntos suspensivos es aceptable —dice "y 3 más" y se abre de un
      // toque—; aplastar el transportista a una letra, no.
      const esResumen = /text-gray-400/.test(sp.getAttribute("class") || "");
      if (w <= 2) peores.push({ tipo: "cero", t: t.slice(0, 28), w });
      else if (sp.scrollWidth - sp.clientWidth > 1)
        peores.push({ tipo: esResumen ? "resumen-corto" : "no-entra", t: t.slice(0, 28), w });
    }
  }
  const celdas = usada
    ? [...usada.children].map((c) => ({
        t: (c.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 28),
        w: Math.round(c.getBoundingClientRect().width),
        cls: (c.getAttribute("class") || c.tagName).slice(0, 40),
      }))
    : [];
  // El transportista es la celda 'flex-1' de la fila de escritorio; en la
  // tarjeta es la que lleva 'truncate' al lado del número.
  const conChip = todas.filter((f) => /Falta N|Salió incompleta/.test(f.textContent || "")).length;
  const transp = usada
    ? [...usada.querySelectorAll("span")].filter(visible).map((s) => ({
        t: (s.textContent || "").trim().slice(0, 28),
        w: Math.round(s.getBoundingClientRect().width),
        clampeado: s.scrollWidth - s.clientWidth > 1,
      }))
    : [];
  return {
    layout: filas.length ? "fila-escritorio" : tarjetas.length ? "tarjeta" : "?",
    arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth),
    altoPagina: Math.max(de.scrollHeight, document.body.scrollHeight),
    celdas,
    // 🔴 EL NÚMERO DEL DEFECTO: celdas visibles de ancho 0 o casi.
    celdasEnCero: celdas.filter((c) => c.w <= 2).map((c) => c.cls),
    filasConChip: conChip,
    // 🔴 EL NÚMERO DEL DEFECTO, sobre TODAS las filas visibles.
    spansEnCero: peores.filter((p) => p.tipo === "cero").map((p) => p.t),
    // Textos que NO entran (se cortan con puntos suspensivos).
    spansClampeados: peores.filter((p) => p.tipo === "no-entra").map((p) => ({ t: p.t, w: p.w })),
    resumenesCortos: peores.filter((p) => p.tipo === "resumen-corto").map((p) => ({ t: p.t, w: p.w })),
    filasEnPantalla: todas.length,
    // 🔴 El nombre del cliente NO puede volver a salir dos veces (#638).
    textoDeLaPrimeraFila: usada ? (usada.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 160) : "",
  };
  `);

const informe = {};
const problemas = [];
const notas = [];
const nav = await chromium.launch();

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();

  const escrituras = [];
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") { escrituras.push(`${req.method()} ${req.url().replace(BASE, "")}`); return route.abort(); }
    return route.continue();
  });

  await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /guías de despacho/i.test(document.body.innerText), null, { timeout: 30000 });
  // 🩸 `waitForSelector` agarra el PRIMER match, que a 390 px es la fila de
  // escritorio ESCONDIDA por CSS: esperarla a que "sea visible" no termina
  // nunca. Se espera a que haya al menos una fila REALMENTE visible.
  await page.waitForFunction(() => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== "none";
    };
    return [...document.querySelectorAll("div.hidden.md\\:flex, div.hidden.lg\\:flex, div.md\\:hidden, div.lg\\:hidden")].some(vis);
  }, null, { timeout: 25000 });
  await page.waitForTimeout(1800);

  const fila = await page.evaluate(MEDIR_FILA);
  await page.screenshot({ path: `${SALIDA}/lista-${ancho}.png`, fullPage: false });

  // ── EL BUSCADOR, tecleado de verdad ───────────────────────────────────────
  const buscador = page.locator('input[placeholder*="Buscar"]').locator("visible=true").first();
  const busquedas = {};
  // Cuenta las filas VISIBLES que quedan. El "No hay guías" manda: cuando la
  // lista se vacía no queda ninguna fila, pero el candado tiene que leerlo
  // explícitamente y no deducirlo de un 0.
  // 🩸 CONTAR LAS FILAS EN PANTALLA NO ALCANZA: la lista muestra 15 por página,
  // así que el contador SATURA en 15 y "encontró algo" no se distingue de "no
  // filtró nada". El total de verdad lo dice el propio botón «Ver más (N
  // restantes)»; sin botón, lo que se ve ES el total.
  const CONTAR = new Function(`
    const visible = ${visibleFn};
    if (/No hay guías/i.test(document.body.innerText)) return 0;
    const enPantalla = [...document.querySelectorAll("div.hidden.md\\\\:flex, div.hidden.lg\\\\:flex, div.md\\\\:hidden, div.lg\\\\:hidden")].filter(visible).length;
    const m = (document.body.innerText.match(/Ver más \\((\\d+) restantes\\)/) || [])[1];
    return m ? enPantalla + Number(m) : enPantalla;
  `);
  const contarFilas = async () => await page.evaluate(CONTAR);

  for (const b of BUSQUEDAS) {
    await buscador.click();
    await buscador.fill("");
    await page.waitForTimeout(250);
    await buscador.fill(b.q);
    await page.waitForTimeout(900);
    busquedas[b.q] = { filas: await contarFilas(), que: b.que };
    if (ancho === 834) await page.screenshot({ path: `${SALIDA}/buscar-${b.q.replace(/[^a-z0-9]+/gi, "_")}.png` });
  }
  await buscador.fill("");
  await page.waitForTimeout(500);

  informe[ancho] = { fila, busquedas, escrituras };

  // ── candados ──────────────────────────────────────────────────────────────
  if (!fila.filasEnPantalla) problemas.push(`🔴 ${ancho}: 0 filas de guía en pantalla — el medidor no midió nada`);
  if (fila.arrastrePagina > 0) problemas.push(`🔴 ${ancho}: ${fila.arrastrePagina} px de arrastre horizontal de la página`);

  if (ETAPA === "antes") {
    for (const b of BUSQUEDAS) {
      if (b.exigeAntes === "0" && informe[ancho].busquedas[b.q].filas)
        problemas.push(`🔴 ${ancho} (main): el CONTROL «${b.q}» devolvió filas`);
    }
    if (fila.spansEnCero.length) notas.push(`ℹ️ ${ancho} (main): ${fila.spansEnCero.length} textos aplastados a 0 px`);
    if (fila.celdasEnCero.length) notas.push(`ℹ️ ${ancho} (main): ${fila.celdasEnCero.length} celdas de 0 px`);
  } else {
    if (fila.spansEnCero.length)
      problemas.push(`🔴 ${ancho}: ${fila.spansEnCero.length} textos APLASTADOS A 0 px — ${JSON.stringify(fila.spansEnCero)}`);
    if (fila.celdasEnCero.length)
      problemas.push(`🔴 ${ancho}: ${fila.celdasEnCero.length} celdas de 0 px — ${JSON.stringify(fila.celdasEnCero)}`);
    if (fila.spansClampeados.length)
      problemas.push(`🔴 ${ancho}: ${fila.spansClampeados.length} textos que NO ENTRAN — ${JSON.stringify(fila.spansClampeados)}`);
    if (fila.resumenesCortos.length)
      notas.push(`ℹ️ ${ancho}: ${fila.resumenesCortos.length} resúmenes de cliente con puntos suspensivos (ancho ${fila.resumenesCortos[0].w} px) — aceptable, se abre de un toque`);
    for (const b of BUSQUEDAS) {
      const r = informe[ancho].busquedas[b.q];
      if (b.exigeDespues === ">0" && !r.filas) problemas.push(`🔴 ${ancho}: buscar «${b.q}» (${b.que}) devolvió 0 guías`);
      if (b.exigeDespues === "0" && r.filas) problemas.push(`🔴 ${ancho}: el CONTROL «${b.q}» devolvió ${r.filas} guías — el filtro no está filtrando`);
    }
  }

  const sobreLaGuia = escrituras.filter((e) => /\/api\/guias/.test(e));
  if (sobreLaGuia.length) problemas.push(`🔴 ${ancho}: se intentó escribir sobre una guía — ${JSON.stringify(sobreLaGuia)}`);

  await ctx.close();
}
await nav.close();

writeFileSync(`${SALIDA}/informe.json`, JSON.stringify(informe, null, 2));

console.log(`\n═══ LISTA DE GUÍAS · ${ETAPA} · BASE=${BASE} ═══`);
console.log("\n── el ancho de las celdas de la fila (la de arriba de todo) ──");
for (const a of ANCHOS) {
  const f = informe[a].fila;
  console.log(`\n  ${a} px · layout ${f.layout} · ${f.filasEnPantalla} filas (${f.filasConChip} con chip ámbar) · alto ${f.altoPagina} · arrastre ${f.arrastrePagina}`);
  for (const c of f.celdas) console.log(`      ${String(c.w).padStart(5)} px  «${c.t}»`);
  if (f.spansEnCero.length) console.log(`      🔴 EN CERO: ${JSON.stringify(f.spansEnCero)}`);
  if (f.spansClampeados.length) console.log(`      🔴 no entran: ${JSON.stringify(f.spansClampeados)}`);
  if (f.resumenesCortos.length) console.log(`      ℹ️ resúmenes con "…": ${f.resumenesCortos.length} (a ${f.resumenesCortos[0].w} px)`);
}
console.log("\n── el buscador (GUÍAS que quedan, contando las de «Ver más») ──");
for (const a of ANCHOS) {
  console.log(`  ${a}:`);
  for (const b of BUSQUEDAS) {
    const r = informe[a].busquedas[b.q];
    console.log(`      «${b.q}» → ${String(r.filas).padStart(3)} guías   (${b.que})`);
  }
}
console.log(`\ncapturas en ${SALIDA}`);
if (notas.length) { console.log("\nNOTAS:"); for (const n of notas) console.log("  -", n); }
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
