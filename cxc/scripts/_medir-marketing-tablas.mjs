// Medición REAL en navegador del RECORTE de las tablas de Marketing.
//
// 🩸 POR QUÉ. Dos pantallas de Marketing tienen una tabla dentro de un
// contenedor con `overflow-hidden` y SIN scroller propio adentro. Cuando falta
// el scroller no hay ni siquiera la salida de arrastrar: los px que se salen
// de la caja NO se pueden ver de ninguna forma.
//   * /marketing?vista=anulados  → se pierden los botones Restaurar/Eliminar.
//   * /marketing/mobiliario      → se pierden 4 de 8 columnas del inventario.
//
// Mide las TRES formas de "se sale para el costado", igual que
// _medir-comisiones-tabla.mjs:
//   A. ARRASTRE DE LA PÁGINA — documentElement.scrollWidth − clientWidth.
//   B. ARRASTRE INTERNO — px scrolleables de cada ancestro con overflow-x.
//   C. RECORTE — px de la tabla FUERA de la caja del ancestro que recorta y
//      que no se pueden alcanzar arrastrando nada.
// Y además:
//   D. ANCHO ÚTIL — el ancho de <main> menos su padding. Es el número que
//      decide, NO el viewport.
//   E. TARGETS TÁCTILES < 44px dentro de <main>.
//   F. Presencia de los botones Restaurar/Eliminar y de las columnas.
//
// GOTCHAS (no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o todo redirige al login.
//   * Hay que sembrar sessionStorage.cxc_role: useAuth lo lee de AHÍ.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//   * NUNCA se hace click en nada: esta pantalla tiene botones "Eliminar".
//
//   ETAPA=antes   PORT=3170 node scripts/_medir-marketing-tablas.mjs
//   ETAPA=despues PORT=3170 node scripts/_medir-marketing-tablas.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const PORT = process.env.PORT ?? "3170";
const BASE = process.env.BASE ?? `http://localhost:${PORT}`;
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const ETAPA = process.env.ETAPA ?? "antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true },
  { nombre: "834", width: 834, height: 1194, movil: true },
  { nombre: "1440", width: 1440, height: 900, movil: false },
];

const PANTALLAS = [
  { clave: "anulados", url: "/marketing?vista=anulados" },
  { clave: "mobiliario", url: "/marketing/mobiliario" },
];

