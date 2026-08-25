// Mide, EN EL NAVEGADOR contra un build real y con datos de producción, todo lo
// que este cambio podría mover en Cuentas por Cobrar y en Clientes:
//
//   1. Las CIFRAS de la pestaña del grupo y de la de Boston — tarjetas de tramo,
//      conteo de la lista y TODOS los montos de la lista, EN ORDEN. La
//      comparación es POSICIÓN POR POSICIÓN (no por nombre): los dos lados
//      recorren el mismo arreglo ya ordenado.
//   2. El ARRASTRE lateral (scrollWidth - clientWidth) en los cuatro anchos
//      medidos: 390 (iPhone) · 834 (iPad) · 1024 (iPad acostado) · 1440.
//   3. Qué layout se está dibujando en cada ancho (`data-vista`), para que el
//      medidor no dé verde por haber mirado un elemento que no existe.
//   4. Los blancos táctiles por debajo de 44 px.
//
// SOLO LECTURA: no escribe un solo dato.
//
//   BASE=http://localhost:3176 node scripts/_medir-cxc-clientes-t310.mjs > antes.json
import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE || "http://localhost:3176";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

// Todos los montos VISIBLES del documento, en orden del DOM. Un monto es
// "$1,234.56" o "-$1,234.56"; se descartan los que no llevan "$" para no leer
// como cifra las etiquetas de tramo ("91-120 días").
const LEER = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const texto = document.body.innerText;
  const montos = (texto.match(/-?\\\$[\\d,]+(?:\\.\\d{1,2})?/g) ?? []);
  const botones = [...document.querySelectorAll("button")]
    .filter((b) => b.querySelector(".tabular-nums") && visible(b))
    .map((b) => b.innerText.replace(/\\s*\\n+\\s*/g, " | ").trim());
  const conteo = (texto.match(/(\\d+(?: de \\d+)? clientes?[^\\n]*)/) ?? [])[1] ?? null;

  // Arrastre lateral: el peor desbordamiento horizontal de cualquier elemento.
  let arrastre = 0, culpable = null;
  for (const el of document.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const d = el.scrollWidth - el.clientWidth;
    if (d > arrastre) { arrastre = d; culpable = el.tagName + "." + String(el.className).slice(0, 70); }
  }
  const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

  // Qué layout está dibujado de verdad (falla ruidosa si no hay ninguno).
  const vistas = [...document.querySelectorAll("[data-vista]")]
    .filter(visible)
    .map((el) => el.getAttribute("data-vista"));

  // Blancos táctiles: cualquier cosa clickeable con menos de 44 px de alto o ancho.
  const chicos = [...document.querySelectorAll("button, a, [role=button], input, select")]
    .filter(visible)
    .map((el) => ({ t: (el.innerText || el.getAttribute("aria-label") || el.tagName).slice(0, 40),
                    w: Math.round(el.getBoundingClientRect().width),
                    h: Math.round(el.getBoundingClientRect().height) }))
    .filter((x) => x.h < 44 || x.w < 44);

  return { montos, botones, conteo, arrastre, culpable, docOverflow, vistas, chicos };
})()`;

async function main() {
  const browser = await chromium.launch();
  const salida = { base: BASE, grupo: {}, boston: {} };

  for (const w of ANCHOS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 950 } });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    // GOTCHAS medidos: sin sembrar sessionStorage `useAuth` manda todo al login,
    // y hay que borrar la API del service worker ANTES de navegar o se mide una
    // página sin hidratar.
    await page.addInitScript(() => {
      delete Navigator.prototype.serviceWorker;
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("cxc_user", "daniel");
    });

    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => /total pendiente/i.test(document.body.innerText),
      null, { timeout: 90000 },
    );
    await page.waitForTimeout(3000);
    salida.grupo[w] = await page.evaluate(LEER);

    const tab = page.locator("button", { hasText: /Confecciones Boston/ }).first();
    if (await tab.count()) {
      await tab.click();
      await page.waitForFunction(
        () => /total pendiente/i.test(document.body.innerText)
          && /\d+ clientes?/.test(document.body.innerText)
          && !/Cargando/i.test(document.body.innerText),
        null, { timeout: 90000 },
      );
      await page.waitForTimeout(3000);
      salida.boston[w] = await page.evaluate(LEER);
    } else {
      salida.boston[w] = { error: "no se encontró la pestaña de Boston" };
    }
    await ctx.close();
  }

  console.log(JSON.stringify(salida, null, 1));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
