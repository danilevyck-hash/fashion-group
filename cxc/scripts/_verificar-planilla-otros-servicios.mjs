// Verifica EN EL NAVEGADOR, con el flujo real de la contable, que escribir en
// "Otros servicios" SUBE el neto a pagar (suma) en vez de bajarlo.
//
// 🩸 Es el bug que este script existe para no volver a dejar pasar: durante un
// día el módulo lo restó, y a cualquiera con algo en esa columna le salía el
// neto al DOBLE de mal.
//
// ⚠️ ESCRIBE EN PRODUCCIÓN y BORRA LO QUE ESCRIBIÓ. Se hace sobre la quincena
// real porque es la única forma de recorrer el camino de verdad (la persona
// tiene que tener marcaciones para que haya un neto que mover). La limpieza va
// al final y se verifica: el script falla si deja una fila.

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3167";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const QUINCENA = "2026-07-2";
const MONTO = 20;

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function filasManuales() {
  const r = await fetch(`${SB}/rest/v1/asistencia_planilla_manual?select=*`, { headers: sbHeaders });
  return r.json();
}

const antesDeTodo = await filasManuales();
if (antesDeTodo.length) {
  console.error("⛔ La tabla NO está vacía. Abortando para no pisar datos reales:");
  console.error(JSON.stringify(antesDeTodo));
  process.exit(1);
}

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_is_owner", "1");
  sessionStorage.setItem("fg_modules", JSON.stringify(["asistencia", "admin"]));
});
const page = await ctx.newPage();

/** El neto y el total de la primera fila calculada (ALEJANDRA CAMAÑO). */
const leerFila = () => page.evaluate(() => {
  const tr = document.querySelector("table tbody tr");
  const tds = [...tr.querySelectorAll("td")].map((t) => t.textContent.trim());
  const pie = [...document.querySelectorAll("table tfoot td")].map((t) => t.textContent.trim());
  return { persona: tds[0], neto: tds[tds.length - 1], netoTotal: pie[pie.length - 1] };
});

let salida = 1;
try {
  await page.goto(`${BASE}/asistencia`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: "Planilla", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.locator("select").first().selectOption(QUINCENA);
  await page.waitForTimeout(6000);

  const antes = await leerFila();
  console.log("ANTES  ", JSON.stringify(antes));

  // La celda de "Otros servicios" es el 5º input de la fila (los 4 primeros son
  // ISR, préstamo, terceros y mercancía).
  const inputs = page.locator("table tbody tr").first().locator("input");
  console.log("inputs en la fila:", await inputs.count());
  await inputs.nth(4).fill(String(MONTO));
  await inputs.nth(4).press("Enter");
  await page.waitForTimeout(5000);

  const despues = await leerFila();
  console.log("DESPUÉS", JSON.stringify(despues));

  const n = (s) => Number(String(s).replace(/[^0-9.]/g, ""));
  const dFila = n(despues.neto) - n(antes.neto);
  const dPie = n(despues.netoTotal) - n(antes.netoTotal);
  const ok = Math.abs(dFila - MONTO) < 0.005 && Math.abs(dPie - MONTO) < 0.005;
  console.log(`\nΔ fila = ${dFila.toFixed(2)}  ·  Δ total = ${dPie.toFixed(2)}  (esperado +${MONTO})`);
  console.log(ok ? "✅ «Otros servicios» SUMA" : "❌ el signo está mal");
  salida = ok ? 0 : 1;

  await page.screenshot({ path: "/tmp/planilla-verif/otros-servicios.png", fullPage: true });
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  await nav.close();
  // Limpieza obligatoria, pase lo que pase.
  const r = await fetch(
    `${SB}/rest/v1/asistencia_planilla_manual?quincena=eq.${QUINCENA}`,
    { method: "DELETE", headers: sbHeaders },
  );
  const quedan = await filasManuales();
  console.log(`limpieza: HTTP ${r.status} · filas que quedan: ${quedan.length}`);
  if (quedan.length) { console.error("⛔ QUEDARON FILAS DE PRUEBA:", JSON.stringify(quedan)); salida = 1; }
  process.exit(salida);
}
