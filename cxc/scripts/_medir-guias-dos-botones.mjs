// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — los CUATRO anchos de «dos botones en la fila» (25-ago-2026).
//
// Mide cuatro pantallas, en 390 · 834 · 1024 · 1440:
//   1. `/guias` con una guía PENDIENTE REAL abierta → los botones de la fila;
//   2. `/guias` con una guía DESPACHADA REAL abierta → sigue sin botón de
//      entrar, y el N° del transportista sale de los RENGLONES;
//   3. la guía en LECTURA (doble) → «Cómo sale» con su «Cambiar»;
//   4. la misma con `?editar=1` (doble) → el formulario abierto y el modo
//      preguntado UNA sola vez.
//
// 🔴 NO SE TOCA NINGUNA GUÍA REAL. Se aborta en el navegador **cualquier pedido
// que no sea GET** y la guía que se abre en (3) y (4) es un DOBLE servido por
// el propio script. Nunca se aprieta «Despachar» ni «Guardar».
//
//   BASE=http://localhost:3213 ETAPA=antes|despues node scripts/_medir-guias-dos-botones.mjs
//
// ⚠️ En `ETAPA=antes` (o sea `origin/main`) la fila tiene UN botón y no existe
// el `?editar=1` de la lista: el script lo dice en vez de fallar, porque ésa es
// justamente la diferencia que se está midiendo.
//
// Gotchas de la casa: sembrar `sessionStorage.cxc_role` y borrar
// `Navigator.prototype.serviceWorker` ANTES de navegar; a 1440 el formulario
// dibuja los DOS layouts (tarjeta y tabla) y esconde uno con CSS.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3213";
const ETAPA = process.env.ETAPA ?? "despues";
const SALIDA = process.env.SALIDA ?? `/tmp/guias-dos-botones-${ETAPA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const ID_DOBLE = "5a1c9d3e-7b24-4f10-9e88-2c6b4a0d1f77";
const ITEMS = [
  { id: "dddddddd-dddd-4ddd-8ddd-000000000001", orden: 1, cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "10234", bultos: 6, numero_guia_transp: "" },
  { id: "dddddddd-dddd-4ddd-8ddd-000000000002", orden: 2, cliente: "GRUPO HANNA", cliente_codigo: "D-68", direccion: "Changuinola", empresa: "Active Wear", facturas: "10235", bultos: 2, numero_guia_transp: "" },
];
const DOBLE = {
  id: ID_DOBLE, numero: 899, fecha: "2026-08-25",
  transportista: "Transporte Sol", modo_entrega: "transportista",
  transportista_id: "9c1f0f2a-2222-4444-8888-aaaaaaaaaaaa",
  placa: "", observaciones: "Keriddine son muebles", monto_total: 0,
  estado: "Pendiente Bodega", tipo_despacho: "externo",
  entregado_por: "Julio", numero_guia_transp: "TR-4471",
  guia_items: ITEMS,
};

mkdirSync(SALIDA, { recursive: true });

const MEDIR = () => {
  const de = document.documentElement;
  // 🩸 GOTCHA: el acordeón de la lista NO desmonta las filas cerradas — las
  // aplasta con `grid-rows-[0fr]` + `overflow-hidden`. Sus botones siguen
  // teniendo caja propia, así que contar el DOM entero devuelve los botones de
  // las CINCO pendientes y no los de la fila abierta.
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    for (let p = e.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (p.clientHeight === 0 && (s.overflowY === "hidden" || s.overflow === "hidden")) return false;
    }
    return true;
  };
  const chicos = [...document.querySelectorAll("button, a, input, select, textarea")]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
    })
    .map((e) => {
      const r = e.getBoundingClientRect();
      return { t: (e.textContent || e.getAttribute("aria-label") || e.id || e.tagName).trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) };
    });
  const recortados = [...document.querySelectorAll("body div *")].filter((e) => {
    const s = getComputedStyle(e);
    if (s.overflowX === "auto" || s.overflowX === "scroll") return false;
    return e.clientWidth > 1 && e.scrollWidth - e.clientWidth > 2;
  }).length;
  const txt = document.body.innerText;
  const botones = [...document.querySelectorAll("button")].filter(visible)
    .map((b) => (b.textContent || "").trim()).filter(Boolean);
  return {
    altoPagina: Math.max(de.scrollHeight, document.body.scrollHeight),
    arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth),
    chicos,
    recortados,
    textoChico: [...document.querySelectorAll("*")]
      .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
      .map((e) => parseFloat(getComputedStyle(e).fontSize))
      .filter((n) => n && n < 12).length,
    editar: botones.filter((b) => /^Editar$/i.test(b)).length,
    despachar: botones.filter((b) => /^Despachar$/i.test(b)).length,
    imprimir: botones.filter((b) => /^Imprimir$/i.test(b)).length,
    comoSale: /Cómo sale/i.test(txt),
    cambiarModo: botones.filter((b) => /^Cambiar$/i.test(b)).length,
    modoEntrega: /Modo de entrega/i.test(txt),
    propioCamion: (txt.split("Sale en nuestro propio camión").length - 1),
    formularioAbierto: /\+ Agregar envío/i.test(txt),
    cajasN: document.querySelectorAll('input[id^="transp-"]').length,
    numeroTransp: (() => {
      const el = [...document.querySelectorAll("span")]
        .filter(visible)
        .find((s) => /^N° guía transp\.$/.test((s.textContent || "").trim()));
      return el?.nextElementSibling?.textContent?.trim() ?? null;
    })(),
  };
};

/** Abre la primera fila de la lista cuyo estado coincida. Devuelve su texto. */
async function abrirFila(page, estado) {
  const abierto = await page.evaluate((estado) => {
    const filas = [...document.querySelectorAll("button")].filter((b) =>
      /GT-\d+/.test(b.textContent || "") && new RegExp(estado, "i").test(b.textContent || ""));
    if (!filas.length) return null;
    filas[0].click();
    return (filas[0].textContent || "").match(/GT-\d+/)?.[0] ?? "?";
  }, estado);
  await page.waitForTimeout(3500);
  return abierto;
}

const informe = {};
const problemas = [];
const nav = await chromium.launch();

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200 });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();

  const escrituras = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    // 🔴 NADA que no sea GET sale de acá.
    // ⚠️ Los POST de Sentry no son la app: se abortan igual, pero no se
    //    cuentan como "se intentó escribir" (main los hace idénticos).
    if (req.method() !== "GET") {
      if (req.url().startsWith(BASE)) escrituras.push(`${req.method()} ${req.url().replace(BASE, "")}`);
      return route.abort();
    }
    if (req.url().includes(`/api/guias/${ID_DOBLE}`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DOBLE) });
    }
    return route.continue();
  });

  // ── 1 y 2 · la LISTA con datos REALES de producción ───────────────────────
  await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const gtPendiente = await abrirFila(page, "Pendiente");
  const listaPendiente = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/lista-pendiente-${ancho}.png`, fullPage: true });

  await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const gtDespachada = await abrirFila(page, "Despachada");
  const listaDespachada = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/lista-despachada-${ancho}.png`, fullPage: true });

  // ── 3 · la guía en LECTURA (doble) ────────────────────────────────────────
  await page.goto(`${BASE}/guias/${ID_DOBLE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const lectura = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/guia-lectura-${ancho}.png`, fullPage: true });

  // ── 4 · la misma, con la edición abierta ──────────────────────────────────
  //  `?editar=1` es donde aterriza el botón «Editar» de la fila. En `antes` ese
  //  query ya existía (por el redirect de `/guias/[id]/editar`), así que la
  //  comparación con main es la misma pantalla.
  await page.goto(`${BASE}/guias/${ID_DOBLE}?editar=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const editando = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/guia-editando-${ancho}.png`, fullPage: true });

  const casos = { listaPendiente, listaDespachada, lectura, editando };
  informe[ancho] = { ...casos, gtPendiente, gtDespachada, escrituras };

  for (const [etapa, m] of Object.entries(casos)) {
    if (m.arrastrePagina > 0) problemas.push(`🔴 ${ancho} ${etapa}: ${m.arrastrePagina} px de arrastre de página`);
    if (m.textoChico) problemas.push(`🔴 ${ancho} ${etapa}: ${m.textoChico} textos <12 px`);
  }
  // Los tocables <44 de las LISTAS. ⚠️ El `<input>` del buscador mide 39 px de
  // alto en escritorio/iPad y es PRE-EXISTENTE — está documentado desde el
  // 10-ago-2026 y `origin/main` lo mide idéntico. Lo que este cambio toca son
  // BOTONES: si alguno baja de 44, es de acá.
  for (const etapa of ["listaPendiente", "listaDespachada"]) {
    const botones = casos[etapa].chicos.filter((c) => c.t !== "INPUT");
    if (botones.length) problemas.push(`🔴 ${ancho} ${etapa}: ${botones.length} tocables <44 px — ${JSON.stringify(botones)}`);
  }

  // 🔴 Si no se encuentra lo que se mide, "0 problemas" sería verde por nada.
  if (!gtPendiente) problemas.push(`🔴 ${ancho}: no se encontró ninguna guía PENDIENTE en la lista`);
  if (!gtDespachada) problemas.push(`🔴 ${ancho}: no se encontró ninguna guía DESPACHADA en la lista`);
  if (!listaPendiente.imprimir) problemas.push(`🔴 ${ancho}: «Imprimir» se perdió de la fila pendiente`);
  if (listaDespachada.editar || listaDespachada.despachar) {
    problemas.push(`🔴 ${ancho}: una guía DESPACHADA ofrece botones de entrar (editar ${listaDespachada.editar} · despachar ${listaDespachada.despachar})`);
  }
  if (!lectura.comoSale || lectura.cambiarModo !== 1) problemas.push(`🔴 ${ancho}: la guía en lectura perdió «Cómo sale» + «Cambiar»`);

  if (ETAPA === "despues") {
    if (listaPendiente.editar !== 1 || listaPendiente.despachar !== 1) {
      problemas.push(`🔴 ${ancho}: la fila pendiente no tiene los DOS botones (editar ${listaPendiente.editar} · despachar ${listaPendiente.despachar})`);
    }
    if (!editando.formularioAbierto) problemas.push(`🔴 ${ancho}: «?editar=1» no abre el formulario`);
    if (!editando.modoEntrega) problemas.push(`🔴 ${ancho}: editando no se ve «Modo de entrega»`);
    if (editando.comoSale || editando.cambiarModo) problemas.push(`🔴 ${ancho}: editando vuelve a salir el segundo control del modo`);
    if (!editando.despachar) problemas.push(`🔴 ${ancho}: «Despachar» se fue de la pantalla mientras se edita`);
  }
  if (escrituras.length) problemas.push(`🔴 ${ancho}: se intentó escribir — ${JSON.stringify(escrituras)}`);

  await ctx.close();
}
await nav.close();

writeFileSync(`${SALIDA}/informe-dos-botones.json`, JSON.stringify(informe, null, 2));

console.log(`\n═══ LOS 4 ANCHOS — dos botones en la fila (ETAPA=${ETAPA}) ═══`);
for (const a of ANCHOS) {
  const v = informe[a];
  console.log(`${String(a).padStart(4)} px   (pendiente ${v.gtPendiente} · despachada ${v.gtDespachada})`);
  for (const k of ["listaPendiente", "listaDespachada", "lectura", "editando"]) {
    const m = v[k];
    console.log(`   ${k.padEnd(16)} arrastre ${m.arrastrePagina} · tocables<44 ${m.chicos.length} · texto<12 ${m.textoChico} · recortados ${m.recortados} · alto ${m.altoPagina}`);
  }
  console.log(`   fila pendiente   Editar ${v.listaPendiente.editar} · Despachar ${v.listaPendiente.despachar} · Imprimir ${v.listaPendiente.imprimir}`);
  console.log(`   fila despachada  Editar ${v.listaDespachada.editar} · Despachar ${v.listaDespachada.despachar} · N° transp "${v.listaDespachada.numeroTransp}"`);
  console.log(`   lectura          «Cómo sale» ${v.lectura.comoSale ? "SÍ" : "NO"} · «Cambiar» ${v.lectura.cambiarModo} · cajas N° ${v.lectura.cajasN}`);
  console.log(`   editando         formulario ${v.editando.formularioAbierto ? "SÍ" : "NO"} · «Modo de entrega» ${v.editando.modoEntrega ? "SÍ" : "NO"} · «Cómo sale» ${v.editando.comoSale ? "SÍ" : "NO"} · «Cambiar» ${v.editando.cambiarModo} · Despachar ${v.editando.despachar}`);
}
console.log(`\ncapturas en ${SALIDA}`);
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
