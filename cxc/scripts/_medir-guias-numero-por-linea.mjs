// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — los CUATRO anchos de los arreglos del 25-ago-2026.
//
// Mide tres estados:
//   1. una guía PENDIENTE con el N° puesto al crearla → las cajas por línea
//      tienen que estar VACÍAS y el número de la guía DICHO, no copiado;
//   2. la lista con guías seleccionadas → «Imprimir todas» baja UN archivo;
//   3. el formulario con «Otro…» elegido y sin nombre → el botón apagado y el
//      aviso a la vista, en vez de guardar `__other__` y que salga impreso.
//
// 🔴 NO TOCA NINGUNA GUÍA REAL: la pendiente es un DOBLE (se intercepta el GET)
// y **se aborta cualquier pedido que no sea GET**. Lo único que sale del
// navegador es la descarga del PDF, que se arma en la propia máquina.
//
//   BASE=http://localhost:3213 node scripts/_medir-guias-numero-por-linea.mjs
//
// Gotchas de la casa: sembrar `sessionStorage.cxc_role` y borrar
// `Navigator.prototype.serviceWorker` ANTES de navegar.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3213";
const SALIDA = process.env.SALIDA ?? "/tmp/guias-numero-por-linea";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const ID_PENDIENTE = "3f0b6a2e-1c4d-4b8a-9f21-7d5e6c8a1b93";
const CABECERA = "TR-4471";

const ITEMS = [
  { id: "cccccccc-cccc-4ccc-8ccc-000000000001", orden: 1, cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "10234", bultos: 6, numero_guia_transp: "" },
  { id: "cccccccc-cccc-4ccc-8ccc-000000000002", orden: 2, cliente: "GRUPO HANNA", cliente_codigo: "D-68", direccion: "Changuinola", empresa: "Active Wear", facturas: "10235", bultos: 2, numero_guia_transp: "" },
  { id: "cccccccc-cccc-4ccc-8ccc-000000000003", orden: 3, cliente: "WOLF MALL CENTER INT", cliente_codigo: "D-156", direccion: "Guabito", empresa: "Joystep", facturas: "10236", bultos: 7, numero_guia_transp: "" },
];

const PENDIENTE = {
  id: ID_PENDIENTE, numero: 209, fecha: "2026-08-25",
  transportista: "Transporte Sol",
  modo_entrega: "transportista", transportista_id: "9c1f0f2a-2222-4444-8888-aaaaaaaaaaaa",
  placa: "", observaciones: "", monto_total: 0,
  estado: "Pendiente Bodega", tipo_despacho: "externo",
  entregado_por: "Julio", numero_guia_transp: CABECERA,
  guia_items: ITEMS,
};

mkdirSync(SALIDA, { recursive: true });

const MEDIR = () => {
  const de = document.documentElement;
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
  return {
    altoPagina: Math.max(de.scrollHeight, document.body.scrollHeight),
    arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth),
    chicos,
    recortados,
    textoChico: [...document.querySelectorAll("*")]
      .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
      .map((e) => parseFloat(getComputedStyle(e).fontSize))
      .filter((n) => n && n < 12).length,
    // 1 · las cajas del N° por línea
    cajas: [...document.querySelectorAll('input[id^="transp-"]')].map((i) => i.value),
    diceCabecera: /Al crear la guía se anotó/i.test(txt),
    muestraCabecera: /TR-4471/.test(txt),
    // 3 · «Otro…» sin nombre
    avisoOtro: /Escribe el nombre de quien despacha/i.test(txt),
    faltaQuienDespacha: /Falta:[^\n]*quién despacha/i.test(txt),
    guardarApagado: [...document.querySelectorAll("button")]
      .filter((b) => /Guardar (Guía|Cambios)/i.test(b.textContent || ""))
      .every((b) => b.disabled),
  };
};

const informe = {};
const problemas = [];
const nav = await chromium.launch();

