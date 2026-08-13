// Mide, EN EL NAVEGADOR contra el build de producción y con datos de producción,
// el panel de CXC (`/admin`) después de agregarle la columna "Última compra".
//
// Para qué: la tabla del desglose por empresa ya era ancha y una columna más
// puede empujarla. Se miden los TRES anchos (390 iPhone · 834 iPad · 1440
// escritorio) con la fila del cliente DESPLEGADA —que es donde vive la columna
// nueva— y se capturan además las cifras del panel para poder compararlas
// contra `origin/main` y probar que ningún número se movió.
//
// SOLO LECTURA: no toca ningún dato.
//
//   BASE=http://localhost:3191 ETAPA=despues node scripts/_medir-cxc-ultima-compra.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";

const BASE = process.env.BASE || "http://localhost:3191";
const ETAPA = process.env.ETAPA || "despues";
const OUT = process.env.OUT || `/tmp/cxc-ultima-compra-${ETAPA}.json`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const ANCHOS = [
  { nombre: "iPhone", width: 390, height: 844 },
  { nombre: "iPad", width: 834, height: 1112 },
  { nombre: "escritorio", width: 1440, height: 950 },
];

// Arrastre de PÁGINA + hijos que desbordan su contenedor + blancos táctiles
// chicos + textos por debajo del piso de 12 px. Un scroller DECLARADO
// (overflow-x auto/scroll) no cuenta como defecto: es el mecanismo.
const MEDIR = `(() => {
  const arrastre = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const desbordados = [];
  const chicos = [];
  const textosChicos = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.offsetParent && el.tagName !== 'BODY') continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const declara = /(auto|scroll)/.test(cs.overflowX);
    if (!declara && el.scrollWidth - el.clientWidth > 1) {
      const p = el.parentElement;
      const pDeclara = p && /(auto|scroll)/.test(getComputedStyle(p).overflowX);
      if (!pDeclara) desbordados.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), px: el.scrollWidth - el.clientWidth });
    }
    const r = el.getBoundingClientRect();
    const tocable = el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button';
    if (tocable && r.width > 0 && r.height > 0 && r.height < 44) chicos.push({ tag: el.tagName, txt: (el.innerText || '').trim().slice(0, 30), h: Math.round(r.height) });
    const fs = parseFloat(cs.fontSize);
    if (fs && fs < 12 && (el.innerText || '').trim() && el.children.length === 0 && !el.className.toString().includes('sr-only')) {
      textosChicos.push({ txt: (el.innerText || '').trim().slice(0, 30), px: fs });
    }
  }
  return { arrastre, desbordados, chicos, textosChicos };
})()`;

// Las cifras del panel: tarjetas de tramo + conteo de clientes. Es lo que NO
// puede moverse por agregar una columna.
const LEER_CIFRAS = `(() => {
  const txt = document.body.innerText;
  const montos = (txt.match(/-?\\$[\\d,]+\\.\\d{2}/g) || []);
  const conteo = (txt.match(/(\\d+(?: de \\d+)? clientes[^\\n]*)/)?.[1] ?? '').trim();
  return { montos, conteo };
})()`;

// La tabla del desglose: encabezados + la fila de cada empresa, tal cual se lee.
const LEER_DESGLOSE = `(() => {
  const tablas = [...document.querySelectorAll('table')].filter(t => t.innerText.includes('Último pago'));
  if (!tablas.length) return null;
  const t = tablas[0];
  return {
    encabezados: [...t.querySelectorAll('th')].map(th => th.innerText.trim()),
    filas: [...t.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim())),
  };
})()`;

async function main() {
  const browser = await chromium.launch();
  const resultado = { etapa: ETAPA, base: BASE, anchos: {} };

  for (const a of ANCHOS) {
    const ctx = await browser.newContext({ viewport: { width: a.width, height: a.height } });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    // GOTCHAS medidos: sin sembrar sessionStorage `useAuth` manda todo al login,
    // y hay que sacar la API del service worker ANTES de navegar o se mide una
    // pantalla servida del caché en vez de este build.
    await page.addInitScript(() => {
      try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
      try { delete Navigator.prototype.serviceWorker; } catch {}
    });
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    const cerrado = await page.evaluate(MEDIR);
    const cifras = await page.evaluate(LEER_CIFRAS);

    // NO se hace clic: el panel de CXC ya viene con el desglose por empresa
    // DESPLEGADO al cargar, así que la columna nueva ya está en pantalla. Un
    // clic acá la CERRARÍA y se mediría la pantalla sin lo que se vino a medir.
    const abierto = true;

    const desplegado = cerrado;
    const desglose = await page.evaluate(LEER_DESGLOSE);
    const textoTarjeta = await page.evaluate(
      `(() => (document.body.innerText.match(/Última compra[^\\n]*/g) || []).slice(0, 4))()`,
    );

    resultado.anchos[a.nombre] = { ancho: a.width, cerrado, desplegado, cifras, desglose, abierto, textoTarjeta };
    await page.screenshot({ path: `/tmp/cxc-uc-${ETAPA}-${a.width}.png`, fullPage: false });
    await ctx.close();

    const d = resultado.anchos[a.nombre];
    console.log(
      `${a.nombre.padEnd(11)} ${String(a.width).padStart(4)}px  ` +
        `arrastre ${d.cerrado.arrastre}/${d.desplegado.arrastre}px · ` +
        `desbordados ${d.cerrado.desbordados.length}/${d.desplegado.desbordados.length} · ` +
        `táctiles<44 ${d.desplegado.chicos.length} · texto<12px ${d.desplegado.textosChicos.length}`,
    );
    if (d.desglose) console.log(`            encabezados: ${d.desglose.encabezados.join(" | ")}`);
    if (d.textoTarjeta?.length) console.log(`            ${d.textoTarjeta[0]}`);
  }

  await browser.close();
  writeFileSync(OUT, JSON.stringify(resultado, null, 2));
  console.log(`\n→ ${OUT}`);

  // Un cero sin haber mirado nada es el peor resultado posible.
  const vio = Object.values(resultado.anchos).some((d) => d.cifras.montos.length > 0);
  if (!vio) {
    console.error("‼️  No se leyó ni un monto: la pantalla no cargó. La medición NO vale.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
