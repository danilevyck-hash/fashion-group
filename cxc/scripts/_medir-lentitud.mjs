// Mide las 6 pantallas más usadas contra un build de producción LOCAL (que lee
// la base de producción). SOLO LECTURA: todo pedido que no sea GET se corta
// antes de salir (así `/api/visitas` no escribe una visita de mentira).
//
//   BASE=http://localhost:3169 COOKIE=$(cat /tmp/fg-cookie-local.txt) \
//     node scripts/_medir-lentitud.mjs [escritorio|celular] [vueltas] > salida.json
//
// Por pantalla: se ve algo (FCP), se puede usar (la última llamada /api del
// arranque terminó), cuántas llamadas, la más lenta, cuántas «olas» en cadena
// (una llamada que empieza recién cuando otra terminó) y KB de JavaScript.
import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3169";
const COOKIE = process.env.COOKIE;
const modo = process.argv[2] ?? "escritorio";
const vueltas = Number(process.argv[3] ?? 2);
const PANTALLAS = (process.env.PANTALLAS ?? "/vista-general,/cxc,/ventas,/despachos,/catalogos/marcas,/marketing").split(",");

const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext(modo === "celular" ? { ...devices["iPhone 13"] } : { viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
// La pestaña ya tiene la sesión cargada, como la de quien entró con su contraseña.
await ctx.addInitScript(() => { sessionStorage.setItem("cxc_role", "admin"); sessionStorage.setItem("fg_user_name", "daniel"); sessionStorage.setItem("fg_is_owner", "1"); });
await ctx.route("**/*", (r) => (r.request().method() === "GET" ? r.continue() : r.abort()));

const out = [];
for (const ruta of PANTALLAS) {
  for (let v = 0; v < vueltas; v++) {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: v === 0 }); // 1ª vuelta en frío, luego con caché del navegador
    if (modo === "celular") {
      // «4G lenta» de Lighthouse: 150 ms de ida y vuelta, 1,6 Mbps, CPU 4× más lenta.
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    const api = new Map();
    const t0 = Date.now();
    page.on("request", (q) => { if (new URL(q.url()).pathname.startsWith("/api/")) api.set(q, { url: q.url().replace(BASE, ""), ini: Date.now() - t0 }); });
    page.on("requestfinished", (q) => { const a = api.get(q); if (a) a.fin = Date.now() - t0; });
    page.on("requestfailed", (q) => { const a = api.get(q); if (a) { a.fin = Date.now() - t0; a.cortada = true; } });
    await page.goto(BASE + ruta, { waitUntil: "load", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    const perf = await page.evaluate(() => {
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
      const js = performance.getEntriesByType("resource").filter((r) => r.initiatorType === "script" || r.name.endsWith(".js"));
      const nav = performance.getEntriesByType("navigation")[0];
      return { fcp, ttfb: nav?.responseStart, jsKB: Math.round(js.reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0) / 1024), jsArchivos: js.length };
    });
    const calls = [...api.values()].filter((a) => !a.cortada);
    // Olas: una llamada que arranca DESPUÉS de que terminó otra va en cadena.
    let olas = 0, finOla = -1;
    for (const c of [...calls].sort((a, b) => a.ini - b.ini)) { if (c.ini >= finOla) { olas++; } finOla = Math.max(finOla, c.fin ?? 0); }
    const lenta = calls.reduce((m, c) => ((c.fin - c.ini) > (m ? m.fin - m.ini : -1) ? c : m), null);
    out.push({
      modo, ruta, vuelta: v, url: page.url().replace(BASE, ""),
      ttfb: Math.round(perf.ttfb), fcp: Math.round(perf.fcp ?? -1),
      usable: Math.max(Math.round(perf.fcp ?? 0), ...calls.map((c) => c.fin ?? 0)),
      llamadas: calls.length, olas, cortadas: [...api.values()].filter((a) => a.cortada).map((a) => a.url),
      masLenta: lenta ? { url: lenta.url.slice(0, 90), ms: lenta.fin - lenta.ini } : null,
      jsKB: perf.jsKB, jsArchivos: perf.jsArchivos,
      detalle: calls.sort((a, b) => a.ini - b.ini).map((c) => `${c.ini}-${c.fin} ${c.url.slice(0, 80)}`),
    });
    await page.close();
    await new Promise((r) => setTimeout(r, 1500)); // espaciado: no apretar la base
  }
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
