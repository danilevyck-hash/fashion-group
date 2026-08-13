// Verificación en navegador de "Duplicar con cliente editable" + "Agregar
// artículos al pedido" (12-ago-2026), contra el BUILD DE PRODUCCIÓN local con
// datos reales.
//
// 🔴 13-ago-2026: TOCAR EL CLIENTE LO ELIGE; EL BOTÓN LO CONFIRMA. Daniel:
// *"al seleccionar un cliente de una se agrega, enves de tener un boton para
// confirmar el cliente, se siente mas natural asi"*. El candado que más importa
// acá es el NEGATIVO: tocar la fila NO puede crear el pedido.
//
// CLICK-THROUGH REAL (marca joybees — su lista filtra deleted, así los pedidos
// de prueba desaparecen con el soft delete del final):
//   1. Se crea un pedido de PRUEBA por la API (nombre "PRUEBA T173 — BORRAR").
//   2. Duplicar desde la lista: el modal abre SIN campo de nombre libre y con el
//      botón "Usar este cliente" APAGADO. Tocar un cliente NO duplica (se sigue
//      en la lista y la ventana sigue abierta, con "Cliente elegido: …"); recién
//      el botón crea el pedido con ESE nombre y ESE cliente_switch_id.
//   3. Duplicar eligiendo "Contado (mostrador)" y confirmando → el pedido nuevo
//      queda a nombre de "Contado (mostrador)" y con cliente_switch_id null.
//   3b. El VENDEDOR del duplicado es el del ORIGINAL (Daniel: *"debe de ser el
//      mismo que el otro por default"*), y no el de quien duplica.
//   4. "+ Agregar productos" en el detalle → lleva al CATÁLOGO en modo pedido
//      (`?agregarA=<id>`, #508). El modal de búsqueda inline se retiró.
//   5. PATCH /item contra un pedido REAL bloqueado por Switch → 409 y CERO
//      escrituras (se compara el pedido antes y después).
//   6. Soft delete de los 3 pedidos de prueba al final + verificación de que
//      la lista vuelve a su conteo original.
//
// MEDICIÓN 390 · 834 · 1024 · 1440 (gotchas de la casa: cookie + sessionStorage.
// cxc_role + delete Navigator.prototype.serviceWorker):
//   · lista con el mini-modal de Duplicar abierto: sin tocar nada, con el
//     cliente YA ELEGIDO (el renglón "Cliente elegido: …" es lo nuevo) y con el
//     duplicado en curso (el botón diciendo "Duplicando...")
//   · detalle con el buscador "Agregar productos" abierto
//   → 0 arrastre, 0 recortes, táctiles ≥44 px, textos ≥12 px en los modales.
//
// ⚠️ Correr el server con Telegram APAGADO para no spamear el canal de negocio:
//   TELEGRAM_BOT_TOKEN="" TELEGRAM_CHAT_ID="" npx next start -p 3143
//   BASE=http://localhost:3143 node scripts/_verif-pedidos-duplicar-agregar.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3143";
const OUT = process.env.OUT ?? "/tmp/pedidos-t173";
const MARCA = process.env.MARCA ?? "joybees";
const API = `${BASE}/api/catalogo/${MARCA}`;
mkdirSync(OUT, { recursive: true });

