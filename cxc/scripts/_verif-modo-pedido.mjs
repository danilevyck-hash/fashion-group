// CLICK-THROUGH REAL del catálogo en modo pedido, contra un pedido de PRUEBA.
//
//   BASE=http://localhost:3000 PEDIDO=<uuid> MARCA=tommy node scripts/_verif-modo-pedido.mjs
//
// Qué prueba, en el navegador y contra la base de verdad:
//   1. agregar desde el catálogo escribe en ESE pedido (se lee después por API);
//   2. y NO escribe en el carrito (sessionStorage/localStorage quedan limpios);
//   3. "Listo, volver al pedido" vuelve al detalle, que ya muestra la línea;
//   4. salir del modo (quitar el parámetro) deja el catálogo normal, y ahí
//      "Agregar" vuelve a ir al carrito y NO toca el pedido;
//   5. el carrito NO sobrevive a una sesión nueva.
//
// ⚠️ Escribe SOLO en el pedido que se le pasa. Usar un pedido de prueba y
// borrarlo (soft delete) al terminar. NUNCA toca Switch.

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PEDIDO = process.env.PEDIDO;
const MARCA = process.env.MARCA ?? "tommy";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

if (!PEDIDO) { console.error("Falta PEDIDO=<uuid del pedido de PRUEBA>"); process.exit(1); }

const api = async (ruta) => {
  const r = await fetch(`${BASE}${ruta}`, { headers: { Cookie: `cxc_session=${COOKIE}` } });
  return r.json();
};
const lineas = async () => {
  const d = await api(`/api/catalogo/${MARCA}/orders/${PEDIDO}`);
  return (d[`${MARCA}_order_items`] || []).map((i) => ({ sku: i.sku, q: i.quantity, p: i.unit_price }));
};

let fallos = 0;
const check = (ok, texto) => { console.log(`${ok ? "🟢" : "🔴"} ${texto}`); if (!ok) fallos++; };

const antes = await lineas();
console.log("Pedido ANTES:", JSON.stringify(antes));

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_user_name", "daniel");
  sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
});
const page = await ctx.newPage();

// ── 1 y 2: agregar desde el catálogo en modo pedido ──
await page.goto(`${BASE}/catalogo/${MARCA}?agregarA=${PEDIDO}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
const barra = await page.locator("[data-modo-pedido]").first().innerText();
console.log("BARRA:", barra.replace(/\n/g, " · "));

// El primer producto que NO esté ya en el pedido (los que están muestran +/−).
const boton = page.locator('button:has-text("Agregar")').first();
const tarjeta = boton.locator("xpath=ancestor::div[contains(@class,'bg-white')][1]");
const sku = (await tarjeta.locator(".font-mono, [class*=skuPill]").first().innerText().catch(() => "")).trim();
await boton.click();
await page.waitForTimeout(3000);

const despues = await lineas();
console.log("Pedido DESPUÉS:", JSON.stringify(despues));
check(despues.length === antes.length + 1, `la línea entró al pedido (${antes.length} → ${despues.length} líneas)`);

const storage = await page.evaluate(() => ({
  sesion: sessionStorage.getItem(`${location.pathname.split("/")[2]}_cart`),
  local: localStorage.getItem(`${location.pathname.split("/")[2]}_cart`),
}));
check(!storage.sesion && !storage.local, `el carrito quedó intacto (sesión=${storage.sesion} local=${storage.local})`);

// El contador de la barra refleja lo agregado.
const barra2 = await page.locator("[data-modo-pedido]").first().innerText();
check(/bulto/.test(barra2), `la barra cuenta los bultos: "${barra2.replace(/\n/g, " · ")}"`);

// ── 3: volver al pedido ──
await page.locator('a:has-text("Listo, volver al pedido")').click();
await page.waitForTimeout(5000);
check(page.url().includes(`/pedido/${PEDIDO}`), `"Listo, volver al pedido" vuelve al detalle (${page.url()})`);
const textoPedido = await page.locator("body").innerText();
check(sku ? textoPedido.includes(sku) : true, `el detalle ya muestra la línea nueva (${sku})`);

// ── 4: salir del modo deja el catálogo NORMAL (Agregar → carrito) ──
const antesNormal = await lineas();
await page.goto(`${BASE}/catalogo/${MARCA}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
check((await page.locator("[data-modo-pedido]").count()) === 0, "sin el parámetro no hay barra: catálogo normal");
await page.locator('button:has-text("Agregar")').first().click();
await page.waitForTimeout(2500);
const carrito = await page.evaluate((m) => sessionStorage.getItem(`${m}_cart`), MARCA);
check(!!carrito && JSON.parse(carrito).length > 0, `fuera del modo, Agregar va al CARRITO (${carrito})`);
const igual = JSON.stringify(await lineas()) === JSON.stringify(antesNormal);
check(igual, "y el pedido NO se tocó");

// ── 5: el carrito no sobrevive a una sesión nueva ──
const ctx2 = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctx2.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx2.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx2.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
});
const page2 = await ctx2.newPage();
await page2.goto(`${BASE}/catalogo/${MARCA}`, { waitUntil: "domcontentloaded" });
await page2.waitForTimeout(6000);
const carrito2 = await page2.evaluate((m) => sessionStorage.getItem(`${m}_cart`), MARCA);
const barraCarrito = await page2.locator("text=Ver pedido").count();
check(!carrito2 && barraCarrito === 0, `sesión NUEVA = carrito vacío (${carrito2}) y sin barra de carrito`);

await nav.close();
console.log(fallos === 0 ? "\n🟢 TODO OK" : `\n🔴 ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
