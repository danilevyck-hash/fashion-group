// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — EL PARPADEO AL ABRIR «EDITAR», ANTES Y DESPUÉS (25-ago-2026).
//
// Mide TRES cosas sobre una guía PENDIENTE REAL de producción:
//   1. CAPTURAS EN SECUENCIA a 0 · 100 · 300 · 1000 ms desde que se toca
//      «Editar», y qué pantalla se ve en cada instante (vacío · LECTURA ·
//      formulario). En `origin/main` a los ~100 ms se ve la pantalla de LECTURA
//      y después salta al formulario; acá no.
//   2. CUÁNTAS LLAMADAS DE RED cuesta abrir «Editar», y **cuántas veces se pide
//      la GUÍA** en cada caso (main la pedía DOS veces: una la página y otra
//      `<EdicionGuia>`).
//   3. Que al CERRAR la edición la URL **deje de decir `?editar=1`** (en main
//      se queda diciéndolo, así que recargar reabre el formulario).
//
// 🔴 NO TOCA NINGUNA GUÍA REAL. En el navegador se aborta **cualquier pedido
// que no sea GET**, así que ni un clic accidental puede escribir. Nunca se
// aprieta «Despachar» ni «Guardar».
//
//   BASE=http://localhost:3213 ETAPA=despues node scripts/_medir-guias-parpadeo-editar.mjs
//   BASE=http://localhost:3214 ETAPA=antes   node scripts/_medir-guias-parpadeo-editar.mjs
//
// 🩸 POR QUÉ SE ENTRA POR LA URL `?editar=1` Y NO POR EL BOTÓN DE LA FILA:
// en `origin/main` la fila tiene UN SOLO botón («Despachar», que lleva a la
// guía en LECTURA) — el botón «Editar» de la fila es de esta rama. La URL
// `?editar=1` sí existe en las dos (es por donde entra el camino viejo
// `/guias/[id]/editar`, que redirige ahí), así que es el ÚNICO punto de partida
// idéntico. Comparar dos caminos distintos no compararía nada.
//
// Gotchas de la casa: sembrar `sessionStorage.cxc_role` y borrar
// `Navigator.prototype.serviceWorker` ANTES de navegar; los rótulos llevan
// `uppercase` por CSS, así que todo se compara con /i.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3213";
const ETAPA = process.env.ETAPA ?? "despues";
const SALIDA = process.env.SALIDA ?? `/tmp/guias-parpadeo-${ETAPA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

/** Guía PENDIENTE REAL de producción. Se LEE, nunca se escribe. */
const PENDIENTE = { id: "fa6dafb3-604e-400e-8677-f7867a2cc206", rotulo: "GT-230" };

/** Los instantes del mockup: el parpadeo vive entre los 100 y los 300 ms. */
const INSTANTES = [0, 100, 300, 1000];

/**
 * `FINO=1` muestrea cada 40 ms hasta que el formulario abre, además de las 4
 * capturas.
 *
 * 🩸 POR QUÉ EXISTE: cuatro instantes pueden CAERSE JUSTO EN EL HUECO. Si la
 * pantalla de lectura se dibuja entre los 300 y los 1000 ms —cuando llega la
 * guía—, las capturas de 300 y 1000 la saltean y el medidor diría "no hay
 * parpadeo" sin haber mirado ahí. El muestreo fino recorre TODO el tramo.
 */
const FINO = process.env.FINO === "1";

/**
 * Cómo se llega a la edición:
 *   MODO=url   (por defecto) — `page.goto` a `?editar=1`. Es el ÚNICO punto de
 *              partida idéntico en las dos ramas, así que es con el que se
 *              comparan las LLAMADAS DE RED.
 *   MODO=clic  — el camino REAL de la persona, TOCANDO los botones. 🔴 Y es
 *              otra cosa: es una navegación del SPA (`router.push`), donde
 *              React dibuja la pantalla nueva SIN datos en el primer cuadro —
 *              justo donde vive el parpadeo. Un `goto` recarga la página
 *              entera y ese primer cuadro no existe.
 *              En esta rama el camino es «Editar» en la fila; en `origin/main`
 *              la fila no tiene ese botón, así que es «Despachar» → la guía en
 *              LECTURA → «Editar» adentro (que son los toques que main cuesta).
 */
const MODO = process.env.MODO === "clic" ? "clic" : "url";

mkdirSync(SALIDA, { recursive: true });

/**
 * ¿Qué pantalla se está viendo AHORA?
 *
 * 🔑 «formulario» se decide por el TÍTULO del alta, no por la existencia de un
 * campo: el esqueleto del formulario también es "el formulario abierto" desde
 * el punto de vista de quien mira, y es justamente lo que reemplazó al
 * parpadeo. «lectura» es la pantalla vieja: la que ofrece «Editar» o dibuja
 * «Cómo sale».
 */
const QUE_SE_VE = (idGuia) => {
  const txt = document.body.innerText || "";
  const botones = [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim());
  // 🩸 GOTCHA que daba «LECTURA» sin haber salido de la lista: el acordeón
  // también tiene un botón «Editar» por fila. Sin mirar la URL, los primeros
  // cuadros de una navegación del SPA —donde la pantalla vieja sigue puesta—
  // se leían como "la guía en lectura" y el medidor inventaba un parpadeo.
  const enLaGuia = location.pathname === `/guias/${idGuia}`;
  const esFormulario = /editar gu[ií]a de transporte/i.test(txt);
  // El esqueleto de <EdicionGuia> mientras carga: barras grises, sin texto.
  const esEsqueleto = !!document.querySelector(".animate-pulse");
  const esLectura =
    enLaGuia && !esFormulario &&
    (botones.some((b) => /^editar$/i.test(b)) || /c[óo]mo sale/i.test(txt) || /ya despachada/i.test(txt));
  return {
    estado: !enLaGuia ? "la lista" : esFormulario ? "formulario" : esLectura ? "LECTURA" : esEsqueleto ? "esqueleto" : "vacío",
    tieneCampos: !!document.querySelector('input[id^="cliente-"]'),
    url: location.pathname + location.search,
    // 🩸 El título del alta lleva `uppercase` por CSS: `innerText` lo devuelve
    // en MAYÚSCULAS y compararlo tal cual daría SIEMPRE false.
    primerRenglon: (txt.split("\n").find((l) => l.trim()) || "").trim().slice(0, 40),
  };
};

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_is_owner", "1");
});
const page = await ctx.newPage();

const pedidos = [];
const escrituras = [];
await page.route("**/*", async (route) => {
  const req = route.request();
  const url = req.url().replace(BASE, "");
  // 🔴 Nada que no sea GET sale de acá.
  if (req.method() !== "GET") { escrituras.push(`${req.method()} ${url}`); return route.abort(); }
  if (url.startsWith("/api/")) pedidos.push(url);
  return route.continue();
});

const problemas = [];

// ── 1 · el parpadeo, con capturas en secuencia ───────────────────────────────
// Se arranca desde la lista para que el navegador ya esté "caliente" (es el
// camino real: se viene de /guias). La navegación se hace por la URL, que es
// el único punto de partida que existe en las DOS ramas.
await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
await page.waitForFunction((r) => new RegExp(r).test(document.body.innerText), PENDIENTE.rotulo, { timeout: 25000 });
await page.waitForTimeout(1500);

// 🩸 La lista dibuja DOS layouts (celular y escritorio) y esconde uno con CSS:
// `getByText(...).first()` devuelve el INVISIBLE y el clic espera 30 s a un
// elemento que nunca se va a ver.
const fila = (rotulo) => page.locator(`span:text-is("${rotulo}"):visible`);
const boton = (rx) => page.locator("button:visible").filter({ hasText: rx });

if (MODO === "clic") {
  // Se abre la fila del acordeón para llegar a sus botones.
  await fila(PENDIENTE.rotulo).first().click();
  await page.waitForFunction(() => /imprimir/i.test(document.body.innerText), null, { timeout: 25000 });
  await page.waitForTimeout(1200);
}

let toquesHastaEditar = 0;
pedidos.length = 0;
let t0 = Date.now();

if (MODO === "clic" && ETAPA === "antes") {
  // main: la fila solo ofrece «Despachar» → la guía en LECTURA → «Editar».
  const despachar = boton(/^Despachar$/i).first();
  if (!(await despachar.count())) throw new Error("🔴 antes: la fila no ofrece «Despachar»");
  await despachar.click();
  toquesHastaEditar++;
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^editar$/i.test((b.textContent || "").trim())), null, { timeout: 25000 });
  await page.waitForTimeout(1200);
  pedidos.length = 0;
  t0 = Date.now();
  await boton(/^Editar$/i).first().click();
  toquesHastaEditar++;
} else if (MODO === "clic") {
  const editar = boton(/^Editar$/i).first();
  if (!(await editar.count())) throw new Error("🔴 despues: la fila no ofrece «Editar»");
  await editar.click();
  toquesHastaEditar++;
} else {
  // `commit` = apenas la navegación se acepta, SIN esperar el HTML: si se
  // esperara a "load", el parpadeo ya habría pasado y se mediría el final.
  await page.goto(`${BASE}/guias/${PENDIENTE.id}?editar=1`, { waitUntil: "commit" });
}

const secuencia = [];
const finos = [];
{
  // 🩸 UN SOLO BUCLE, y no "primero las capturas y después el muestreo": sacar
  // las 4 capturas primero se come el primer segundo entero (cada captura
  // cuesta ~100-200 ms), así que el muestreo fino arrancaba DESPUÉS del
  // parpadeo y lo declaraba inexistente sin haber mirado.
  const pendientes = [...INSTANTES];
  const limite = Date.now() + 6000;
  while (Date.now() < limite) {
    const v = await page.evaluate(QUE_SE_VE, PENDIENTE.id).catch(() => null);
    const ms = Date.now() - t0;
    if (v) finos.push({ ms, estado: v.estado });
    // Se dispara la captura del hito que ya venció (el reloj no espera).
    while (pendientes.length && ms >= pendientes[0]) {
      const hito = pendientes.shift();
      await page.screenshot({ path: `${SALIDA}/editar-${String(hito).padStart(4, "0")}ms.png` });
      secuencia.push({ ms: hito, real: ms, ...(v ?? { estado: "vacío", url: "" }) });
    }
    if (v && v.estado === "formulario" && v.tieneCampos && !pendientes.length) break;
    if (!FINO && !pendientes.length) break;
    await page.waitForTimeout(FINO ? 40 : 20);
  }
}

// Se deja terminar de abrir y de pedir todo.
// 🔴 CANDADO: llegar con `?editar=1` TIENE que abrir el formulario solo. Si no
// abre, el script muere con código ≠ 0 — es el defecto que no puede volver a
// colarse en silencio (medido el 25-ago-2026: por `router.push` desde la lista
// la pantalla se queda en LECTURA para siempre).
try {
  await page.waitForFunction(() => /editar gu[ií]a de transporte/i.test(document.body.innerText), null, { timeout: 25000 });
} catch {
  const donde = await page.evaluate(() => ({
    url: location.pathname + location.search,
    pantalla: [...document.querySelectorAll("button")].some((b) => /^editar$/i.test((b.textContent || "").trim())) ? "LECTURA" : "otra",
  })).catch(() => ({ url: "?", pantalla: "?" }));
  throw new Error(`🔴 ${ETAPA} (MODO=${MODO}): el formulario NUNCA abrió con ?editar=1 — quedó en ${donde.url} mostrando ${donde.pantalla}`);
}
await page.waitForTimeout(4000);

// ── 2 · las llamadas de red ──────────────────────────────────────────────────
const llamadas = [...pedidos];
const vecesLaGuia = llamadas.filter((u) => u.startsWith(`/api/guias/${PENDIENTE.id}`)).length;

// ── 3 · al cerrar, la URL deja de decir ?editar=1 ────────────────────────────
const cerrar = page.getByRole("button", { name: /cerrar la edición/i }).first();
if (!(await cerrar.count())) throw new Error(`🔴 ${ETAPA}: no se encontró «← Cerrar la edición»`);
await cerrar.click();
await page.waitForTimeout(2500);
const despuesDeCerrar = await page.evaluate(QUE_SE_VE, PENDIENTE.id);

// ── candados ─────────────────────────────────────────────────────────────────
const enLectura = [...secuencia, ...finos].filter((s) => s.estado === "LECTURA");
if (ETAPA !== "antes") {
  if (enLectura.length) {
    problemas.push(`🔴 PARPADEO: a los ${enLectura.map((s) => s.ms).join("/")} ms se ve la pantalla de LECTURA`);
  }
  if (/editar=1/.test(despuesDeCerrar.url)) {
    problemas.push(`🔴 al cerrar la edición la URL sigue diciendo ?editar=1 — ${despuesDeCerrar.url}`);
  }
}
if (!llamadas.length) problemas.push("🔴 no se contó ni una llamada de red: el medidor no midió nada");
if (!vecesLaGuia) problemas.push("🔴 no se vio ni un pedido de la guía: el medidor no midió nada");
const sobreLaGuia = escrituras.filter((e) => /\/api\/guias/.test(e));
if (sobreLaGuia.length) problemas.push(`🔴 se intentó escribir sobre una guía — ${JSON.stringify(sobreLaGuia)}`);

await nav.close();
writeFileSync(`${SALIDA}/informe-parpadeo.json`, JSON.stringify({ modo: MODO, toquesHastaEditar, secuencia, finos, llamadas, vecesLaGuia, despuesDeCerrar, escrituras }, null, 2));

console.log(`\n═══ EL PARPADEO AL ABRIR «EDITAR» (${ETAPA} · MODO=${MODO}) · BASE=${BASE} ═══`);
if (MODO === "clic") console.log(`   toques desde la fila hasta el formulario: ${toquesHastaEditar}`);
console.log("\n1 · CAPTURAS EN SECUENCIA (390 px)");
for (const s of secuencia) {
  console.log(`   ${String(s.ms).padStart(4)} ms (real ${String(s.real).padStart(4)})  ${s.estado.padEnd(11)} ${s.primerRenglon || ""}`);
}
if (FINO) {
  // Se imprime el CAMBIO de estado, no los 150 muestreos.
  const tramos = [];
  for (const f of finos) {
    if (!tramos.length || tramos[tramos.length - 1].estado !== f.estado) tramos.push({ desde: f.ms, estado: f.estado });
  }
  console.log("\n1b · MUESTREO FINO (cada 40 ms) — cuándo cambia lo que se ve");
  for (const t of tramos) console.log(`   desde ${String(t.desde).padStart(4)} ms  ${t.estado}`);
}
console.log(`\n2 · LLAMADAS DE RED para abrir «Editar»: ${llamadas.length}`);
console.log(`   la guía se pidió ${vecesLaGuia} ${vecesLaGuia === 1 ? "vez" : "veces"}`);
for (const u of llamadas) console.log(`   · ${u}`);
console.log(`\n3 · AL CERRAR LA EDICIÓN: ${despuesDeCerrar.url}  (${despuesDeCerrar.estado})`);
console.log(`\nescrituras bloqueadas: ${escrituras.length ? escrituras.join(" · ") : "ninguna"}`);
console.log(`capturas en ${SALIDA}`);

if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