for (const ancho of ANCHOS) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, hasTouch: ancho < 1200, acceptDownloads: true });
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
    if (req.method() !== "GET") { escrituras.push(`${req.method()} ${req.url().replace(BASE, "")}`); return route.abort(); }
    if (req.url().includes(`/api/guias/${ID_PENDIENTE}`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PENDIENTE) });
    }
    return route.continue();
  });

  // ── 1. La guía pendiente: cajas vacías y la cabecera DICHA ─────────────────
  await page.goto(`${BASE}/guias/${ID_PENDIENTE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const guia = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/guia-numero-por-linea-${ancho}.png`, fullPage: true });

  // ── 2. «Otro…» sin nombre en el formulario del alta ────────────────────────
  await page.goto(`${BASE}/guias/nueva`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.selectOption("#guia-entregado-por", "__other__");
  await page.waitForTimeout(600);
  const otro = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/despachado-por-otro-${ancho}.png`, fullPage: true });

  informe[ancho] = { guia, otro, escrituras };

  for (const [etapa, m] of Object.entries({ guia, otro })) {
    if (m.arrastrePagina > 0) problemas.push(`🔴 ${ancho} ${etapa}: ${m.arrastrePagina} px de arrastre de página`);
    if (m.textoChico) problemas.push(`🔴 ${ancho} ${etapa}: ${m.textoChico} textos <12 px`);
  }
  // ⚠️ Los tocables de 34 px del FORMULARIO son la densidad de `pointer:fine`
  // que `GuiaForm` usa a propósito en escritorio, medida idéntica en main.
  if (guia.chicos.length) problemas.push(`🔴 ${ancho} guía: ${guia.chicos.length} tocables <44 px — ${JSON.stringify(guia.chicos)}`);

  // 🔴 Si no se encuentra lo que se mide, "0 problemas" sería verde por nada.
  if (guia.cajas.length !== ITEMS.length) problemas.push(`🔴 ${ancho}: ${guia.cajas.length} cajas del N° (se esperaban ${ITEMS.length})`);
  if (guia.cajas.some((v) => v !== "")) problemas.push(`🔴 ${ancho}: el N° se copió a las cajas — ${JSON.stringify(guia.cajas)}`);
  if (!guia.diceCabecera || !guia.muestraCabecera) problemas.push(`🔴 ${ancho}: no se dice el N° que se anotó al crear la guía`);
  if (!otro.avisoOtro) problemas.push(`🔴 ${ancho}: elegir «Otro…» sin nombre no avisa nada`);
  if (!otro.guardarApagado) problemas.push(`🔴 ${ancho}: se puede guardar con «Otro…» sin nombre`);
  if (!otro.faltaQuienDespacha) problemas.push(`🔴 ${ancho}: el botón no dice que falta quién despacha`);
  const sobreLaGuia = escrituras.filter((e) => /\/api\/guias\//.test(e));
  if (sobreLaGuia.length) problemas.push(`🔴 ${ancho}: se intentó escribir sobre la guía — ${JSON.stringify(sobreLaGuia)}`);

  await ctx.close();
}
await nav.close();

writeFileSync(`${SALIDA}/informe-numero-por-linea.json`, JSON.stringify(informe, null, 2));

console.log("\n═══ LOS 4 ANCHOS — el N° por línea y «Despachado por» ═══");
for (const a of ANCHOS) {
  const v = informe[a];
  console.log(`${String(a).padStart(4)} px`);
  console.log(`        guía        arrastre ${v.guia.arrastrePagina} · tocables<44 ${v.guia.chicos.length} · texto<12 ${v.guia.textoChico} · recortados ${v.guia.recortados} · alto ${v.guia.altoPagina}`);
  console.log(`                    cajas ${JSON.stringify(v.guia.cajas)} · dice la cabecera ${v.guia.diceCabecera ? "SÍ" : "NO"}`);
  console.log(`        «Otro…»     arrastre ${v.otro.arrastrePagina} · texto<12 ${v.otro.textoChico} · avisa ${v.otro.avisoOtro ? "SÍ" : "NO"} · Guardar apagado ${v.otro.guardarApagado ? "SÍ" : "NO"}`);
}
console.log(`\ncapturas en ${SALIDA}`);
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
