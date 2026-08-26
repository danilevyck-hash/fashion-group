// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — LOS 3 ANCHOS (+ el iPad acostado) de la tanda «menos ruido en
// Guías» (26-ago-2026).
//
// Mide, en 390 · 834 · 1024 · 1440, contra el build de PRODUCCIÓN y con DATOS
// DE PRODUCCIÓN, las tres pantallas de las capturas de Daniel:
//
//   1. `/guias` con **GT-229 DESPLEGADA** — la columna CLIENTE, donde el nombre
//      salía DOS VECES (texto suelto + chip verde con el código).
//   2. `/guias/<GT-229>?editar=1` — la DESPACHADA: el «Si lo dio» del
//      encabezado y del placeholder, y el sello «A mano».
//   3. `/guias/<GT-230>?editar=1` — la PENDIENTE: el «＋ Agregar destino»,
//      que pasó a vivir PEGADO al campo de Dirección.
//   4. `/guias/nueva` — la regresión: al crear no se rompió nada.
//
// 🔴 QUITAR RUIDO TIENE QUE ACHICAR: se reporta el ALTO de cada pantalla, para
// comparar contra `origin/main` (ETAPA=antes) corriendo EL MISMO ARCHIVO. Dos
// scripts distintos no comparan nada.
//
// 🔴 NO TOCA NINGUNA GUÍA REAL. En el navegador se **aborta cualquier pedido
// que no sea GET**, así que ni un clic accidental puede escribir.
//
//   BASE=http://localhost:3213 ETAPA=despues node scripts/_medir-guias-menos-ruido.mjs
//   BASE=http://localhost:3214 ETAPA=antes   node scripts/_medir-guias-menos-ruido.mjs
//
// 🩸 GOTCHAS DE LA CASA, todos ya cobrados en este repo:
//   · el formulario dibuja **los DOS layouts** (tarjeta `-m` y tabla `-d`) y
//     esconde uno con CSS → contar el DOM entero da el DOBLE de campos;
//   · los rótulos llevan `uppercase` POR CSS → `innerText` los devuelve en
//     MAYÚSCULAS (se compara con /i, siempre);
//   · `innerText` NO devuelve el texto de un `sr-only` → para eso `textContent`;
//   · el acordeón NO desmonta las filas cerradas: las aplasta con
//     `grid-rows-[0fr]` + `overflow-hidden`, así que contar el DOM entero
//     devuelve los botones de TODAS las filas. Se descarta lo que esté dentro
//     de un contenedor de alto 0;
//   · hay que sembrar `sessionStorage.cxc_role` y `delete
//     Navigator.prototype.serviceWorker` ANTES de navegar.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3213";
const ETAPA = process.env.ETAPA ?? "despues";
const SALIDA = process.env.SALIDA ?? `/tmp/guias-menos-ruido-${ETAPA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

/** Guías REALES de producción. Se LEEN, nunca se escriben. */
const DESPACHADA = { id: "703e3063-18a9-482e-89b1-63a7e1b6e621", rotulo: "GT-229" };
const PENDIENTE = { id: "fa6dafb3-604e-400e-8677-f7867a2cc206", rotulo: "GT-230" };

mkdirSync(SALIDA, { recursive: true });

const MEDIR = () => {
  const de = document.documentElement;

  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s0 = getComputedStyle(e);
    if (s0.visibility === "hidden" || s0.display === "none") return false;
    for (let p = e.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.visibility === "hidden" || s.display === "none") return false;
      if (p.clientHeight === 0 && (s.overflowY === "hidden" || s.overflow === "hidden")) return false;
      if (p.clientWidth === 0 && (s.overflowX === "hidden" || s.overflow === "hidden")) return false;
    }
    return true;
  };

  const caja = (e) => {
    const r = e.getBoundingClientRect();
    return {
      t: (e.getAttribute("aria-label") || e.textContent || e.id || e.tagName).trim().slice(0, 30),
      id: (e.id || "").slice(0, 30),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };

  const chicos = [...document.querySelectorAll("button, a, input, select, textarea, [role=button], [role=option]")]
    .filter(visible)
    .filter((e) => {
      const r = e.getBoundingClientRect();
      const lab = e.closest("label");
      if (lab) {
        const rl = lab.getBoundingClientRect();
        if (rl.height >= 44 && rl.width >= 44) return false;
      }
      return r.height < 44 || r.width < 44;
    })
    .map(caja);

  const recortados = [...document.querySelectorAll("body div *")]
    .filter((e) => {
      const s = getComputedStyle(e);
      if (s.overflowX === "auto" || s.overflowX === "scroll") return false;
      return e.clientWidth > 1 && e.scrollWidth - e.clientWidth > 2 && visible(e);
    })
    .map(caja);

  const textoChico = [...document.querySelectorAll("*")]
    .filter((e) => e.children.length === 0 && (e.textContent || "").trim() && visible(e))
    .map((e) => ({ px: parseFloat(getComputedStyle(e).fontSize), t: (e.textContent || "").trim().slice(0, 24) }))
    .filter((x) => x.px && x.px < 12);

  const txt = document.body.innerText;
  const txtCrudo = document.body.textContent || "";
  const vis = (sel) => [...document.querySelectorAll(sel)].filter(visible);

  // ── LA COLUMNA CLIENTE del acordeón: ¿cuántas veces se dice el nombre? ──────
  // Se lee la CELDA, no la pantalla: el nombre puede estar además en el resumen
  // de la fila colapsada y eso es otra cosa.
  const celdasCliente = [...document.querySelectorAll("table tbody tr")]
    .filter(visible)
    .map((tr) => tr.children[1])
    .filter((td) => td && visible(td))
    .map((td) => {
      const chip = td.querySelector("span.bg-emerald-50, span[class*='emerald']");
      const nombreChip = chip ? (chip.textContent || "").trim() : "";
      return {
        texto: (td.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90),
        // Un nombre "repetido" es el mismo texto arriba y adentro del chip.
        chip: nombreChip.slice(0, 60),
      };
    });

  return {
    arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth),
    altoPagina: Math.max(de.scrollHeight, document.body.scrollHeight),
    chicos,
    recortados,
    textoChico,
    celdasCliente,
    // ── lo que este PR retira ────────────────────────────────────────────────
    diceSiLoDio: (txtCrudo.match(/Si lo dio/g) || []).length,
    placeholdersSiLoDio: [...document.querySelectorAll("input")].filter((i) => /si lo dio/i.test(i.placeholder || "")).length,
    selloAMano: vis("span").filter((s) => (s.textContent || "").trim() === "A mano").length,
    // ── lo que se QUEDA ──────────────────────────────────────────────────────
    chipsCodigo: vis("span").filter((s) => /^D-\d+$/.test((s.textContent || "").trim())).length,
    ejemploFacturas: /Ej: 10234, 10235/.test(txtCrudo),
    diceEscritoAMano: /Cliente escrito a mano/.test(txtCrudo),
    // ── «Agregar destino»: cuántos y DÓNDE ───────────────────────────────────
    botonesAgregarDestino: vis("button").filter((b) => /agregar destino a la lista/i.test(b.getAttribute("aria-label") || "")).length,
    agregarDestinoPegadoAlCampo: vis("button")
      .filter((b) => /agregar destino a la lista/i.test(b.getAttribute("aria-label") || ""))
      .every((b) => !!b.parentElement?.querySelector("input[id^='direccion-']")),
    agregarDestinoConRotulo: vis("button")
      .filter((b) => /agregar destino a la lista/i.test(b.getAttribute("aria-label") || ""))
      .filter((b) => (b.textContent || "").replace(/\s/g, "") !== "＋").length,
    tituloDetalleTieneBoton: (() => {
      const enc = [...document.querySelectorAll("div")].find((d) => (d.textContent || "").trim() === "Detalle de Envío");
      return enc ? !!enc.querySelector("button") : null;
    })(),
    // 🔴 ¿SACAR EL «(opcional)» DEJÓ UN HUECO? Se mide el bloque de
    // Observaciones: el alto del rótulo, el hueco hasta el campo y el alto del
    // conjunto. Si el texto se fue y algo de esto CRECE, el hueco existe.
    observaciones: (() => {
      const ta = document.getElementById("guia-observaciones");
      if (!ta) return null;
      const cont = ta.parentElement;
      const lab = cont?.querySelector("div");
      if (!lab) return null;
      const rl = lab.getBoundingClientRect();
      const rt = ta.getBoundingClientRect();
      return {
        rotulo: (lab.textContent || "").replace(/\s+/g, " ").trim(),
        altoRotulo: Math.round(rl.height),
        huecoRotuloCampo: Math.round(rt.top - rl.bottom),
        altoBloque: Math.round(rt.bottom - rl.top),
      };
    })(),
    diceOpcional: (txtCrudo.match(/\(opcional\)/gi) || []).length,
    // ── estado de la pantalla (para que el medidor no dé verde sin mirar) ────
    camposCliente: vis('input[id^="cliente-"]').length,
    camposDireccion: vis('input[id^="direccion-"]').length,
    cajasNumTransp: vis('input[id^="numtransp-"]').length,
    filasAcordeon: [...document.querySelectorAll("table tbody tr")].filter(visible).length,
    diceEditar: /editar gu[ií]a de transporte/i.test(txt),
    diceNueva: /nueva gu[ií]a de transporte/i.test(txt),
    urlActual: location.pathname + location.search,
  };
};

const informe = {};
const problemas = [];
const notas = [];
const nav = await chromium.launch();

async function exigirTexto(page, rx, queEs, ancho, pantalla) {
  try {
    await page.waitForFunction((s) => new RegExp(s, "i").test(document.body.innerText), rx.source, { timeout: 30000 });
  } catch {
    throw new Error(`🔴 ${ancho} · ${pantalla}: nunca apareció ${queEs} (${rx})`);
  }
}

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
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") {
      escrituras.push(`${req.method()} ${req.url().replace(BASE, "")}`);
      return route.abort();
    }
    return route.continue();
  });

  const medidas = {};
  const medir = async (nombre) => {
    const m = await page.evaluate(MEDIR);
    await page.screenshot({ path: `${SALIDA}/${nombre}-${ancho}.png`, fullPage: true });
    medidas[nombre] = m;
    return m;
  };

  // ── 1 · el listado con GT-229 DESPLEGADA ──────────────────────────────────
  await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, /guías de despacho/, "el listado", ancho, "listado");
  const buscador = page.locator('input[placeholder*="Buscar"]').first();
  await buscador.fill("");
  await buscador.type(DESPACHADA.rotulo.replace("GT-", ""), { delay: 40 });
  await page.waitForTimeout(1200);
  // 🩸 La fila de GT-229, LA VISIBLE: el listado dibuja los DOS layouts
  // (celular y escritorio) y esconde uno con CSS, así que `.first()` a secas
  // agarra el invisible y el clic muere por timeout.
  const fila = page.locator(`text=${DESPACHADA.rotulo}`).locator("visible=true").first();
  await fila.click();
  // La tabla de envíos del acordeón: es lo que hay que medir.
  await page.waitForSelector("table tbody tr", { timeout: 25000 });
  await page.waitForTimeout(1800);
  const listado = await medir("listado-desplegada");

  // ── 2 · la DESPACHADA en edición ──────────────────────────────────────────
  await page.goto(`${BASE}/guias/${DESPACHADA.id}?editar=1`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, /editar gu[ií]a de transporte/, "el formulario", ancho, "despachada-editar");
  await page.waitForTimeout(2000);
  const despachada = await medir("despachada-editar");

  // ── 3 · la PENDIENTE en edición ───────────────────────────────────────────
  await page.goto(`${BASE}/guias/${PENDIENTE.id}?editar=1`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, /editar gu[ií]a de transporte/, "el formulario", ancho, "pendiente-editar");
  await page.waitForTimeout(2000);
  const pendiente = await medir("pendiente-editar");

  // ── 4 · `/guias/nueva` ────────────────────────────────────────────────────
  await page.goto(`${BASE}/guias/nueva`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, /nueva gu[ií]a de transporte/, "el formulario de alta", ancho, "nueva");
  await page.waitForTimeout(1500);
  const nueva = await medir("nueva");

  informe[ancho] = { ...medidas, escrituras };

  // ── candados del MEDIDOR: si no encontró lo que mide, esto NO es verde ─────
  if (!listado.filasAcordeon) problemas.push(`🔴 ${ancho} listado: 0 filas de envío — no se desplegó la guía`);
  if (!despachada.diceEditar) problemas.push(`🔴 ${ancho} despachada-editar: no abrió el formulario`);
  if (!pendiente.camposDireccion) problemas.push(`🔴 ${ancho} pendiente-editar: 0 campos de Dirección VISIBLES`);
  if (!nueva.diceNueva) problemas.push(`🔴 ${ancho} nueva: no abrió el formulario de alta`);

  if (ETAPA === "antes") {
    if (!listado.celdasCliente.length) notas.push(`ℹ️ ${ancho} main: 0 celdas de cliente leídas`);
  } else {
    // 1 · el nombre UNA sola vez
    const repetidos = listado.celdasCliente.filter((c) => c.chip && c.texto.replace(c.chip, "").includes(c.chip.slice(0, 12)));
    if (repetidos.length) problemas.push(`🔴 ${ancho} listado: el nombre se dice DOS veces en ${repetidos.length} celdas — ${JSON.stringify(repetidos.slice(0, 2))}`);
    if (!listado.chipsCodigo) problemas.push(`🔴 ${ancho} listado: se perdió el chip del código D-XXX`);
    // 2 · «Si lo dio» y el sello «A mano»
    for (const [p, m] of Object.entries(medidas)) {
      if (m.diceSiLoDio) problemas.push(`🔴 ${ancho} ${p}: sigue diciendo «Si lo dio» (${m.diceSiLoDio})`);
      if (m.placeholdersSiLoDio) problemas.push(`🔴 ${ancho} ${p}: ${m.placeholdersSiLoDio} placeholders «Si lo dio»`);
      if (m.selloAMano) problemas.push(`🔴 ${ancho} ${p}: volvió el sello «A mano» (${m.selloAMano})`);
    }
    if (!pendiente.ejemploFacturas) problemas.push(`🔴 ${ancho} pendiente-editar: se perdió el «Ej: 10234, 10235» de FACTURA(S)`);
    for (const [p, m] of Object.entries(medidas)) {
      if (m.diceOpcional) problemas.push(`🔴 ${ancho} ${p}: quedan ${m.diceOpcional} «(opcional)»`);
    }
    if (!pendiente.observaciones) problemas.push(`🔴 ${ancho} pendiente-editar: no se encontró el bloque de Observaciones`);
    else if (pendiente.observaciones.rotulo !== "Observaciones")
      problemas.push(`🔴 ${ancho} pendiente-editar: el rótulo dice «${pendiente.observaciones.rotulo}»`);
    if (!pendiente.diceEscritoAMano) notas.push(`ℹ️ ${ancho} pendiente-editar: ningún cliente escrito a mano en esta guía`);
    // 3 · «＋ Agregar destino», pegado al campo y sin rótulo
    if (!pendiente.botonesAgregarDestino) problemas.push(`🔴 ${ancho} pendiente-editar: se perdió «Agregar destino»`);
    if (!pendiente.agregarDestinoPegadoAlCampo) problemas.push(`🔴 ${ancho} pendiente-editar: el ＋ NO está pegado a un campo de Dirección`);
    if (pendiente.agregarDestinoConRotulo) problemas.push(`🔴 ${ancho} pendiente-editar: el ＋ volvió a llevar rótulo visible`);
    if (pendiente.tituloDetalleTieneBoton) problemas.push(`🔴 ${ancho} pendiente-editar: «Detalle de Envío» volvió a tener un botón pegado`);
    if (!nueva.botonesAgregarDestino) problemas.push(`🔴 ${ancho} nueva: se perdió «Agregar destino» al crear`);
    if (despachada.botonesAgregarDestino) problemas.push(`🔴 ${ancho} despachada-editar: se ofrece «Agregar destino» con la dirección bloqueada`);
  }

  for (const [pantalla, m] of Object.entries(medidas)) {
    if (m.arrastrePagina > 0) problemas.push(`🔴 ${ancho} ${pantalla}: ${m.arrastrePagina} px de arrastre horizontal de la página`);
    if (m.textoChico.length) problemas.push(`🔴 ${ancho} ${pantalla}: ${m.textoChico.length} textos <12 px — ${JSON.stringify(m.textoChico.slice(0, 4))}`);
    if (m.recortados.length) notas.push(`ℹ️ ${ancho} ${pantalla}: ${m.recortados.length} recortados — ${JSON.stringify(m.recortados.slice(0, 3))}`);
  }

  const sobreLaGuia = escrituras.filter((e) => /\/api\/guias/.test(e));
  if (sobreLaGuia.length) problemas.push(`🔴 ${ancho}: se intentó escribir sobre una guía — ${JSON.stringify(sobreLaGuia)}`);

  await ctx.close();
}
await nav.close();

writeFileSync(`${SALIDA}/informe.json`, JSON.stringify(informe, null, 2));

const PANTALLAS = ["listado-desplegada", "despachada-editar", "pendiente-editar", "nueva"];
console.log(`\n═══ LOS 4 ANCHOS · Guías menos ruido (${ETAPA}) · BASE=${BASE} ═══`);
console.log("pantalla                  ancho    ALTO  arrastre  recortados  tocables<44  texto<12  ＋destino  «Si lo dio»  «A mano»");
for (const p of PANTALLAS) {
  for (const a of ANCHOS) {
    const m = informe[a][p];
    if (!m) continue;
    console.log(
      `${p.padEnd(25)} ${String(a).padStart(5)} ${String(m.altoPagina).padStart(7)} ${String(m.arrastrePagina).padStart(9)} ` +
      `${String(m.recortados.length).padStart(11)} ${String(m.chicos.length).padStart(12)} ${String(m.textoChico.length).padStart(9)} ` +
      `${String(m.botonesAgregarDestino).padStart(9)} ${String(m.diceSiLoDio).padStart(12)} ${String(m.selloAMano).padStart(9)}`,
    );
  }
}
console.log("\n── Observaciones: ¿el «(opcional)» dejó hueco? ──");
for (const a of ANCHOS) {
  const o = informe[a]["pendiente-editar"].observaciones;
  const n = informe[a]["nueva"].observaciones;
  console.log(`  ${a}: pendiente ${JSON.stringify(o)}`);
  console.log(`       nueva     ${JSON.stringify(n)}`);
}
console.log("\n── la columna CLIENTE del acordeón (GT-229) ──");
for (const a of ANCHOS) {
  const m = informe[a]["listado-desplegada"];
  console.log(`  ${a}: ${m.celdasCliente.length} celdas · chips D-XXX = ${m.chipsCodigo}`);
  for (const c of m.celdasCliente.slice(0, 3)) console.log(`      «${c.texto}»`);
}
console.log(`\ncapturas en ${SALIDA}`);
if (notas.length) { console.log("\nNOTAS:"); for (const n of notas) console.log("  -", n); }
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
