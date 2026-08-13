// Mide, EN EL NAVEGADOR contra el build de producción y con datos de producción,
// las tarjetas de tramo del panel de CXC (`/admin`) y la pestaña de Boston.
//
// Para qué: el arreglo de `switch_estadocuenta_aging_mv` cambia lo que devuelve
// `/api/cxc/aging`. Hay que poder decir, con dos números medidos y no razonados,
// qué decía el panel antes y qué dice después — y probar que la pestaña de
// Boston no se mueve.
//
// SOLO LECTURA: no toca ningún dato.
//
//   BASE=http://localhost:3176 node scripts/_medir-panel-cxc-boston.mjs
import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE || "http://localhost:3176";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// Las tarjetas de tramo: cada una es un botón con su rótulo y su cifra.
const LEER_TARJETAS = `(() => {
  const txt = document.body.innerText;
  const pick = (re) => (txt.match(re)?.[1] ?? "").trim();
  const botones = [...document.querySelectorAll('button')]
    .filter(b => b.querySelector('.tabular-nums') && b.offsetParent !== null)
    .map(b => b.innerText.replace(/\\n+/g, ' | ').trim());
  return { botones, conteo: pick(/(\\d+(?: de \\d+)? clientes[^\\n]*)/) };
})()`;

const num = (s) => {
  const m = (s || "").match(/-?\$[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  return parseFloat(m[0].replace(/[$,]/g, ""));
};

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  // GOTCHAS conocidos: sin sembrar sessionStorage `useAuth` manda todo al login,
  // y hay que borrar la API del service worker ANTES de navegar o se mide una
  // página sin hidratar.
  await page.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("cxc_user", "daniel");
  });

  // ── El payload crudo del API (lo que la MV le manda al navegador) ──
  const api = await page.evaluate(async (base) => {
    const r = await fetch(`${base}/api/cxc/aging`, { credentials: "include" });
    const j = await r.json();
    const filas = j.rows ?? [];
    const boston = filas.filter((f) => f.company_key === "confecciones_boston");
    return { filas: filas.length, boston: boston.length };
  }, BASE).catch(() => null);

  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => /Total Pendiente/.test(document.body.innerText), null, { timeout: 60000 });
  await page.waitForTimeout(3000);

  const apiEnPagina = await page.evaluate(async () => {
    const r = await fetch("/api/cxc/aging", { cache: "no-store" });
    const j = await r.json();
    const filas = j.rows ?? [];
    return { filas: filas.length, boston: filas.filter((f) => f.company_key === "confecciones_boston").length };
  });

  const grupo = await page.evaluate(LEER_TARJETAS);
  console.log("═══ /admin — pestaña del GRUPO ═══");
  console.log(`payload de /api/cxc/aging: ${apiEnPagina.filas} filas · ${apiEnPagina.boston} de Boston`);
  console.log(`lista: ${grupo.conteo}`);
  for (const b of grupo.botones) console.log(`  ${b}`);

  // ── Pestaña de Boston ──
  const tabBoston = page.locator("button", { hasText: /Confecciones Boston/ }).first();
  if (await tabBoston.count()) {
    await tabBoston.click();
    await page.waitForTimeout(3000);
    const boston = await page.evaluate(LEER_TARJETAS);
    console.log("\n═══ /admin — pestaña de BOSTON (no puede cambiar) ═══");
    console.log(`lista: ${boston.conteo}`);
    for (const b of boston.botones) console.log(`  ${b}`);
  } else {
    console.log("\n⚠️ no se encontró la pestaña de Boston");
  }

  void api; void num;
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
