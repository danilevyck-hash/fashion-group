// La línea nueva ("− $X en descuentos") no puede estrenar letra por debajo de
// 12 px ni un tocable por debajo de 44 px. Se mide en los 4 anchos, en las DOS
// pestañas, contra el build de producción y con datos de producción.
//
//   BASE=http://localhost:3199 node scripts/_medir-comisiones-letra-y-tocables.mjs
//
// Solo lectura: nunca toca "Actualizar ahora" ni "Excel".

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3199";
const COOKIE = readFileSync(process.env.COOKIE_FILE ?? "/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const MEDIR = () => {
  const chicos = [];
  const tocables = [];
  const zona = document.querySelector("table")?.closest("div") ?? document.body;
  for (const el of zona.querySelectorAll("*")) {
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!propio) continue;
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (px < 12) chicos.push({ txt: el.textContent.trim().slice(0, 40), px });
    const clickeable = el.closest("button,a,[role=button]");
    if (clickeable) {
      const rc = clickeable.getBoundingClientRect();
      if (rc.height > 0 && rc.height < 44) tocables.push({ txt: clickeable.textContent.trim().slice(0, 30), alto: Math.round(rc.height) });
    }
  }
  const linea = [...document.querySelectorAll("td span")].find((s) => /en descuentos/.test(s.textContent));
  return {
    chicos,
    tocables,
    lineaDescuento: linea
      ? { texto: linea.textContent.trim(), px: parseFloat(getComputedStyle(linea).fontSize) }
      : null,
  };
};

const b = await chromium.launch();
const ctx = await b.newContext();
await ctx.addCookies([
  { name: "cxc_session", value: COOKIE, domain: new URL(BASE).hostname, path: "/", httpOnly: true, sameSite: "Lax" },
]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { localStorage.setItem("fg_comisiones_mode", "empresa"); } catch {}
  try { localStorage.setItem("fg_last_comision_empresa", "fashion_shoes"); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});

let vistas = 0;
for (const ancho of ANCHOS) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: ancho, height: 900 });
  await p.goto(`${BASE}/comisiones`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(
    `!document.querySelector(".animate-pulse") && (document.querySelector("table tbody tr") || document.querySelector("[data-comision-card]"))`,
    null,
    { timeout: 45000 },
  );
  await p.waitForTimeout(400);
  const r = await p.evaluate(MEDIR);
  if (r.lineaDescuento) vistas++;
  console.log(
    `@${ancho}  textos<12px: ${r.chicos.length}  ·  tocables<44px: ${r.tocables.length}  ·  línea: ${
      r.lineaDescuento ? `${r.lineaDescuento.texto} (${r.lineaDescuento.px}px)` : "— (tarjetas)"
    }`,
  );
  if (r.chicos.length) console.log("   chicos:", r.chicos.slice(0, 5));
  if (r.tocables.length) console.log("   tocables:", r.tocables.slice(0, 5));
  await p.close();
}
await b.close();

// A 390 y 834 la vista es de TARJETAS (la tabla va `hidden`), así que la línea
// de la tabla solo puede aparecer en los dos anchos grandes. Encontrar CERO en
// los cuatro sería una medición que no midió nada.
if (vistas === 0) {
  console.error("🔴 no se vio la línea del descuento en ningún ancho — la medición no midió nada");
  process.exit(1);
}
