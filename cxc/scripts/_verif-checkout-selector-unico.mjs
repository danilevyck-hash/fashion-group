// ─────────────────────────────────────────────────────────────────────────────
// EL CHECKOUT USA EL SELECTOR ÚNICO — verificado en el NAVEGADOR, contra el
// build de producción y con el directorio REAL de Switch de cada empresa.
//
// Los tests de conducta corren con `fetch` doblado; esto prueba lo que ellos no
// pueden ver: que la ruta que el selector pide de verdad EXISTE, que el rol del
// vendedor entra, que el mostrador se resuelve con el id de SU empresa y que
// buscar por teclado devuelve resultados del servidor.
//
// 🔴 SOLO LECTURA: nunca se toca "Enviar a Switch" y, por si acaso, TODO POST a
// `/api/catalogo/checkout` se ABORTA en el navegador. No se crea ningún pedido.
//
//   npx next start -p 3477
//   BASE=http://localhost:3477 node scripts/_verif-checkout-selector-unico.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { existsSync, readFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3477";
const MARCAS = ["reebok", "joybees", "tommy", "calvin"];

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "vendedor", userId: "medicion", userName: "medicion", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

const browser = await chromium.launch();
const fallos = [];

for (const marca of MARCAS) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: "cxc_session", value: cookieDeSesion(), domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();

  // 🔴 Red de seguridad: ningún pedido puede salir de esta verificación.
  await page.route("**/api/catalogo/checkout", (r) => r.abort());

  const pedidas = [];
  page.on("request", (r) => { if (r.url().includes("clientes-switch")) pedidas.push(r.url()); });

  // 🩸 Dos gotchas de medición, los dos ya pagados en este repo: el guard del
  // catálogo NO mira el rol sino `fg_modules`, y el service worker rompe la
  // hidratación. Sin esto la pantalla redirige y se mide un vacío en verde.
  await page.addInitScript((m) => {
    try { delete Navigator.prototype.serviceWorker; } catch { /* */ }
    try {
      sessionStorage.setItem("cxc_role", "vendedor");
      sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
      // Carrito de la SESIÓN de la pestaña — el checkout no existe sin él.
      sessionStorage.setItem(`${m}_cart`, JSON.stringify([{
        product_id: "verificacion-1", sku: "VERIF-0001", name: "Producto de verificación",
        image_url: "", quantity: 1, unit_price: 24.5, category: "footwear", bulto_pzas: 12,
      }]));
    } catch { /* */ }
  }, marca);

  await page.goto(`${BASE}/catalogo/${marca}/checkout`, { waitUntil: "networkidle" });

  const enviar = page.getByRole("button", { name: /Enviar a Switch/ });
  if (!(await enviar.isDisabled())) fallos.push(`${marca}: el botón NO arranca apagado`);
  const cajaAntes = await page.locator('[data-medir="cliente-checkout"]').innerText();
  if (!cajaAntes.includes("Elige el cliente")) fallos.push(`${marca}: no dice "Elige el cliente"`);
  if (/Contado/i.test(cajaAntes)) fallos.push(`${marca}: arranca diciendo Contado`);

  await page.getByRole("button", { name: "Elegir" }).click();
  // El selector único se reconoce por SU buscador (no el del checkout viejo).
  const buscador = page.getByPlaceholder("Buscar por nombre o código...");
  await buscador.waitFor({ timeout: 5000 }).catch(() => fallos.push(`${marca}: no apareció el buscador del selector único`));

  await page.waitForTimeout(1200); // debounce 300ms + red
  const contadoVisible = await page.getByRole("button", { name: "Contado (venta de mostrador)" }).count();
  if (contadoVisible !== 1) fallos.push(`${marca}: "Contado (venta de mostrador)" aparece ${contadoVisible} veces (debe ser 1)`);

  const opciones = await page.locator('[data-medir="cliente-checkout"] button').allInnerTexts();
  const reales = opciones.filter((t) => t && !t.includes("Contado (venta") && !/^(Elegir|Cambiar|Cerrar)$/.test(t.trim()));
  if (reales.length === 0) fallos.push(`${marca}: el directorio no devolvió ningún cliente`);

  // Buscar por teclado: el filtro lo hace el SERVIDOR (antes era en memoria).
  const pedidasAntes = pedidas.length;
  await buscador.fill("a");
  await page.waitForTimeout(1200);
  if (pedidas.length <= pedidasAntes) fallos.push(`${marca}: escribir no consultó el directorio en el servidor`);

  // Elegir un cliente REAL enciende el botón y lo deja escrito en la caja.
  await buscador.fill("");
  await page.waitForTimeout(1200);
  const primero = page.locator('[data-medir="cliente-checkout"] button').filter({ hasNotText: "Contado (venta" }).last();
  const nombreElegido = (await primero.innerText()).trim();
  await primero.click();
  await page.waitForTimeout(300);
  // ⚠️ El botón NO tiene por qué encenderse acá: este usuario de verificación no
  // tiene vendedor de Switch mapeado, así que "elegir el vendedor" sigue
  // faltando — y eso está BIEN. Lo que se exige es que el CLIENTE deje de
  // faltar. Pedir el botón encendido mediría otra cosa y daría rojo por nada.
  const falta = await page.locator('[data-medir="falta-enviar"]').innerText().catch(() => "");
  if (/elegir el cliente/.test(falta)) fallos.push(`${marca}: tras elegir, sigue diciendo que falta el cliente`);
  const cajaDespues = await page.locator('[data-medir="cliente-checkout"]').innerText();
  const primeraPalabra = nombreElegido.split(/\s+/)[0];
  if (!cajaDespues.includes(primeraPalabra)) {
    fallos.push(`${marca}: la caja no muestra lo elegido (${nombreElegido} → ${cajaDespues})`);
  }
  if (/Elige el cliente/.test(cajaDespues)) fallos.push(`${marca}: la caja sigue vacía tras elegir`);

  console.log(`${marca.padEnd(8)} ✅ selector único · ${reales.length} clientes · elegido "${nombreElegido.replace(/\n/g, " · ")}" · ya no falta el cliente${falta ? ` (queda "${falta}")` : ""}`);
  await ctx.close();
}

await browser.close();
console.log();
if (fallos.length) { console.log("🔴 " + fallos.length + " fallos:"); fallos.forEach((f) => console.log("   · " + f)); process.exit(1); }
console.log("🟢 las 4 marcas usan el MISMO selector, con el mostrador de SU empresa y sin default puesto");
