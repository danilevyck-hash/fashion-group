// Verificación REAL en navegador (build de producción + datos de producción) del
// selector de talla del catálogo Joybees. Solo lectura: no toca ningún dato
// (el carrito vive en localStorage del navegador de prueba).
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = "http://localhost:3156";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const OUT = "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
mkdirSync(OUT, { recursive: true });

const LEER = (sku) => `(() => {
  const sku = ${JSON.stringify(sku)};
  const pill = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === sku);
  if (!pill) return null;
  let card = pill;
  while (card && !(card.className || '').includes('rounded-xl relative')) card = card.parentElement;
  if (!card) return null;
  const tallas = [...card.querySelectorAll('[role="group"] button')].map(b => ({
    texto: b.innerText.replace(/\\n/g, ' | '),
    activa: b.getAttribute('aria-pressed') === 'true',
    alto: Math.round(b.getBoundingClientRect().height),
  }));
  const info = card.querySelector('[class*="p-2"]');
  return {
    texto: (info ? info.innerText : card.innerText).replace(/\\n+/g, ' · '),
    precio: card.querySelector('.text-xl.font-bold')?.innerText ?? '',
    tallas,
    agregar: card.querySelector('button.w-full')?.innerText ?? '',
    alto: Math.round(card.getBoundingClientRect().height),
  };
})()`;

const CLICK_TALLA = (sku, i) => `(() => {
  const sku = ${JSON.stringify(sku)}, i = ${Number(i)};
  const pill = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === sku);
  let card = pill;
  while (card && !(card.className || '').includes('rounded-xl relative')) card = card.parentElement;
  card.querySelectorAll('[role="group"] button')[i].click();
})()`;

const CLICK_AGREGAR = (sku) => `(() => {
  const sku = ${JSON.stringify(sku)};
  const pill = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === sku);
  let card = pill;
  while (card && !(card.className || '').includes('rounded-xl relative')) card = card.parentElement;
  card.querySelector('button.w-full').click();
})()`;

