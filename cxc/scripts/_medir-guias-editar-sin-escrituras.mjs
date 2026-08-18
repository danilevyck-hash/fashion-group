// ─────────────────────────────────────────────────────────────────────────────
// EL CANDADO, MEDIDO EN EL NAVEGADOR: abrir /guias/[id]/editar no puede
// producir NI UNA escritura.
//
//   BASE=https://… GUIA=<uuid> node scripts/_medir-guias-editar-sin-escrituras.mjs
//
// 🔴 NUNCA ESCRIBE, ni con el bug puesto: toda petición que no sea GET a /api/
//    se ABORTA en el navegador y se anota. O sea que este script se puede correr
//    contra una guía REAL sin tocarle un renglón — que es justo lo que a GT-204
//    ya le pasó dos veces.
//
// Dos pasadas:
//   1. ABRIR Y ESPERAR (el doble del debounce de 1,5 s) → esperado: 0 escrituras.
//   2. TOCAR UN CAMPO DE CABECERA (las observaciones) → esperado: 1 escritura,
//      y SIN `items` adentro: cambiar una nota no puede costarle el id a cada
//      renglón.
//   3. TOCAR UN RENGLÓN (los bultos) → esperado: 1 escritura, ahora sí con los
//      renglones. Sin los pasos 2 y 3, un formulario que no guarda NUNCA
//      también pasaría en verde.
//   4. Los TRES anchos (+ el iPad acostado), en solo lectura.
//
// Gotchas de medición de la casa:
//   · sembrar `sessionStorage.cxc_role`, si no `useAuth` redirige al login;
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3111";
const GUIA = process.env.GUIA ?? "";
const ETIQUETA = process.env.ETIQUETA ?? "rama";
const ESPERA_MS = Number(process.env.ESPERA_MS ?? 6000);
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

if (!GUIA) { console.error("Falta GUIA=<uuid>"); process.exit(1); }

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_is_owner", "1");
});

const escrituras = [];
await ctx.route("**/api/**", async (route) => {
  const req = route.request();
  const metodo = req.method().toUpperCase();
  if (metodo === "GET") return route.continue();
  // Sentry manda sus propios POST y NO son una escritura de la app: contarlos
  // haría fallar el candado por algo que no toca ni una fila.
  if (!req.url().startsWith(BASE)) return route.continue();
  escrituras.push({ metodo, url: req.url().replace(BASE, ""), momento: Date.now() });
  // 🔴 Por defecto se ABORTA: el script no escribe nunca, ni con el bug puesto.
  // `DEJAR_PASAR=1` solo se usa contra un DOBLE (o contra una guía Completada,
  // que el servidor rechaza con 400 ANTES de tocar una fila): sirve para que el
  // PUT quede en el LOG DEL SERVIDOR y la prueba no dependa del navegador.
  if (process.env.DEJAR_PASAR === "1") return route.continue();
  return route.abort();
});

const page = await ctx.newPage();
// `NAVEGACION=suave` llega a la pantalla como llega bodega: desde la página de
// la guía, tocando "Cambiar los envíos de esta guía". Es un camino DISTINTO de
// recargar la URL: React no vuelve a montar el árbol desde cero.
if (process.env.NAVEGACION === "suave") {
  await page.goto(`${BASE}/guias/${GUIA}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  escrituras.length = 0;
  await page.getByRole("link", { name: /Cambiar los envíos/i }).click();
} else {
  await page.goto(`${BASE}/guias/${GUIA}/editar`, { waitUntil: "domcontentloaded" });
}
await page.waitForTimeout(ESPERA_MS);

const cargo = await page.evaluate(() =>
  Boolean([...document.querySelectorAll("button")].find((b) => /Guardar Cambios/i.test(b.textContent || ""))),
);
if (!cargo) {
  console.error("🔴 La pantalla de editar no cargó (no está el botón Guardar Cambios). No se midió nada.");
  await nav.close();
  process.exit(1);
}

const soloAbrir = escrituras.length;
const detalleAbrir = escrituras.slice();

// ── 2. Ahora sí, un cambio de verdad ────────────────────────────────────────
escrituras.length = 0;
const obs = page.locator("textarea").first();
await obs.click();
await obs.type(" ·", { delay: 40 });
await page.waitForTimeout(ESPERA_MS);
const trasCambio = escrituras.length;
const detalleCambio = escrituras.slice();

// ── 3. Un cambio en un RENGLÓN ──────────────────────────────────────────────
// La otra mitad del candado: los renglones tienen que SEGUIR guardándose. Un
// formulario que nunca manda `items` también daría 0 escrituras al abrir.
escrituras.length = 0;
const bultos = page.locator('input[id^="bultos-"]:visible').first();
// Un valor DISTINTO del que ya tiene: escribir el mismo número no es un cambio
// y el candado se estaría probando a sí mismo al revés.
const bultosAntes = await bultos.inputValue();
await bultos.fill(String((Number(bultosAntes) || 0) + 1));
await page.waitForTimeout(ESPERA_MS);
const trasRenglon = escrituras.length;

// ── 4. Los tres anchos (+ el iPad acostado) ─────────────────────────────────
// El cambio es de CONDUCTA, no de dibujo, pero se mide igual: el rótulo de
// estado ("Sin guardar" / "Listo, guardado") es lo único que cambia de texto.
const ANCHOS = [390, 834, 1024, 1440];
const anchos = {};
for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx2 = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx2.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx2.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx2.addInitScript(() => { sessionStorage.setItem("cxc_role", "admin"); sessionStorage.setItem("fg_is_owner", "1"); });
  // Ni una escritura mientras se mide de ancho.
  await ctx2.route("**/api/**", (r) => (r.request().method() === "GET" ? r.continue() : r.abort()));
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/guias/${GUIA}/editar`, { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(7000);
  anchos[ancho] = await p2.evaluate(() => {
    const de = document.documentElement;
    // Un blanco táctil por debajo de 44 px. El escritorio con mouse usa la
    // densidad chica a propósito (`pointer:fine`), así que solo cuenta cuando
    // el puntero es grueso.
    const grueso = matchMedia("(pointer: coarse)").matches;
    const chicos = grueso
      ? [...document.querySelectorAll("button, a, input, select, textarea")]
          .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44; })
          .map((e) => ({ t: (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 24), h: Math.round(e.getBoundingClientRect().height) }))
      : [];
    const letraChica = [...document.querySelectorAll("*")]
      .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
      .map((e) => parseFloat(getComputedStyle(e).fontSize))
      .filter((n) => n && n < 12).length;
    return { arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth), chicos, letraChica, cargo: /Guardar Cambios/.test(document.body.innerText) };
  });
  await ctx2.close();
}

const veredicto = {
  anchos,
  etiqueta: ETIQUETA,
  base: BASE,
  guia: GUIA,
  soloAbrir,
  detalleAbrir,
  trasCambio,
  detalleCambio,
  trasRenglon,
  ok: soloAbrir === 0 && trasCambio >= 1 && trasRenglon >= 1,
};
console.log(JSON.stringify(veredicto, null, 2));
await nav.close();
process.exit(veredicto.ok ? 0 : 1);