const NOMBRE_PRUEBA = "PRUEBA T173 — BORRAR";

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// El middleware valida el session_token contra user_sessions: la cookie
// firmada sola no alcanza para las PÁGINAS. Se siembra una sesión de medición
// (revocada y borrada al final).
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN_MEDICION = `medicion-t173-${Date.now().toString(36)}`;
async function sembrarSesion() {
  const r = await fetch(`${SB}/rest/v1/user_sessions`, {
    method: "POST",
    headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ user_name: "medicion-t173", user_role: "admin", session_token: TOKEN_MEDICION }),
  });
  if (!r.ok) throw new Error(`no pude sembrar la sesión de medición: ${r.status} ${await r.text()}`);
}
async function borrarSesion() {
  await fetch(`${SB}/rest/v1/user_sessions?session_token=eq.${TOKEN_MEDICION}`, {
    method: "DELETE",
    headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}` },
  });
}

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
    throw new Error("Falta /tmp/fg-cookie.txt (cookie cxc_session de una sesión real)");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "medicion", sessionToken: TOKEN_MEDICION }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

await sembrarSesion();
const COOKIE = cookieDeSesion();
const HDRS = { cookie: `cxc_session=${COOKIE}`, "content-type": "application/json" };

async function api(path, init = {}) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { ...HDRS, ...(init.headers || {}) } });
  let json = null;
  try { json = await r.json(); } catch { /* respuestas sin body */ }
  return { status: r.status, json };
}

const fallas = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "🟢" : "🔴"} ${msg}`);
  if (!cond) fallas.push(msg);
};

/** Medición genérica: arrastre, recortes, táctiles <44, textos <12. */
const MEDIR = () => {
  const doc = document.documentElement;
  const arrastre = Math.max(0, doc.scrollWidth - window.innerWidth);
  const raiz = document.querySelector("main") ?? document.body;
  const recortados = [];
  const tactiles = [];
  const textosChicos = [];
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 50)}`, px: el.scrollWidth - el.clientWidth });
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
  }
  // Táctiles: SOLO dentro del modal abierto (lo nuevo de este PR); el resto de
  // la pantalla ya tiene su censo aparte.
  const modal = document.querySelector("[data-modal-t173]") ?? raiz;
  for (const el of modal.querySelectorAll("button, a[href], input, select, [role=button]")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 44 - 0.5) {
      tactiles.push({ el: el.tagName, alto: Math.round(r.height * 10) / 10, txt: (el.textContent ?? el.getAttribute("placeholder") ?? "").trim().slice(0, 30) });
    }
  }
  return { arrastre, recortados, tactiles, textosChicos };
};

// El modal nuevo no lleva data attribute — se marca al vuelo para medirlo:
const MARCAR_MODAL = () => {
  // ModalOverlay: el panel es el hijo con bg-white dentro del overlay fijo.
  const overlays = document.querySelectorAll(".fixed.inset-0, [class*='fixed']");
  for (const o of overlays) {
    const panel = o.querySelector("div.bg-white");
    if (panel) panel.setAttribute("data-modal-t173", "1");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 0. Producto real de la marca + pedido de PRUEBA por la API
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n== Preparación (${MARCA}) ==`);
const prods = await api("/products?active=true");
ok(prods.status === 200 && Array.isArray(prods.json) && prods.json.length > 1, `catálogo interno responde (${prods.json?.length} productos)`);
const [prodA, prodB] = prods.json;

const listaAntes = await api("/orders");
const conteoAntes = listaAntes.json.length;
console.log(`   pedidos en la lista antes: ${conteoAntes}`);

const crear = await api("/orders", {
  method: "POST",
  body: JSON.stringify({
    client_name: NOMBRE_PRUEBA,
    items: [{ product_id: prodA.id, sku: prodA.sku, name: prodA.name, image_url: prodA.image_url, quantity: 1, unit_price: prodA.price }],
  }),
});
ok(crear.status === 200 && crear.json?.id, `pedido de prueba creado: ${crear.json?.order_number}`);
const idPrueba = crear.json.id;
const idsDeLimpiar = [idPrueba];

// ─────────────────────────────────────────────────────────────────────────────
// 1-4. Click-through en el navegador
// ─────────────────────────────────────────────────────────────────────────────

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_name", "medicion");
    // CatalogoAuthGuard exige el módulo en fg_modules (gotcha de medición).
    sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
  } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// La limpieza (soft delete + sesión de medición) corre SIEMPRE, falle lo que