function mostrar(titulo, d) {
  console.log(`\n### ${titulo}`);
  if (!d) { console.log("   ⚠ NO SE ENCONTRÓ LA TARJETA"); return; }
  console.log(`   precio grande: ${d.precio}`);
  d.tallas.forEach(t => console.log(`   talla ${t.activa ? "●" : "○"} "${t.texto}"  (alto ${t.alto}px)`));
  console.log(`   botón: "${d.agregar}"`);
  console.log(`   texto completo: ${d.texto}`);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("cxc_user", "daniel");
    sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
    localStorage.removeItem("joybees_cart");
  });

  await page.goto(`${BASE}/catalogo/joybees`, { waitUntil: "networkidle" });
  await page.waitForSelector('[role="group"]', { timeout: 40000 });
  await page.waitForTimeout(1500);

  // ── Cuántos modelos tienen selector ──
  const conSelector = await page.evaluate(`(() => {
    const grupos = [...document.querySelectorAll('[role="group"][aria-label="Talla"]')];
    return grupos.map(g => {
      let card = g;
      while (card && !(card.className || '').includes('rounded-xl relative')) card = card.parentElement;
      const pill = card.querySelector('.tabular-nums');
      return pill ? pill.innerText.trim() : '?';
    });
  })()`);
  console.log(`### MODELOS CON SELECTOR DE TALLA: ${conSelector.length}`);
  console.log("   " + conSelector.join(", "));

  const suma = await page.evaluate(`document.body.innerText.includes("335")`);
  console.log(`\n### ¿aparece "335" (la suma) en toda la página?: ${suma ? "SÍ ⚠" : "NO ✅"}`);

  // ── UKVCG.MTC ──
  mostrar("UKVCG.MTC — al abrir el catálogo", await page.evaluate(LEER("UKVCG.MTC")));
  await page.evaluate(CLICK_TALLA("UKVCG.MTC", 1));
  await page.waitForTimeout(350);
  mostrar("UKVCG.MTC — tocando KIDS", await page.evaluate(LEER("UKVCG.MTC")));
  await page.evaluate(CLICK_AGREGAR("UKVCG.MTC"));
  await page.waitForTimeout(400);
  console.log("   carrito tras Agregar: " + await page.evaluate(`JSON.stringify((JSON.parse(localStorage.getItem("joybees_cart")||"[]")).map(i => ({sku:i.sku, precio:i.unit_price, bultos:i.quantity})))`));

  // ── UKTRK.BLK ──
  mostrar("UKTRK.BLK — al abrir el catálogo", await page.evaluate(LEER("UKTRK.BLK")));
  await page.evaluate(CLICK_TALLA("UKTRK.BLK", 1));
  await page.waitForTimeout(350);
  mostrar("UKTRK.BLK — tocando la otra talla", await page.evaluate(LEER("UKTRK.BLK")));
  await page.evaluate(CLICK_AGREGAR("UKTRK.BLK"));
  await page.waitForTimeout(400);
  console.log("   carrito tras Agregar: " + await page.evaluate(`JSON.stringify((JSON.parse(localStorage.getItem("joybees_cart")||"[]")).map(i => ({sku:i.sku, precio:i.unit_price, bultos:i.quantity})))`));

  // ── Capturas escritorio ──
  await page.evaluate(`(() => {
    const pill = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'UKVCG.MTC');
    pill.scrollIntoView({ block: 'center' });
  })()`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/joybees-talla-final-desktop.png` });

  // ── iPhone 390×844 ──
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctxM.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
  const m = await ctxM.newPage();
  await m.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("cxc_user", "daniel");
    sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
  });
  await m.goto(`${BASE}/catalogo/joybees`, { waitUntil: "networkidle" });
  await m.waitForSelector('[role="group"]', { timeout: 40000 });
  await m.waitForTimeout(1200);
  const scroll = await m.evaluate(`({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })`);
  console.log(`\n### iPhone 390×844 — scrollWidth ${scroll.sw} vs innerWidth ${scroll.iw} → ${scroll.sw > scroll.iw ? "HAY SCROLL LATERAL ⚠" : "sin scroll lateral ✅"}`);
  const altosMovil = await m.evaluate(`[...document.querySelectorAll('[role="group"] button')].map(b => Math.round(b.getBoundingClientRect().height))`);
  console.log(`   altos de los botones de talla en móvil: ${[...new Set(altosMovil)].join(", ")}px (mínimo exigido 44)`);
  mostrar("UKVCG.MTC en iPhone", await m.evaluate(LEER("UKVCG.MTC")));
  await m.evaluate(`(() => {
    const pill = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'UKVCG.MTC');
    pill.scrollIntoView({ block: 'center' });
  })()`);
  await m.waitForTimeout(600);
  await m.screenshot({ path: `${OUT}/joybees-talla-final-iphone.png` });

  // ── Catálogo PÚBLICO (sin stock interno) ──
  const ctxP = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctxP.newPage();
  await p.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await p.goto(`${BASE}/catalogo-publico/joybees`, { waitUntil: "networkidle" });
  await p.waitForSelector('[role="group"]', { timeout: 40000 });
  await p.waitForTimeout(1200);
  mostrar("UKVCG.MTC en el catálogo PÚBLICO (cliente)", await p.evaluate(LEER("UKVCG.MTC")));
  const stockPublico = await p.evaluate(`document.body.innerText.includes("Disponibilidad") || document.body.innerText.includes("Existencia")`);
  console.log(`   ¿se filtra stock interno al público?: ${stockPublico ? "SÍ ⚠" : "NO ✅"}`);
  await p.evaluate(`(() => {
    const pill = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'UKVCG.MTC');
    pill.scrollIntoView({ block: 'center' });
  })()`);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/joybees-talla-final-publico.png` });

  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