const MEDIR = `(() => {
  const doc = document.documentElement;
  const arrastrePagina = doc.scrollWidth - doc.clientWidth;

  const main = document.querySelector("main");
  let anchoUtil = null;
  if (main) {
    const cs = getComputedStyle(main);
    anchoUtil = Math.round(
      main.getBoundingClientRect().width -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight),
    );
  }

  function medirTabla(tabla) {
    const rTabla = tabla.getBoundingClientRect();
    const contenedores = [];
    let recorte = 0;
    let arrastreInterno = 0;
    // Una vez que aparece un contenedor que SI arrastra, los overflow-hidden de
    // mas arriba dejan de recortar: lo que sobresale ya se alcanza arrastrando.
    let hayScrollerDebajo = false;
    for (let el = tabla.parentElement; el && el !== document.body; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === "visible") continue;
      const ax = el.scrollWidth - el.clientWidth;
      const r = el.getBoundingClientRect();
      const puedeArrastrar = cs.overflowX === "auto" || cs.overflowX === "scroll";
      const fuera = puedeArrastrar || hayScrollerDebajo
        ? 0
        : Math.max(0, Math.round(rTabla.right - r.right)) +
          Math.max(0, Math.round(r.left - rTabla.left));
      contenedores.push({
        etiqueta: el.tagName.toLowerCase() + "." + (el.className || "").toString().split(/\\s+/).slice(0, 3).join("."),
        overflowX: cs.overflowX,
        scrollableX: ax,
        recortaPx: fuera,
      });
      if (puedeArrastrar && ax > 0) hayScrollerDebajo = true;
      if (puedeArrastrar) arrastreInterno = Math.max(arrastreInterno, ax);
      recorte = Math.max(recorte, fuera);
    }
    const enc = tabla.querySelector("thead tr");
    return {
      anchoVisual: Math.round(rTabla.width),
      anchoContenido: tabla.scrollWidth,
      columnas: enc ? enc.children.length : 0,
      encabezados: enc ? Array.from(enc.children).map((c) => (c.textContent || "").trim()) : [],
      filas: tabla.querySelectorAll("tbody tr").length,
      arrastreInterno,
      recorte,
      contenedores,
    };
  }

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const tablas = Array.from(document.querySelectorAll("main table")).filter(visible).map(medirTabla);

  // Targets tactiles chicos dentro de main.
  // El AREA QUE RESPONDE AL DEDO de un <input> dentro de un <label> es la del
  // LABEL, no la del input: una casilla de 18px dentro de un label de 44px se
  // toca bien. Medir el input daria un falso positivo.
  const chicos = [];
  for (const el of document.querySelectorAll("main button, main a, main input, main select, main [role=button]")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    let caja = r;
    const lab = el.closest("label");
    if (lab && (el.tagName === "INPUT" || el.tagName === "SELECT")) {
      const rl = lab.getBoundingClientRect();
      if (rl.height > caja.height) caja = rl;
    }
    if (caja.height < 44) {
      chicos.push({
        etiqueta: el.tagName.toLowerCase() + (el.type ? "[" + el.type + "]" : ""),
        texto: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 28),
        w: Math.round(caja.width),
        h: Math.round(caja.height),
      });
    }
  }

  // Visibilidad REAL de acciones y datos. Se busca por data- fijo, NUNCA por
  // clase de breakpoint: si el corte se mueve, la busqueda por .md\\\\:hidden
  // devuelve vacio y el chequeo pasa sin comparar nada.
  function visibles(sel) {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Alcanzable = su caja cae dentro del viewport horizontal O algun
      // ancestro puede arrastrarse hasta el.
      let alcanzable = true;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === "hidden") {
          const ra = a.getBoundingClientRect();
          if (r.right > ra.right + 1 || r.left < ra.left - 1) { alcanzable = false; break; }
        }
        if (cs.overflowX === "auto" || cs.overflowX === "scroll") break;
      }
      out.push({ texto: (el.textContent || "").trim().slice(0, 24), alcanzable });
    }
    return out;
  }

  // Filas de dato VISIBLES. Se buscan por data- fijo, NUNCA por clase de
  // breakpoint: si el corte se mueve, .md\\\\:hidden devuelve vacio y el chequeo
  // pasaria sin comparar nada.
  const filasDato = Array.from(document.querySelectorAll("[data-fg-fila]"))
    .filter(visible)
    .map((el) => ({
      id: el.getAttribute("data-fg-fila"),
      campos: Object.fromEntries(
        Array.from(el.querySelectorAll("[data-fg-campo]")).map((c) => [
          c.getAttribute("data-fg-campo"),
          (c.textContent || "").trim(),
        ]),
      ),
    }));

  return {
    anchoViewport: window.innerWidth,
    anchoUtil,
    arrastrePagina,
    tablas,
    targetsChicos: chicos.length,
    targetsChicosDetalle: chicos.slice(0, 12),
    accionRestaurar: visibles("[data-fg-accion=restaurar]"),
    accionEliminar: visibles("[data-fg-accion=eliminar]"),
    tarjetas: Array.from(document.querySelectorAll("[data-fg-tarjeta]")).filter(visible).length,
    tablasVisibles: Array.from(document.querySelectorAll("main table")).filter(visible).length,
    filasDato,
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const p of PANTALLAS) {
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
    const erroresJs = [];
    page.on("pageerror", (e) => erroresJs.push(String(e.message)));

    await page.goto(`${BASE}${p.url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    const r = { etapa: ETAPA, pantalla: p.clave, tamano: t.nombre };
    Object.assign(r, await page.evaluate(MEDIR));
    r.erroresJs = erroresJs.slice(0, 3);
    await page.screenshot({
      path: path.join(SALIDA, `mkt-${p.clave}-${ETAPA}-${t.nombre}.png`),
      fullPage: true,
    });

    const peor = r.tablas.reduce((m, x) => Math.max(m, x.recorte), 0);
    console.error(
      `[${ETAPA}] ${p.clave.padEnd(11)} @${t.nombre.padEnd(5)} util ${String(r.anchoUtil).padStart(4)}px  tablas ${r.tablas.length}  RECORTE ${String(peor).padStart(4)}px  arrastreInt ${r.tablas.map((x) => x.arrastreInterno).join("/")}  tarjetas ${r.tarjetas}  targets<44 ${r.targetsChicos}`,
    );
    resultados.push(r);
    await ctx.close();
  }
}

await navegador.close();
const dest = path.join(SALIDA, `mkt-medicion-${ETAPA}.json`);
writeFileSync(dest, JSON.stringify(resultados, null, 2));
console.error(`\nJSON → ${dest}`);