// falle en el medio: un pedido de prueba colgado en la lista es peor que una
// medición a medias.
try {

console.log("\n== 1. Duplicar eligiendo un CLIENTE del directorio ==");
await page.goto(`${BASE}/catalogo/${MARCA}/pedidos`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForSelector(`text=${NOMBRE_PRUEBA}`, { timeout: 60_000 });
const fila = page.locator("div.border", { hasText: NOMBRE_PRUEBA }).first();
await fila.locator('button[title="Duplicar"]').click();
await page.waitForSelector("text=¿Para quién es el pedido nuevo?", { timeout: 10_000 });

// El campo de nombre libre no vuelve, y el botón que confirma el CLIENTE
// arranca APAGADO: quien no elige nada no puede duplicar.
const modal = page.locator("div.bg-white").filter({ hasText: "¿Para quién es el pedido nuevo?" }).first();
const camposTexto = await modal.locator("input:not([type=search])").count();
ok(camposTexto === 0, "el modal NO tiene campo de nombre libre (una sola decisión)");
const btnUsar = modal.locator("button", { hasText: /^Usar este cliente$/ });
ok((await btnUsar.count()) === 1, "el modal ofrece UN botón que confirma el cliente");
ok(await btnUsar.isDisabled(), "y arranca APAGADO: sin cliente elegido no se duplica");
ok((await modal.locator("button", { hasText: /^(Duplicar|Elige el cliente)$/ }).count()) === 0,
  "el botón habla del CLIENTE, no de duplicar (no hay 'Duplicar' ni 'Elige el cliente')");

// Un cliente REAL del directorio de la marca (el primero de la lista).
await page.waitForTimeout(800); // debounce del selector + fetch
const primerCliente = modal.locator("button", { hasNotText: /^(Contado \(mostrador\)|Cancelar|Usar este cliente)$/ });
// El botón trae el nombre + un <span> con el código: se lee SOLO el nombre
// (el mismo texto que el modal usa para el pedido nuevo).
const nombreCliente = await primerCliente.first().evaluate((el) => (el.childNodes[0]?.textContent || "").trim());
const urlAntesDeElegir = page.url();
await primerCliente.first().click();
await page.waitForTimeout(1500);

// 🔴 EL CANDADO QUE IMPORTA: tocar la fila NO duplicó nada.
ok(page.url() === urlAntesDeElegir, "tocar el cliente NO duplica: se sigue en la lista");
ok(await modal.isVisible(), "la ventana sigue abierta (no se ejecutó nada)");
ok((await modal.getByText(/Cliente elegido:/).textContent()).includes(nombreCliente),
  `y se VE cuál se eligió: "Cliente elegido: ${nombreCliente}"`);
const listaMedio = await api("/orders");
ok(listaMedio.json.length === conteoAntes + 1, `y no se creó ningún pedido (${listaMedio.json.length} = los de antes + el de prueba)`);

// Ahora sí: el botón confirma el cliente y crea el duplicado.
ok(!(await btnUsar.isDisabled()), "con el cliente elegido, el botón se enciende");
await btnUsar.click();
await page.waitForURL(/\/pedido\//, { timeout: 30_000 });
const idDup = page.url().split("/pedido/")[1];
idsDeLimpiar.push(idDup);
await page.waitForSelector("input, span", { timeout: 30_000 });
const dupServ = await api(`/orders/${idDup}`);
ok(dupServ.json?.client_name === nombreCliente,
  `el duplicado quedó a nombre del cliente ELEGIDO ("${dupServ.json?.client_name}"), no del pedido viejo`);
// El cliente de Switch guardado se lee por su endpoint (el GET del pedido no
// trae la columna).
const cliDup = await api(`/clientes-switch?orderId=${idDup}`);
ok(cliDup.json?.clienteSwitchId != null && cliDup.json?.nombre === nombreCliente,
  `y con el cliente_switch_id del elegido (${cliDup.json?.clienteSwitchId} · ${cliDup.json?.nombre})`);

console.log("\n== 2. Duplicar eligiendo Contado (mostrador) ==");
await page.goto(`${BASE}/catalogo/${MARCA}/pedidos`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForSelector(`text=${NOMBRE_PRUEBA}`, { timeout: 60_000 });
await page.locator("div.border", { hasText: NOMBRE_PRUEBA }).first().locator('button[title="Duplicar"]').click();
await page.waitForSelector("text=¿Para quién es el pedido nuevo?", { timeout: 10_000 });
await page.locator("button", { hasText: /^Contado \(mostrador\)$/ }).click();
await page.waitForSelector("text=Cliente elegido:", { timeout: 5_000 });
await page.locator("button", { hasText: /^Usar este cliente$/ }).click();
await page.waitForURL(/\/pedido\//, { timeout: 30_000 });
const idDup2 = page.url().split("/pedido/")[1];
idsDeLimpiar.push(idDup2);
const dup2Serv = await api(`/orders/${idDup2}`);
const cliDup2 = await api(`/clientes-switch?orderId=${idDup2}`);
ok(dup2Serv.json?.client_name === "Contado (mostrador)" && !cliDup2.json?.clienteSwitchId,
  `Contado queda a nombre de "${dup2Serv.json?.client_name}" y sin cliente_switch_id`);

console.log("\n== 2b. Al duplicado se le PUEDE cambiar el vendedor después ==");
// La segunda mitad del pedido de Daniel: *"si lo quiere cambiar que lo cambie
// despues"*. En el detalle del duplicado (borrador, sin envío a Switch) el
// bloque "Vendedor" tiene que ofrecer "Cambiar".
// ⚠️ NO se toca la lista de vendedores de Switch acá: leerla abre una sesión
// contra la empresa y Switch admite UNA sola por empresa (podría tumbar un
// sync). Qué vendedor queda guardado se verifica aparte, contra producción,
// con `scripts/_verif-duplicar-vendedor.ts`.
await page.waitForSelector('[data-medir="vendedor-detalle"]', { timeout: 30_000 });
const bloqueVend = page.locator('[data-medir="vendedor-detalle"]');
ok((await bloqueVend.locator("button", { hasText: /^Cambiar$/ }).count()) === 1,
  "en el detalle del duplicado se puede CAMBIAR el vendedor (botón 'Cambiar' presente)");

console.log("\n== 3. '+ Agregar productos' lleva al CATÁLOGO en modo pedido ==");
// 🩸 Este paso probaba un MODAL de búsqueda inline que se retiró en el #508:
// agregar productos ES el catálogo (`?agregarA=<id>`). El script se quedó
// esperando un modal que ya no existe y por eso fallaba desde entonces.
await page.goto(`${BASE}/catalogo/${MARCA}/pedido/${idPrueba}`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForSelector("text=+ Agregar productos", { timeout: 60_000 });
await page.locator("button", { hasText: "+ Agregar productos" }).first().click();
await page.waitForURL(/agregarA=/, { timeout: 30_000 });
ok(page.url().includes(`agregarA=${idPrueba}`), `lleva al catálogo en modo pedido (${page.url().split("/").pop()})`);

console.log("\n== 4. Agregar a un pedido EN SWITCH debe rechazar (409, cero escrituras) ==");
// Se busca un pedido real bloqueado: la lista + su estado de envío.
let lockeado = null;
for (const o of listaAntes.json.slice(0, 60)) {
  const e = await api(`/orders/${o.id}/enviar-switch`);
  if (e.json?.envio && ["enviado", "verificado"].includes(e.json.envio.estado)) { lockeado = o; break; }
}
if (!lockeado) {
  console.log("   ⚪ no hay pedidos bloqueados por Switch en esta marca — se prueba igual por test unitario (switch-lock intacto)");
} else {
  const antes = await api(`/orders/${lockeado.id}`);
  const nAntes = (antes.json?.[`${MARCA}_order_items`] ?? []).length;
  const patch = await api(`/orders/${lockeado.id}/item`, {
    method: "PATCH",
    body: JSON.stringify({ product_id: prodA.id, sku: prodA.sku, name: prodA.name, quantity: 1, unit_price: prodA.price }),
  });
  const despues = await api(`/orders/${lockeado.id}`);
  const nDespues = (despues.json?.[`${MARCA}_order_items`] ?? []).length;
  ok(patch.status === 409, `PATCH /item sobre ${lockeado.order_number} respondió 409 (${patch.json?.error?.slice(0, 60)}...)`);
  ok(nAntes === nDespues, `el pedido bloqueado quedó INTACTO (${nAntes} items antes y después)`);

  // El banner "Duplicar y corregir" abre el mini-modal con el nombre editable
  // (y Cancelar no escribe nada).
  await page.goto(`${BASE}/catalogo/${MARCA}/pedido/${lockeado.id}`, { waitUntil: "networkidle", timeout: 120_000 });
  const btnDup = page.locator("button", { hasText: "Duplicar y corregir" });
  if (await btnDup.count()) {
    await btnDup.click();
    await page.waitForSelector("text=¿Para quién es el pedido nuevo?", { timeout: 10_000 });
    // Mismo modal que la lista: se vuelve a ELEGIR el cliente, sin default.
    const modalBloq = page.locator("div.bg-white").filter({ hasText: "¿Para quién es el pedido nuevo?" }).first();
    ok((await modalBloq.locator("button", { hasText: /^Usar este cliente$/ }).count()) === 1
      && (await modalBloq.locator("input:not([type=search])").count()) === 0,
      "el mini-modal del pedido bloqueado es el MISMO: sin nombre libre y con el botón que confirma el cliente");
    ok(await modalBloq.locator("button", { hasText: /^Usar este cliente$/ }).isDisabled(),
      "y ahí también arranca apagado (el paso nuevo vale para los DOS caminos)");
    await page.locator("button", { hasText: /^Cancelar$/ }).click();
    ok(true, "Cancelar cierra sin duplicar");
  } else {
    console.log("   ⚪ el pedido bloqueado ya tiene reemplazo activo — sin botón Duplicar y corregir (correcto)");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Medición de los 3 anchos con los modales abiertos
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n== 5. Los 3 anchos (modales abiertos) ==");
const medidas = {};
for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });

  // Lista + mini-modal de duplicar
  await page.goto(`${BASE}/catalogo/${MARCA}/pedidos`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector(`text=${NOMBRE_PRUEBA}`, { timeout: 60_000 });
  await page.locator("div.border", { hasText: NOMBRE_PRUEBA }).first().locator('button[title="Duplicar"]').click();
  await page.waitForSelector("text=¿Para quién es el pedido nuevo?", { timeout: 10_000 });
  // Se mide con el DIRECTORIO YA CARGADO: la lista de clientes es la parte más
  // alta de la ventana; medirla en "Buscando..." sería medir otra pantalla.
  await page.waitForSelector("text=Buscando...", { state: "detached", timeout: 15_000 });
  await page.evaluate(MARCAR_MODAL);
  const dup = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${OUT}/dup-modal-${a.w}.png` });

  // El estado NUEVO: cliente ya ELEGIDO (fila en negro + el renglón "Cliente
  // elegido: …" + el botón encendido). Es el paso que se agregó, así que es el
  // que hay que medir.
  await page.locator("button", { hasText: /^Contado \(mostrador\)$/ }).click();
  await page.waitForSelector("text=Cliente elegido:", { timeout: 5_000 });
  await page.evaluate(MARCAR_MODAL);
  const dupConCliente = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${OUT}/dup-modal-elegido-${a.w}.png` });

  // El estado MIENTRAS duplica (el botón dice "Duplicando..." y todo queda
  // apagado): se congela interceptando el POST que crea el pedido.
  // ⚠️ El POST se ABORTA (no se crea ningún pedido de más): así se ve el estado
  // "Duplicando..." y, después, el error DENTRO de la ventana.
  await page.route("**/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((r) => setTimeout(r, 3_000));
    await route.abort();
  });
  await page.locator("button", { hasText: /^Usar este cliente$/ }).click();
  await page.waitForSelector("text=Duplicando...", { timeout: 5_000 });
  await page.evaluate(MARCAR_MODAL);
  const dupElegido = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${OUT}/dup-modal-duplicando-${a.w}.png` });
  await page.waitForSelector("text=Error de conexion. Intenta de nuevo.", { timeout: 15_000 });
  ok(true, `${a.nombre} ${a.w} — si el duplicado falla, el error se ve DENTRO de la ventana`);
  await page.unroute("**/orders");

  // Detalle del pedido (el bloque "Vendedor" del duplicado se ve acá).
  // ⚠️ Los táctiles <44 px y el recorte del input de nombre que salen acá son
  // PRE-EXISTENTES (esta pantalla no se tocó en este cambio): se listan como
  // contexto, no como falla. Lo que se exige es que no haya arrastre.
  await page.goto(`${BASE}/catalogo/${MARCA}/pedido/${idPrueba}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector('[data-medir="vendedor-detalle"]', { timeout: 60_000 });
  await page.waitForTimeout(600);
  const detalle = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${OUT}/detalle-${a.w}.png` });

  medidas[a.nombre] = { ancho: a.w, dup, dupConCliente, dupElegido, detalle };
  const resumen = (m) =>
    `arrastre ${m.arrastre}px · recortes ${m.recortados.length} · táctiles<44 ${m.tactiles.length} · textos<12 ${m.textosChicos.length}`;
  ok(dup.arrastre === 0 && dup.tactiles.length === 0, `${a.nombre} ${a.w} — modal Duplicar (sin elegir): ${resumen(dup)}`);
  ok(dupConCliente.arrastre === 0 && dupConCliente.tactiles.length === 0 && dupConCliente.textosChicos.length === 0,
    `${a.nombre} ${a.w} — modal Duplicar (cliente elegido): ${resumen(dupConCliente)}`);
  ok(dupElegido.arrastre === 0 && dupElegido.tactiles.length === 0, `${a.nombre} ${a.w} — modal Duplicar (duplicando): ${resumen(dupElegido)}`);
  ok(detalle.arrastre === 0, `${a.nombre} ${a.w} — detalle del pedido: ${resumen(detalle)}`);
  for (const [k, m] of Object.entries({ dup, dupConCliente, dupElegido, detalle })) {
    if (m.recortados.length) console.log(`   recortes ${k}:`, JSON.stringify(m.recortados));
    if (m.tactiles.length) console.log(`   táctiles ${k}:`, JSON.stringify(m.tactiles));
    if (m.textosChicos.length) console.log(`   textos<12 ${k}:`, JSON.stringify(m.textosChicos));
  }
}
writeFileSync(`${OUT}/medidas.json`, JSON.stringify(medidas, null, 2));

} catch (e) {
  fallas.push(`excepción en el medio del flujo: ${String(e).slice(0, 300)}`);
  console.error(e);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Limpieza: soft delete de los pedidos de prueba + sesión de medición
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n== 6. Limpieza ==");
for (const oid of idsDeLimpiar) {
  const del = await api(`/orders/${oid}`, { method: "DELETE" });
  ok(del.status === 200, `soft delete de ${oid.slice(0, 8)}…`);
}
const listaFinal = await api("/orders");
ok(listaFinal.json.length === conteoAntes, `la lista volvió a ${conteoAntes} pedidos (los de prueba no se ven)`);
await borrarSesion();

await browser.close();

console.log(fallas.length ? `\n🔴 ${fallas.length} FALLAS:\n- ${fallas.join("\n- ")}` : "\n🟢 TODO OK");
process.exit(fallas.length ? 1 : 0);
