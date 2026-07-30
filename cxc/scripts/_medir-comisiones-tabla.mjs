// Medición REAL en navegador del ARRASTRE LATERAL de la tabla de /comisiones.
//
// 🩸 POR QUÉ. En el iPhone la tabla de Comisiones tenía 7 columnas (Vendedor +
// 5 empresas + Total) en "Todas las empresas" y 6 en "Por empresa". A 390px de
// ancho eso no entra: o la página se arrastra para el costado, o el contenedor
// interno (`overflow-x-auto`) se vuelve scrolleable, o —peor— el `Card` con
// `overflow-hidden` la RECORTA y los números de la derecha no se pueden ver de
// ninguna manera. Daniel: en el celular, tabla ancha → TARJETAS.
//
// Este script mide las TRES formas de "se sale para el costado":
//   A. ARRASTRE DE LA PÁGINA — documentElement.scrollWidth − clientWidth.
//   B. ARRASTRE INTERNO — de cada ancestro de la tabla con overflow-x, cuántos
//      px se pueden scrollear. Es el que esconde la columna Total.
//   C. RECORTE — cuántos px de la tabla quedan FUERA de la caja del ancestro
//      que recorta (los que no se pueden ver ni scrolleando).
//
// GOTCHAS (no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o todo redirige al login.
//   * Hay que sembrar sessionStorage.cxc_role: useAuth lo lee de AHÍ.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura: nunca toca "Actualizar ahora" ni "Excel".
//
//   ETAPA=antes node scripts/_medir-comisiones-tabla.mjs
//   ETAPA=despues node scripts/_medir-comisiones-tabla.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3164";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const ETAPA = process.env.ETAPA ?? "antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true },
  { nombre: "834", width: 834, height: 1194, movil: true },
  { nombre: "1440", width: 1440, height: 900, movil: false },
];

const MEDIR = `(() => {
  const doc = document.documentElement;
  const arrastrePagina = doc.scrollWidth - doc.clientWidth;

  const tabla = document.querySelector("main table");
  if (!tabla) {
    // Sin tabla: o es el layout de tarjetas, o no cargó.
    const tarjetas = document.querySelectorAll("main [data-comision-card]").length;
    return { arrastrePagina, tabla: null, tarjetas, arrastreInterno: 0, recorte: 0 };
  }

  const rTabla = tabla.getBoundingClientRect();
  const contenedores = [];
  let recorte = 0;
  let arrastreInterno = 0;
  // ATENCION: una vez que en el camino hacia arriba aparece un contenedor que
  // SI arrastra, los overflow-hidden de mas arriba dejan de recortar contenido:
  // lo que sobresale ya se puede alcanzar arrastrando ese contenedor. Sin este
  // estado, el Card con overflow-hidden que envuelve al overflow-x-auto se
  // contaba como recorte y daba un falso positivo de ~430px.
  let hayScrollerDebajo = false;
  for (let el = tabla.parentElement; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el);
    const recortaX = cs.overflowX !== "visible";
    if (!recortaX) continue;
    const ax = el.scrollWidth - el.clientWidth;
    const r = el.getBoundingClientRect();
    // Cuántos px de la tabla caen fuera de esta caja Y NO se pueden alcanzar.
    const puedeArrastrar = cs.overflowX === "auto" || cs.overflowX === "scroll";
    const fuera = puedeArrastrar || hayScrollerDebajo
      ? 0
      : Math.max(0, Math.round(rTabla.right - r.right)) + Math.max(0, Math.round(r.left - rTabla.left));
    contenedores.push({
      etiqueta: el.tagName.toLowerCase() + "." + (el.className || "").toString().split(/\\s+/).slice(0, 3).join("."),
      overflowX: cs.overflowX,
      scrollableX: ax,
      recortaPx: fuera,
    });
    if (puedeArrastrar && ax > 0) hayScrollerDebajo = true;
    // Arrastre = lo que el dedo PUEDE mover. Un overflow-hidden con
    // scrollWidth mayor que clientWidth no es arrastre: es recorte.
    if (puedeArrastrar) arrastreInterno = Math.max(arrastreInterno, ax);
    recorte = Math.max(recorte, fuera);
  }

  return {
    arrastrePagina,
    arrastreInterno,
    recorte,
    contenedores,
    tabla: {
      anchoVisual: Math.round(rTabla.width),
      anchoContenido: tabla.scrollWidth,
      columnas: (tabla.querySelector("thead tr") || { children: [] }).children.length,
      filas: tabla.querySelectorAll("tbody tr").length,
    },
    tarjetas: document.querySelectorAll("main [data-comision-card]").length,
    anchoViewport: window.innerWidth,
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
    // El modo de vista se recuerda en localStorage: arrancar siempre en "todas".
    localStorage.setItem("fg_comisiones_mode", "todas");
  });

  const page = await ctx.newPage();
  const erroresJs = [];
  page.on("pageerror", (e) => erroresJs.push(String(e.message)));

  await page.goto(`${BASE}/comisiones`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const r = { etapa: ETAPA, tamano: t.nombre };
  r.todas = await page.evaluate(MEDIR);
  await page.screenshot({
    path: path.join(SALIDA, `comisiones-tabla-${ETAPA}-${t.nombre}-todas.png`),
    fullPage: true,
  });

  const porEmpresa = page.getByRole("button", { name: "Por empresa", exact: true });
  if (await porEmpresa.count()) {
    await porEmpresa.first().click();
    await page.waitForTimeout(2500);
    r.porEmpresa = await page.evaluate(MEDIR);
    await page.screenshot({
      path: path.join(SALIDA, `comisiones-tabla-${ETAPA}-${t.nombre}-por-empresa.png`),
      fullPage: true,
    });
  }

  r.erroresJs = erroresJs.slice(0, 3);
  resultados.push(r);
  console.error(
    `[${ETAPA}] @${t.nombre.padEnd(5)} todas → pagina ${r.todas.arrastrePagina}px  interno ${r.todas.arrastreInterno}px  recorte ${r.todas.recorte}px` +
    (r.porEmpresa ? `   |  empresa → pagina ${r.porEmpresa.arrastrePagina}px  interno ${r.porEmpresa.arrastreInterno}px  recorte ${r.porEmpresa.recorte}px` : ""),
  );
  await ctx.close();
}

await navegador.close();
console.log(JSON.stringify(resultados, null, 2));
