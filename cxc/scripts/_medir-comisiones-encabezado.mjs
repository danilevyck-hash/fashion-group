// Medición REAL en navegador de /comisiones (build de producción, datos de producción).
//
// Mide lo que pide el gate:
//   1. Alto del ENCABEZADO = del borde superior del contenido hasta el primer
//      número de comisión de la tabla.
//   2. Cuántas filas de vendedores entran en la primera pantalla.
//   3. Arrastre lateral (scroll horizontal) — tiene que ser 0.
//   4. Targets táctiles < 44px dentro del encabezado.
//   5. Capturas.
//
// GOTCHAS (no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o todo redirige al login.
//   * Hay que sembrar sessionStorage.cxc_role: useAuth lo lee de AHÍ.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura: nunca toca "Actualizar ahora" ni "Excel".

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3157";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const PREFIJO = process.env.PREFIJO ?? "comisiones-ios-antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "iphone-390", width: 390, height: 844, movil: true },
  { nombre: "ipad-834", width: 834, height: 1112, movil: true },
  { nombre: "escritorio-1440", width: 1440, height: 900, movil: false },
];

// Safari en iPhone: la barra de direcciones + la de pestañas se comen ~180px.
const ALTO_UTIL_SAFARI = 664;

const MEDIR = `(() => {
  const main = document.querySelector("main");
  if (!main) return { error: "sin <main>" };
  const mainTop = main.getBoundingClientRect().top + window.scrollY;

  // Primer número de comisión. DOS layouts, y el de celular no tiene tabla:
  // desde el #365 la tabla va oculta bajo md y en su lugar hay TARJETAS
  // (data-comision-card). La tabla SIGUE en el DOM con display:none, así que
  // un querySelector a ciegas devolvería una fila de alto 0 en la posición 0
  // y el encabezado saldría NEGATIVO. Se toma lo que de verdad se ve.
  const seVe = (el) => el && el.getBoundingClientRect().height > 0;
  const filas = [
    ...document.querySelectorAll("main table tbody tr"),
    ...document.querySelectorAll("main [data-comision-card]"),
  ].filter(seVe);
  const fila = filas[0] ?? null;
  const celda = fila ? (fila.querySelector("td") ?? fila.querySelector("span + span")) : null;
  const filaTop = fila ? fila.getBoundingClientRect().top + window.scrollY : null;

  const contar = (alto) => filas.filter((tr) => {
    const r = tr.getBoundingClientRect();
    return r.bottom + window.scrollY <= alto && r.height > 0;
  }).length;

  // Targets del encabezado (todo lo que está sobre la tabla o las tarjetas).
  const tabla = seVe(document.querySelector("main table"))
    ? document.querySelector("main table")
    : fila;
  const tablaTop = tabla ? tabla.getBoundingClientRect().top + window.scrollY : Infinity;
  const chicos = [];
  for (const el of document.querySelectorAll("main button, main [role='combobox'], main a[href], main input, main select")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.top + window.scrollY >= tablaTop) continue;
    if (r.height < 44 || r.width < 44) {
      chicos.push({
        etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 32),
        alto: +r.height.toFixed(1),
        ancho: +r.width.toFixed(1),
      });
    }
  }

  // Desglose: barra de controles (lo que este PR controla) vs. tabla.
  const barra = main.firstElementChild;                 // <div class="space-y-2">
  const thead = document.querySelector("main table thead");

  // Holgura de la fila de acciones: cuánto sobra entre lo que miden los
  // controles y el ancho disponible. Si esto llega a 0 la fila se parte.
  const fila2 = barra ? barra.children[1] : null;
  let holguraFila2 = null;
  if (fila2) {
    const hijos = [...fila2.children];
    const suma = hijos.reduce((a, c) => a + c.getBoundingClientRect().width, 0);
    const gaps = (hijos.length - 1) * parseFloat(getComputedStyle(fila2).columnGap || "0");
    holguraFila2 = +(fila2.getBoundingClientRect().width - suma - gaps).toFixed(1);
  }

  return {
    mainTop: +mainTop.toFixed(1),                       // alto del AppHeader sticky
    barraTop: barra ? +(barra.getBoundingClientRect().top + window.scrollY - mainTop).toFixed(1) : null,
    tablaTopDesdeMain: tabla ? +(tablaTop - mainTop).toFixed(1) : null,
    theadAlto: thead ? +thead.getBoundingClientRect().height.toFixed(1) : null,
    holguraFila2,
    encabezadoPx: filaTop === null ? null : +(filaTop - mainTop).toFixed(1),
    primerNumeroDesdeArribaPx: filaTop === null ? null : +filaTop.toFixed(1),
    primerNumero: celda ? celda.textContent.trim().slice(0, 24) : null,
    filasTotales: filas.length,
    filasVisiblesViewport: contar(window.innerHeight),
    filasVisiblesSafariReal: contar(${ALTO_UTIL_SAFARI}),
    arrastreLateral: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    targetsChicos: chicos,
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const t of TAMANOS) {
  const ctx = await navegador.newContext({
    viewport: { width: t.width, height: t.height },
    deviceScaleFactor: 2,
    ...(t.movil ? { hasTouch: true, isMobile: false } : {}),
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
  });

  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e.message)));

  await page.goto(`${BASE}/comisiones`, { waitUntil: "networkidle" });
  await page.waitForSelector("main table tbody tr", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);

  const r = { tamano: t.nombre, viewport: `${t.width}x${t.height}` };
  Object.assign(r, await page.evaluate(MEDIR));
  r.erroresJs = errores;
  await page.screenshot({ path: path.join(SALIDA, `${PREFIJO}-${t.nombre}.png`) });

  // El período es un solo control: se abre, se elige otro mes y la tabla
  // recarga. Se prueba MAYO del año anterior — "May" es el mes abreviado MÁS
  // ANCHO (67.4px contra 58.8 de "Jul", medido con la fuente real), o sea el
  // peor caso de ancho de la fila, y de paso ejercita el paso de año.
  const periodo = page.locator('button[aria-haspopup="dialog"][aria-label^="Período"]');
  if (await periodo.count()) {
    await periodo.first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SALIDA, `${PREFIJO}-${t.nombre}-periodo.png`) });
    await page.getByRole("button", { name: "Año anterior" }).click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Mayo", exact: true }).click();
    await page.waitForTimeout(1500);
    r.periodoMesMasAncho = await page.evaluate(MEDIR);
    r.periodoLabel = (await periodo.first().getAttribute("aria-label")) ?? null;
    // Volver al mes en curso para las capturas siguientes.
    await periodo.first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Año siguiente" }).click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "Julio", exact: true }).click();
    await page.waitForTimeout(1500);
  }

  // El ⓘ guarda los criterios Y la fecha de sincronizado.
  const info = page.getByRole("button", { name: "Cómo se calcula y cuándo se actualizó" });
  if (await info.count()) {
    await info.first().click();
    await page.waitForTimeout(300);
    r.infoTexto = (await page.getByRole("dialog", { name: "Criterios de la comisión" }).innerText()).replace(/\s+/g, " ").slice(0, 260);
    await page.screenshot({ path: path.join(SALIDA, `${PREFIJO}-${t.nombre}-criterios.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  r.excelHabilitado = await page.getByRole("button", { name: "Excel" }).isEnabled().catch(() => null);

  // Modo "Por empresa" — el otro camino del mismo encabezado.
  const porEmpresa = page.getByRole("button", { name: "Por empresa", exact: true });
  if (await porEmpresa.count()) {
    await porEmpresa.first().click();
    await page.waitForTimeout(1200);
    r.porEmpresa = await page.evaluate(MEDIR);
    await page.screenshot({ path: path.join(SALIDA, `${PREFIJO}-${t.nombre}-por-empresa.png`) });
  }

  resultados.push(r);
  await ctx.close();
}

await navegador.close();
console.log(JSON.stringify(resultados, null, 2));
