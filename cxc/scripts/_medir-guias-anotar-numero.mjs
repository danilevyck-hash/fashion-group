// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — los TRES anchos de "anotar el N° del transportista" sobre una
// guía YA DESPACHADA.
//
// 🔴 NO TOCA NINGUNA GUÍA REAL. La guía despachada sin número es un DOBLE: se
// intercepta `GET /api/guias/<id>` y se contesta con ella, y **se aborta
// cualquier pedido que no sea GET** — salvo el PATCH del N°, que se contesta
// desde acá (nunca sale al servidor) para poder ver que el aviso ámbar se apaga.
//
//   BASE=http://localhost:3213 SALIDA=/tmp/x node scripts/_medir-guias-anotar-numero.mjs
//
// Gotchas de la casa: sembrar `sessionStorage.cxc_role` y borrar
// `Navigator.prototype.serviceWorker` ANTES de navegar.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3213";
const SALIDA = process.env.SALIDA ?? "/tmp/guias-anotar-numero";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1440];

const GUIA_ID = "3f0b6a2e-1c4d-4b8a-9f21-7d5e6c8a1b90";
const ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-000000000000";

const GUIA = {
  id: GUIA_ID, numero: 204, fecha: "2026-08-16",
  transportista: "Transporte Sol",
  modo_entrega: "transportista", transportista_id: "9c1f0f2a-2222-4444-8888-aaaaaaaaaaaa",
  placa: "EK0700", observaciones: "", monto_total: 0,
  estado: "Completada", tipo_despacho: "externo",
  receptor_nombre: "Nicolás guillen", cedula: "1-727-44",
  firma_base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  firma_entregador_base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  numero_guia_transp: "",
  guia_items: [
    { id: ITEM_ID, orden: 1, cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "F-10041", bultos: 6, numero_guia_transp: "" },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", orden: 2, cliente: "GRUPO HANNA", cliente_codigo: "D-68", direccion: "Changuinola", empresa: "Active Wear", facturas: "F-10042", bultos: 2, numero_guia_transp: "" },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000002", orden: 3, cliente: "WOLF MALL CENTER INT", cliente_codigo: "D-156", direccion: "Guabito", empresa: "Joystep", facturas: "F-10043", bultos: 7, numero_guia_transp: "" },
  ],
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
      return { t: (e.textContent || e.getAttribute("aria-label") || e.id || e.tagName).trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) };
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
    avisoAmbar: /salió sin el N° del transportista/i.test(txt),
    botonesAnotar: [...document.querySelectorAll("button")].filter((b) => (b.textContent || "").trim() === "Anotar el N°").length,
    // Lo que NO puede estar en una guía despachada.
    corregir: [...document.querySelectorAll("button")].filter((b) => (b.textContent || "").trim() === "Corregir").length,
    cajasDespacho: ["despacho-placa", "despacho-receptor", "despacho-cedula", "transp-0"].filter((i) => document.getElementById(i)).length,
    camposEnRenglon: (() => {
      const c = document.getElementById("tarde-aaaaaaaa-aaaa-4aaa-8aaa-000000000000");
      if (!c) return null;
      return c.closest("div.rounded-lg").querySelectorAll("input, select, textarea").length;
    })(),
    muestraNumero: /TR-4471/.test(txt),
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

  let guardado = "";
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes("/numero-transp") && req.method() === "PATCH") {
      // Se contesta ACÁ: no sale al servidor y no toca ninguna guía.
      const body = JSON.parse(req.postData() || "{}");
      guardado = String(body.numero_guia_transp || "");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, numero_guia_transp: guardado }) });
    }
    if (req.method() !== "GET") return route.abort();
    if (url.includes(`/api/guias/${GUIA_ID}`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GUIA) });
    }
    return route.continue();
  });

  await page.goto(`${BASE}/guias/${GUIA_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  const cerrado = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/guia-despachada-aviso-${ancho}.png`, fullPage: true });

  // Se abre el renglón y se anota el número.
  await page.getByRole("button", { name: "Anotar el N°" }).first().click();
  await page.waitForTimeout(800);
  const abierto = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/guia-anotar-numero-${ancho}.png`, fullPage: true });

  await page.fill(`#tarde-${ITEM_ID}`, "TR-4471");
  await page.getByRole("button", { name: "Guardar el N°" }).click();
  await page.waitForTimeout(1500);
  const guardadoM = await page.evaluate(MEDIR);
  await page.screenshot({ path: `${SALIDA}/guia-numero-guardado-${ancho}.png`, fullPage: true });

  informe[ancho] = { cerrado, abierto, guardado: guardadoM, mandado: guardado };

  for (const [etapa, m] of Object.entries({ cerrado, abierto, guardado: guardadoM })) {
    if (m.arrastrePagina > 0) problemas.push(`🔴 ${ancho} ${etapa}: ${m.arrastrePagina} px de arrastre`);
    if (m.chicos.length) problemas.push(`🔴 ${ancho} ${etapa}: ${m.chicos.length} tocables <44 px — ${JSON.stringify(m.chicos)}`);
    if (m.textoChico) problemas.push(`🔴 ${ancho} ${etapa}: ${m.textoChico} textos <12 px`);
    if (m.corregir) problemas.push(`🔴 ${ancho} ${etapa}: hay ${m.corregir} botones "Corregir" en una guía despachada`);
    if (m.cajasDespacho) problemas.push(`🔴 ${ancho} ${etapa}: ${m.cajasDespacho} campos del despacho en una guía despachada`);
  }
  if (!cerrado.avisoAmbar) problemas.push(`🔴 ${ancho}: falta el aviso ámbar`);
  if (cerrado.botonesAnotar !== 3) problemas.push(`🔴 ${ancho}: ${cerrado.botonesAnotar} botones "Anotar el N°" (se esperaban 3)`);
  if (abierto.camposEnRenglon !== 1) problemas.push(`🔴 ${ancho}: el renglón abierto tiene ${abierto.camposEnRenglon} campos (tiene que ser 1)`);
  if (guardado !== "TR-4471") problemas.push(`🔴 ${ancho}: se mandó "${guardado}" en vez de TR-4471`);
  if (guardadoM.avisoAmbar) problemas.push(`🔴 ${ancho}: el aviso ámbar sigue puesto tras anotar el número`);
  if (!guardadoM.muestraNumero) problemas.push(`🔴 ${ancho}: el renglón no muestra el número anotado`);

  await ctx.close();
}
await nav.close();

writeFileSync(`${SALIDA}/informe-anotar-numero.json`, JSON.stringify(informe, null, 2));

console.log("\n═══ LOS 3 ANCHOS — anotar el N° en una guía despachada ═══");
for (const a of ANCHOS) {
  const v = informe[a];
  console.log(
    `${String(a).padStart(4)} px → arrastre ${v.cerrado.arrastrePagina} · tocables<44 ${v.cerrado.chicos.length}/${v.abierto.chicos.length}/${v.guardado.chicos.length} · texto<12 ${v.cerrado.textoChico} · recortados ${v.cerrado.recortados}`,
  );
  console.log(
    `        aviso ámbar ${v.cerrado.avisoAmbar ? "SÍ" : "no"} → tras anotar ${v.guardado.avisoAmbar ? "SIGUE 🔴" : "apagado ✅"} · "Anotar el N°" ×${v.cerrado.botonesAnotar} · campos en el renglón ${v.abierto.camposEnRenglon} · Corregir ${v.cerrado.corregir} · campos de despacho ${v.cerrado.cajasDespacho}`,
  );
}
console.log(`\ncapturas en ${SALIDA}`);
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
