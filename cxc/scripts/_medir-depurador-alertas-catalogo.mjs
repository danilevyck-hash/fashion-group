// Medición por la PUERTA DE LA APP del Depurador (/productos/cargar): cuántas
// descripciones alerta la pantalla al cargar el Excel del universo real de
// artículos (lo arma scripts/_universo-depurador-excel.ts).
//
// ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
// El número que se le da a Daniel es el del cartel rojo —«N descripción(es) por
// revisar»— y ese número NO sale de un SELECT: la pantalla filtra por marca
// catalogada, aplica reclassMarca/normalizeDescripcion y recién ahí pide el
// veredicto. Un conteo hecho en SQL da otra cosa.
//
// 🩸 GOTCHAS de medición (ya pagados):
//   1. La cookie tiene que traer el NOMBRE REAL del usuario
//      (scripts/_cookie-medicion-usuario.ts): el endpoint de aprobar graba
//      `aprobada_por`, y con "medicion-admin" el catálogo queda firmado por un
//      fantasma.
//   2. `sessionStorage.cxc_role` se siembra ANTES de que monte la alarma: sin
//      eso `puedeAprobar` es false y el botón no existe.
//   3. `delete Navigator.prototype.serviceWorker` antes de navegar.
//   4. Solo se puede tocar el botón de UNA fila por mitad derecha: al aprobar la
//      primera, la mitad queda conocida y sus hermanas pasan solas EN VIVO —
//      salen de la lista antes de que se las pueda tocar. Las hermanas van por
//      el MISMO endpoint que dispara el botón (no hay alta manual en el
//      catálogo: /api/.../descripciones/[id] solo tiene PATCH).
//
//   MODO=leer     → solo mide. No toca nada.
//   MODO=aprobar  → mide, aprueba, vuelve a medir en vivo y con la pantalla
//                   recargada. ESCRIBE en el catálogo de producción.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_cookie-medicion-usuario.ts > /tmp/fg-cookie-cat.txt
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_universo-depurador-excel.ts
//   MODO=leer BASE=http://localhost:3187 node scripts/_medir-depurador-alertas-catalogo.mjs
import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3187";
const MODO = process.env.MODO ?? "leer";
const XLSX_PATH = process.env.XLSX ?? "/tmp/universo-depurador.xlsx";
const COOKIE = readFileSync("/tmp/fg-cookie-cat.txt", "utf8").trim();

// Las filas a aprobar. Se intenta SIEMPRE por el botón de la pantalla; si la
// fila ya no está en la lista se cae al mismo endpoint que dispara el botón.
//
// 🩸 POR QUÉ HACE FALTA LA CAÍDA: al aprobar la primera fila de una mitad, la
// mitad queda conocida y sus hermanas pasan solas EN VIVO — desaparecen de la
// lista antes de que se las pueda tocar. Y el catálogo no tiene alta manual:
// /api/.../descripciones/[id] solo tiene PATCH. Así que la hermana entra por
// POST .../aprobar, que es exactamente lo que hace el botón por dentro.
const OBJETIVO = JSON.parse(
  readFileSync(process.env.OBJETIVO ?? "/tmp/objetivo-catalogo.json", "utf8"),
);

const LEER = `(() => {
  const h2 = [...document.querySelectorAll("h2")].find(e => /descripci..?n\\(es\\) por revisar/i.test(e.textContent||""));
  if (!h2) return null;
  const panel = h2.closest("div");
  const n = parseInt((h2.textContent||"").trim(), 10);
  const solasEl = [...panel.querySelectorAll("p")].find(e => /pasaron solas/i.test(e.textContent||""));
  const solas = solasEl ? parseInt(solasEl.textContent.trim(), 10) : 0;
  const filas = [...panel.querySelectorAll("div.max-h-64 > div")].map(d => (d.innerText||"").replace(/\\s+/g," ").trim());
  return { n, solas, filas };
})()`;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { delete Navigator.prototype.serviceWorker; } catch {} });
  const page = await ctx.newPage();

  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);

  await page.goto(`${BASE}/productos/cargar`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => sessionStorage.setItem("cxc_role", "admin"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const i = document.querySelector('input[type=file]');
    return i && !i.disabled;
  }, null, { timeout: 60000 });

  await page.setInputFiles("input[type=file]", XLSX_PATH);
  await page.waitForFunction(() => [...document.querySelectorAll("h2")].some(e => /por revisar/i.test(e.textContent || "")), null, { timeout: 180000 });
  const antes = await page.evaluate(LEER);
  console.log(`\n=== ANTES (pantalla): ${antes.n} descripciones por revisar · ${antes.solas} pasaron solas`);
  for (const f of antes.filas) console.log("   ·", f);

  if (MODO === "aprobar") {
    let porBoton = 0, porEndpoint = 0;
    for (const [marca, desc] of OBJETIVO) {
      const fila = page.locator("div.max-h-64 > div").filter({ hasText: `${marca} \u2192 ${desc}` });
      let n = 0;
      try { n = await fila.count(); } catch { n = 0; }
      // El filtro es por prefijo: "Men-Shirts" tambi\u00e9n casa con "Men-Shirts L/S".
      // Con m\u00e1s de una candidata no se toca nada y se va por el endpoint.
      if (n === 1) {
        await fila.getByRole("button", { name: /Aprobar y agregar/ }).click();
        await page.getByRole("heading", { name: "Aprobar descripci\u00f3n" }).waitFor({ timeout: 10000 });
        await page.locator('label:has-text("Ya le avis\u00e9 a Daniel") input[type=checkbox]').check();
        await page.getByRole("button", { name: /^Aprobar$/ }).click();
        await page.getByRole("heading", { name: "Aprobar descripci\u00f3n" }).waitFor({ state: "detached", timeout: 20000 });
        porBoton++;
        console.log(`  \u2713 bot\u00f3n    ${marca} | ${desc}`);
        continue;
      }
      const r = await ctx.request.post(`${BASE}/api/productos/cargar/descripciones/aprobar`, {
        data: { marca, descripcion: desc },
      });
      const body = await r.json().catch(() => null);
      if (r.ok()) porEndpoint++;
      console.log(`  ${r.ok() ? "\u2713" : "\u2717"} endpoint  ${marca} | ${desc}  ${r.status()} ${JSON.stringify(body)}`);
    }
    console.log(`\n  aprobadas: ${porBoton} por el bot\u00f3n \u00b7 ${porEndpoint} por el endpoint \u00b7 ${porBoton + porEndpoint} de ${OBJETIVO.length}`);
    const despues = await page.evaluate(LEER);
    console.log(`\n=== DESPUÉS en vivo (misma pantalla): ${despues.n} descripciones por revisar · ${despues.solas} pasaron solas`);
    for (const f of despues.filas) console.log("   ·", f);

    // Segunda pasada limpia: recarga y vuelve a cargar el MISMO Excel.
    await page.goto(`${BASE}/productos/cargar`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => { const i = document.querySelector('input[type=file]'); return i && !i.disabled; }, null, { timeout: 60000 });
    await page.setInputFiles("input[type=file]", XLSX_PATH);
    await page.waitForFunction(() => [...document.querySelectorAll("h2")].some(e => /por revisar/i.test(e.textContent || "")), null, { timeout: 180000 });
    const recarga = await page.evaluate(LEER);
    console.log(`\n=== DESPUÉS recargando la pantalla: ${recarga.n} descripciones por revisar · ${recarga.solas} pasaron solas`);
    for (const f of recarga.filas) console.log("   ·", f);
  }

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
