// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — los CUATRO anchos de «Editar» dentro de la guía.
//
// 🔴 NO TOCA NINGUNA GUÍA REAL. En producción no hay ninguna guía PENDIENTE
// (las 187 están Completadas), así que la pendiente es un DOBLE: se intercepta
// `GET /api/guias/<id>` y **se aborta cualquier pedido que no sea GET**. Nunca
// se aprieta «Despachar» ni «Guardar Cambios».
//
//   BASE=http://localhost:3213 ETAPA=despues node scripts/_medir-guias-editar-en-la-guia.mjs
//   BASE=http://localhost:3214 ETAPA=antes   node scripts/_medir-guias-editar-en-la-guia.mjs
//
// `ETAPA=antes` mide `origin/main`, donde el botón «Editar» todavía no existe:
// ahí solo se miden los dos estados de lectura, para tener contra qué comparar.
//
// Gotchas de la casa: sembrar `sessionStorage.cxc_role` y borrar
// `Navigator.prototype.serviceWorker` ANTES de navegar.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3213";
const ETAPA = process.env.ETAPA ?? "despues";
const SALIDA = process.env.SALIDA ?? `/tmp/guias-editar-${ETAPA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const FIRMA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const ID_PENDIENTE = "3f0b6a2e-1c4d-4b8a-9f21-7d5e6c8a1b91";
const ID_DESPACHADA = "3f0b6a2e-1c4d-4b8a-9f21-7d5e6c8a1b92";

/** Los envíos REALES de GT-189, la guía de varios destinos que cita CLAUDE.md. */
const ITEMS = [
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000001", orden: 1, cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "10234", bultos: 6, numero_guia_transp: "" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002", orden: 2, cliente: "GRUPO HANNA", cliente_codigo: "D-68", direccion: "Changuinola", empresa: "Active Wear", facturas: "10235", bultos: 2, numero_guia_transp: "" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000003", orden: 3, cliente: "Sistema Nacional De Proteccion Civil (Sinaproc)", cliente_codigo: "D-138", direccion: "David", empresa: "Joystep", facturas: "10236", bultos: 7, numero_guia_transp: "" },
];

const PENDIENTE = {
  id: ID_PENDIENTE, numero: 206, fecha: "2026-08-23",
  transportista: "Transporte Sol",
  modo_entrega: "transportista", transportista_id: "9c1f0f2a-2222-4444-8888-aaaaaaaaaaaa",
  placa: "", observaciones: "NOVA LUX 17 PANELES - PLAZA LOS ANGELES 3 MUEBLES DE CALVIN KLEIN",
  monto_total: 0, estado: "Pendiente Bodega", tipo_despacho: "externo",
  entregado_por: "Julio", numero_guia_transp: "",
  guia_items: ITEMS,
};

const DESPACHADA = {
  ...PENDIENTE,
  id: ID_DESPACHADA, numero: 205,
  estado: "Completada",
  placa: "EK0700", receptor_nombre: "Eric", cedula: "8-930-1234",
  firma_base64: FIRMA, firma_entregador_base64: FIRMA,
  numero_guia_transp: "TR-4471",
  guia_items: ITEMS.map((i) => ({ ...i, numero_guia_transp: "TR-4471" })),
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
  const botones = (n) => [...document.querySelectorAll("button")].filter((b) => (b.textContent || "").trim() === n).length;
  return {
    altoPagina: Math.max(de.scrollHeight, document.body.scrollHeight),
    arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth),
    chicos,
    recortados,
    textoChico: [...document.querySelectorAll("*")]
      .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
      .map((e) => parseFloat(getComputedStyle(e).fontSize))
      .filter((n) => n && n < 12).length,
    botonEditar: botones("Editar"),
    botonDespachar: [...document.querySelectorAll("button")].filter((b) => /Despachar/.test(b.textContent || "")).length,
    corregir: botones("Corregir"),
    // 🩸 El rótulo lleva `uppercase` POR CSS, así que `innerText` lo devuelve en
    // mayúsculas: comparar tal cual da SIEMPRE false y el chequeo pasaría en
    // verde sin haber mirado nada. Se compara sin distinguir mayúsculas.
    tituloFormulario: /editar gu[ií]a de transporte/i.test(txt),
    agregarEnvio: /\+ Agregar envío/i.test(txt),
    diceBloqueada: /ya se despach[óo]: no se puede editar/i.test(txt),
    camposEnvio: [...document.querySelectorAll('input[id^="direccion-"]')]
      .filter((e) => e.getBoundingClientRect().width > 0).length,
  };
};

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
    const url = req.url();
    // 🔴 Nada que no sea GET sale de acá. Aunque el diseño cambie mañana, este
    // script no puede escribirle a una guía real.
    if (req.method() !== "GET") { escrituras.push(`${req.method()} ${url.replace(BASE, "")}`); return route.abort(); }
    if (url.includes(`/api/guias/${ID_PENDIENTE}`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PENDIENTE) });
    }
    if (url.includes(`/api/guias/${ID_DESPACHADA}`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DESPACHADA) });
    }
    return route.continue();
  });

  // ── 1. La guía pendiente, en lectura ────────────────────────────────────────
  await page.goto(`${BASE}/guias/${ID_PENDIENTE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const pendiente = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/pendiente-lectura-${ancho}.png`, fullPage: true });

  // ── 2. La misma, con la edición abierta ─────────────────────────────────────
  let editando = null;
  if (ETAPA === "antes") {
    // En `origin/main` el formulario vive en su propia pantalla. Es el MISMO
    // componente, así que es el baseline honesto de "editando".
    await page.goto(`${BASE}/guias/${ID_PENDIENTE}/editar`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    editando = await page.evaluate(MEDIR);
    await page.screenshot({ path: `${SALIDA}/pendiente-editando-${ancho}.png`, fullPage: true });
  } else {
    await page.getByRole("button", { name: "Editar", exact: true }).first().click();
    await page.waitForTimeout(3000);
    editando = await page.evaluate(MEDIR);
    await page.screenshot({ path: `${SALIDA}/pendiente-editando-${ancho}.png`, fullPage: true });
  }

  // ── 3. La guía YA DESPACHADA ────────────────────────────────────────────────
  await page.goto(`${BASE}/guias/${ID_DESPACHADA}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const despachada = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/despachada-${ancho}.png`, fullPage: true });

  informe[ancho] = { pendiente, editando, despachada, escrituras };

  const estados = { pendiente, despachada, ...(editando ? { editando } : {}) };
  for (const [etapa, m] of Object.entries(estados)) {
    if (m.arrastrePagina > 0) problemas.push(`🔴 ${ancho} ${etapa}: ${m.arrastrePagina} px de arrastre de página`);
    if (m.textoChico) problemas.push(`🔴 ${ancho} ${etapa}: ${m.textoChico} textos <12 px`);
    // ⚠️ Los tocables del FORMULARIO (34 px) son la densidad de `pointer:fine`
    // que GuiaForm usa a propósito en escritorio y que ya medía `origin/main`
    // en `/guias/[id]/editar`. Fuera del formulario no puede haber ninguno.
    const propios = etapa === "editando" ? [] : m.chicos;
    if (propios.length) problemas.push(`🔴 ${ancho} ${etapa}: ${propios.length} tocables <44 px — ${JSON.stringify(propios)}`);
  }

  // 🔴 Si no se encuentra lo que se mide, "0 problemas" sería verde por nada.
  if (pendiente.camposEnvio !== 0) problemas.push(`🔴 ${ancho}: la guía pendiente en lectura ya trae campos de envío editables`);
  if (!pendiente.botonDespachar) problemas.push(`🔴 ${ancho}: no aparece «Despachar» en la guía pendiente`);
  if (!despachada.diceBloqueada) problemas.push(`🔴 ${ancho}: la guía despachada NO dice que está bloqueada`);
  if (despachada.botonEditar) problemas.push(`🔴 ${ancho}: hay botón «Editar» en una guía DESPACHADA`);
  if (despachada.camposEnvio) problemas.push(`🔴 ${ancho}: hay campos de envío editables en una guía DESPACHADA`);
  if (despachada.corregir) problemas.push(`🔴 ${ancho}: hay «Corregir» en una guía DESPACHADA`);

  if (ETAPA !== "antes") {
    if (!pendiente.botonEditar) problemas.push(`🔴 ${ancho}: falta el botón «Editar» en la guía pendiente`);
    if (!editando.tituloFormulario) problemas.push(`🔴 ${ancho}: al tocar «Editar» no aparece el formulario del alta`);
    if (!editando.agregarEnvio) problemas.push(`🔴 ${ancho}: el formulario no deja agregar un envío`);
    if (editando.camposEnvio !== ITEMS.length) problemas.push(`🔴 ${ancho}: ${editando.camposEnvio} campos de dirección (se esperaban ${ITEMS.length})`);
    if (!editando.botonDespachar) problemas.push(`🔴 ${ancho}: «Despachar» no está en la MISMA pantalla mientras se edita`);
    if (editando.corregir) problemas.push(`🔴 ${ancho}: los envíos se dibujan DOS veces (queda un «Corregir»)`);
  }
  // ⚠️ Las escrituras que la app dispara sola (el ping de sesión) salen
  // IDÉNTICAS en `origin/main`: se listan, no tumban la medición. Lo que no
  // puede aparecer es una escritura sobre la GUÍA.
  const sobreLaGuia = escrituras.filter((e) => /\/api\/guias\//.test(e));
  if (sobreLaGuia.length) problemas.push(`🔴 ${ancho}: se intentó escribir sobre la guía — ${JSON.stringify(sobreLaGuia)}`);

  await ctx.close();
}
await nav.close();

writeFileSync(`${SALIDA}/informe-editar.json`, JSON.stringify(informe, null, 2));

console.log(`\n═══ LOS 4 ANCHOS — «Editar» dentro de la guía (${ETAPA}) ═══`);
for (const a of ANCHOS) {
  const v = informe[a];
  const l = (m) => m ? `arrastre ${m.arrastrePagina} · tocables<44 ${m.chicos.length} · texto<12 ${m.textoChico} · recortados ${m.recortados} · alto ${m.altoPagina}` : "—";
  console.log(`${String(a).padStart(4)} px`);
  console.log(`        pendiente   ${l(v.pendiente)}`);
  console.log(`        editando    ${l(v.editando)}`);
  console.log(`        despachada  ${l(v.despachada)}`);
  console.log(`        escrituras bloqueadas: ${v.escrituras.length ? v.escrituras.join(" · ") : "ninguna"}`);
}
console.log(`\ncapturas en ${SALIDA}`);
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
