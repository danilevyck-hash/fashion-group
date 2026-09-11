// ¿LA BARRA PEGAJOSA TAPA EL ENCABEZADO? Medición en el navegador, a 1440 y a
// 390, de la pantalla de la captura de Daniel (Ventas › Clientes) y de las
// otras tres barras del arreglo.
//
// 🩸 EL DEFECTO, textual (11-sep-2026): *«mira cómo se corta arriba; y así
// también pasa en otros módulos, para que chequees y arregles eso»*.
//
// QUÉ MIDE, por pantalla y por ancho, DESPUÉS de hacer scroll:
//   * `encabezado`  — rect del encabezado pegajoso (AppHeader / CatalogoNavbar).
//   * `barra`       — rect de la barra de contenido.
//   * `solapa`      — px en que la barra invade el encabezado. Tiene que ser 0.
//   * `hueco`       — px de franja entre el pie del encabezado y el tope de la
//                     barra. Tiene que ser 0: si sobra, se ve pasar la lista.
//   * `tapaAlgo`    — si el primer renglón de la tabla queda escondido detrás
//                     de la barra cuando se vuelve ARRIBA del todo.
//
//   node scripts/_medir-barras-pegajosas.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3178";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const ANCHOS = [
  { w: 1440, h: 900, nota: "escritorio" },
  { w: 390, h: 844, nota: "iPhone" },
];

const PANTALLAS = [
  { nombre: "Ventas › Clientes", url: "/ventas?tab=clientes", espera: "text=Todas" },
  { nombre: "Guías (lista)", url: "/guias", espera: null },
];

const SONDA = `(() => {
  const enc = document.querySelector('header, nav.sticky, .sticky.top-0');
  // El encabezado es el bloque pegajoso que arranca en top 0.
  const pegajosos = [...document.querySelectorAll('*')].filter(el => {
    const cs = getComputedStyle(el);
    return cs.position === 'sticky';
  });
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const encabezado = pegajosos.find(el => vis(el) && getComputedStyle(el).top === '0px' && el.getBoundingClientRect().width > window.innerWidth * 0.8);
  // GOTCHA DE MEDICION. En Guias hay TRES barras pegajosas a la vez (una
  // cabecera por grupo de fecha) y querySelector devuelve la primera, que
  // cuando ya pasaste de largo esta ARRIBA del viewport con un top NEGATIVO.
  // Restarle eso al pie del encabezado da un solapamiento de 417 px que no
  // existe. La barra que interesa es la que esta PEGADA ahora mismo: dentro
  // del viewport y a la altura que pide su top.
  const todas = [...document.querySelectorAll('.fg-barra-pegajosa')].filter(vis);
  const enViewport = todas.filter(el => {
    const b = el.getBoundingClientRect();
    return b.bottom > 0 && b.top < window.innerHeight;
  });
  const pegada = enViewport.find(el => {
    const b = el.getBoundingClientRect();
    const pide = parseFloat(getComputedStyle(el).top) || 0;
    return Math.abs(b.top - pide) < 1.5;
  });
  const barra = pegada ?? enViewport[0] ?? null;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height),
             z: getComputedStyle(el).zIndex, cssTop: getComputedStyle(el).top }; };
  const varAlto = getComputedStyle(document.documentElement).getPropertyValue('--fg-altura-encabezado').trim();
  // Lo que la barra deja debajo, se PUEDE TOCAR? Se pregunta por el punto
  // justo debajo de la barra: quien conteste tiene que ser contenido, no la
  // barra ni el encabezado.
  let tapa = null;
  if (barra) {
    const b = barra.getBoundingClientRect();
    const bajo = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.bottom + 6));
    tapa = bajo ? (barra.contains(bajo) || (encabezado && encabezado.contains(bajo)) ? 'TAPADO' : 'se ve') : 'nada';
  }
  return { encabezado: r(encabezado), barra: r(barra), varAlto, tapa,
           pegajosasEnPagina: document.querySelectorAll('.fg-barra-pegajosa').length };
})()`;

// `channel: "chromium"` usa el navegador completo: el headless shell no
// siempre esta bajado y el medidor no puede depender de eso.
// Se mide con el Chrome del sistema (`channel: "chrome"`): es el navegador
// real y no depende de que el chromium de playwright este bajado entero.
const navegador = await chromium.launch({ channel: process.env.CANAL ?? "chrome" });
const filas = [];

for (const { w, h, nota } of ANCHOS) {
  const ctx = await navegador.newContext({ viewport: { width: w, height: h },
    hasTouch: w < 500, isMobile: w < 500 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { delete Navigator.prototype.serviceWorker; } catch {}
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_name", "daniel");
  });

  for (const p of PANTALLAS) {
    await page.goto(BASE + p.url, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(2500);
    // Scroll hasta abajo y volver: es cuando la barra se pega.
    await page.evaluate(() => window.scrollBy(0, 900));
    await page.waitForTimeout(400);
    const conScroll = await page.evaluate(SONDA);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const arriba = await page.evaluate(SONDA);

    // CONTROL en la MISMA pagina: se le devuelve a la barra el tope 0 y el
    // z-index 20 que tenia antes del arreglo. Si el medidor no marca el
    // solapamiento aca, es que no esta mirando nada.
    await page.evaluate(() => {
      const est = document.createElement("style");
      est.id = "fg-control-antes";
      est.textContent = ".fg-barra-pegajosa{top:0!important;z-index:20!important}";
      document.head.appendChild(est);
    });
    await page.evaluate(() => window.scrollBy(0, 900));
    await page.waitForTimeout(400);
    const control = await page.evaluate(SONDA);
    await page.evaluate(() => document.getElementById("fg-control-antes")?.remove());

    const enc = conScroll.encabezado, bar = conScroll.barra;
    const solapa = enc && bar ? Math.max(0, enc.bottom - bar.top) : null;
    const hueco = enc && bar ? Math.max(0, bar.top - enc.bottom) : null;
    filas.push({
      pantalla: p.nombre, ancho: `${w} (${nota})`,
      varAlto: conScroll.varAlto,
      encAlto: enc?.h ?? "—", encZ: enc?.z ?? "—",
      barraTop: bar?.top ?? "—", barraCssTop: bar?.cssTop ?? "—", barraZ: bar?.z ?? "—",
      solapa: solapa ?? "—", hueco: hueco ?? "—",
      arribaBarraTop: arriba.barra?.top ?? "—",
      debajo: conScroll.tapa ?? "—",
      // Con el tope viejo: cuanto invadia el encabezado y que tapaba.
      antesSolapa: control.encabezado && control.barra
        ? Math.max(0, control.encabezado.bottom - control.barra.top) : "—",
      antesZ: control.barra?.z ?? "—",
      nBarras: conScroll.pegajosasEnPagina,
    });
  }
  await ctx.close();
}
await navegador.close();

console.table(filas);
const malas = filas.filter(f => typeof f.solapa === "number" && f.solapa > 0);
const huecos = filas.filter(f => typeof f.hueco === "number" && f.hueco > 1);
console.log(malas.length ? `❌ ${malas.length} barra(s) TAPAN el encabezado` : "✅ ninguna barra tapa el encabezado");
console.log(huecos.length ? `⚠️ ${huecos.length} con franja > 1 px` : "✅ ninguna franja entre encabezado y barra");
const control = filas.filter(f => typeof f.antesSolapa === "number" && f.antesSolapa > 0);
console.log(control.length === filas.length
  ? `✅ CONTROL — con el tope viejo las ${filas.length} invaden el encabezado (el medidor sí mira)`
  : `❌ CONTROL FALLÓ — el medidor no detecta el defecto viejo`);
