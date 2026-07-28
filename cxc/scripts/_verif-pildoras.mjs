// Verificación REAL en navegador (build de producción + datos de producción)
// de la píldora de tramo del CXC: filtra Y ordena por ese tramo.
// Solo lectura: no toca ningún dato.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";

const BASE = "http://localhost:3146";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const OUT = "/tmp/fg-t46-shots";
mkdirSync(OUT, { recursive: true });

// Lee la tabla desktop: nombre + los 4 montos de cada fila.
const LEER_TABLA = `(() => {
  const filas = [...document.querySelectorAll('.sm\\\\:grid.grid-cols-12')].filter(f => f.querySelector('.col-span-4') && !f.className.includes('uppercase'));
  const num = t => { const s = (t||'').replace(/[^0-9.,-]/g,'').replace(/,/g,''); const n = parseFloat(s); return isNaN(n) ? 0 : n; };
  return filas.map(f => {
    const cols = [...f.children];
    return {
      nombre: (cols[0]?.innerText||'').trim().replace(/^[★☆]\\s*/,''),
      c0_90: num(cols[1]?.innerText), c91_120: num(cols[2]?.innerText),
      c121: num(cols[3]?.innerText), total: num(cols[4]?.innerText),
    };
  });
})()`;

const CONTEO = `document.body.innerText.match(/\\d+(?: de \\d+)? clientes · ordenados por [^\\n]*/)?.[0] || ''`;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  // El SW mata la hidratación si se bloquea por ruteo: se borra la API antes de navegar.
  // GOTCHAS: (1) sin sembrar sessionStorage, useAuth redirige TODO al login;
  // (2) hay que borrar la API del SW ANTES de navegar o se mide una pagina sin hidratar.
  await page.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("cxc_user", "daniel");
  });

  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForSelector("button[aria-pressed]:visible", { timeout: 40000 });
  await page.waitForTimeout(2500);

  const pill = (txt) => page.locator("button", { hasText: txt }).filter({ has: page.locator(".tabular-nums") }).first();

  // ── 1. Estado inicial: Total pendiente ──
  const inicial = await page.evaluate(LEER_TABLA);
  const conteoInicial = await page.evaluate(CONTEO);
  console.log("### 1. INICIAL (Total pendiente)");
  console.log("   " + conteoInicial);
  console.log("   top3: " + inicial.slice(0,3).map(c => `${c.nombre} $${c.total}`).join(" | "));
  await page.screenshot({ path: `${OUT}/1-inicial.png` });

  // ── 2. Tocar "121d+" ──
  await pill("121d+").click();
  await page.waitForTimeout(1200);
  const filtrado = await page.evaluate(LEER_TABLA);
  const conteo121 = await page.evaluate(CONTEO);
  const url121 = page.url();
  console.log("\n### 2. TOCANDO 121d+");
  console.log("   url: " + url121);
  console.log("   " + conteo121);
  console.log("   filas: " + filtrado.length);
  console.log("   TOP 3 (nombre — deuda 121d+ — total):");
  filtrado.slice(0,3).forEach((c,i) => console.log(`     ${i+1}. ${c.nombre} — $${c.c121.toLocaleString('en-US',{minimumFractionDigits:2})} (121d+) — total $${c.total.toLocaleString('en-US',{minimumFractionDigits:2})}`));
  const sinDeuda = filtrado.filter(c => c.c121 <= 0);
  const desordenados = filtrado.filter((c,i) => i > 0 && filtrado[i-1].c121 < c.c121);
  console.log("   filas SIN deuda en 121d+ (debe ser 0): " + sinDeuda.length);
  console.log("   pares fuera de orden desc (debe ser 0): " + desordenados.length);
  console.log("   flecha del encabezado 121d+: " + JSON.stringify(await page.locator(".sm\\:grid.grid-cols-12").first().locator("div").nth(3).innerText()));
  await page.screenshot({ path: `${OUT}/2-121dmas.png` });

  // ── 3. Tocar 121d+ otra vez: apaga ──
  await pill("121d+").click();
  await page.waitForTimeout(1200);
  const apagado = await page.evaluate(LEER_TABLA);
  console.log("\n### 3. TOCANDO 121d+ DE NUEVO (apagar)");
  console.log("   url: " + page.url());
  console.log("   " + await page.evaluate(CONTEO));
  console.log("   filas: " + apagado.length + " (inicial: " + inicial.length + ")");
  console.log("   top3: " + apagado.slice(0,3).map(c => `${c.nombre} $${c.total}`).join(" | "));
  console.log("   vuelve al orden por total: " + (JSON.stringify(apagado.map(c=>c.nombre)) === JSON.stringify(inicial.map(c=>c.nombre))));

  // ── 4. Orden por título de columna, sin filtrar ──
  await page.locator(".sm\\:grid.grid-cols-12").first().locator("div").nth(2).click(); // 91-120d
  await page.waitForTimeout(800);
  const porTitulo = await page.evaluate(LEER_TABLA);
  console.log("\n### 4. CLIC EN EL TÍTULO '91-120d' (ordenar sin filtrar)");
  console.log("   " + await page.evaluate(CONTEO));
  console.log("   filas: " + porTitulo.length + " (sin filtrar = " + inicial.length + ")");
  console.log("   ordenado desc por 91-120d: " + porTitulo.every((c,i) => i===0 || porTitulo[i-1].c91_120 >= c.c91_120 || porTitulo[i-1].total < 0));
  console.log("   top3: " + porTitulo.slice(0,3).map(c => `${c.nombre} $${c.c91_120}`).join(" | "));

  // ── 5. La píldora descarta el override (no quedan desincronizados) ──
  await pill("121d+").click();
  await page.waitForTimeout(1200);
  const tras = await page.evaluate(LEER_TABLA);
  const encabezado = await page.locator(".sm\\:grid.grid-cols-12").first().innerText();
  console.log("\n### 5. PÍLDORA DESPUÉS DEL TÍTULO (no se contradicen)");
  console.log("   " + await page.evaluate(CONTEO));
  console.log("   encabezado: " + JSON.stringify(encabezado.replace(/\n/g," ")));
  console.log("   ordenado desc por 121d+: " + tras.every((c,i) => i===0 || tras[i-1].c121 >= c.c121 || tras[i-1].total < 0));

  // ── 6. Targets 44px + sin scroll lateral, en 3 tamaños ──
  console.log("\n### 6. TARGETS Y SCROLL LATERAL");
  for (const t of [{n:"iphone",w:390,h:844},{n:"ipad",w:768,h:1024},{n:"escritorio",w:1440,h:950}]) {
    await page.setViewportSize({ width: t.w, height: t.h });
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const chicos = [...document.querySelectorAll("button[aria-pressed]")]
        .filter(b => b.offsetParent !== null)
        .map(b => ({ txt: b.innerText.split("\n")[0].slice(0,22), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }))
        .filter(x => x.h < 44 || x.w < 44);
      return { chicos, scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
               sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    });
    console.log(`   ${t.n} (${t.w}px): píldoras <44px = ${r.chicos.length} ${r.chicos.length?JSON.stringify(r.chicos):""} · scroll lateral = ${r.scrollX} (${r.sw}/${r.cw})`);
    await page.screenshot({ path: `${OUT}/6-${t.n}.png`, fullPage: false });
  }

  // ── 7. Móvil: el chip también reordena ──
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const chip = page.locator('button[aria-pressed]', { hasText: "Vencido crítico" }).first();
  await chip.click();
  await page.waitForTimeout(1200);
  const movil = await page.evaluate(`(() => {
    const txt = document.body.innerText.match(/\\d+ clientes? · ordenados por [^\\n]*/)?.[0] || '';
    const items = [...document.querySelectorAll('ul > li')].slice(0,3).map(li => li.innerText.split('\\n').slice(0,2).join(' / '));
    return { txt, items };
  })()`);
  console.log("\n### 7. MÓVIL (390px) — chip 'Vencido crítico'");
  console.log("   " + movil.txt);
  movil.items.forEach((t,i)=>console.log(`     ${i+1}. ${t.replace(/\s+/g," ")}`));
  await page.screenshot({ path: `${OUT}/7-movil-chip.png` });

  await browser.close();
  console.log("\nCapturas en " + OUT);
}
main().catch(e => { console.error(e); process.exit(1); });
