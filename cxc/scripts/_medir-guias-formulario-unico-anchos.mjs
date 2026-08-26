// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — LOS CUATRO ANCHOS del módulo Guías rehecho (25-ago-2026).
//
// Mide SEIS pantallas en 390 · 834 · 1024 · 1440, con DATOS DE PRODUCCIÓN:
//   1. `/guias` con una guía PENDIENTE REAL abierta (GT-230);
//   2. `/guias` con una guía DESPACHADA REAL abierta (GT-227);
//   3. `/guias/[id]` de la pendiente, en LECTURA;
//   4. la misma con `?editar=1` → el formulario;
//   5. `/guias/[id]` de la DESPACHADA con `?editar=1` → la pantalla nueva
//      (en `origin/main` esa pantalla NO existe: dice "no se puede editar",
//      y el script lo ANOTA en vez de fallar — es la diferencia que se mide);
//   6. `/guias/nueva`.
//
// 🔴 NO TOCA NINGUNA GUÍA REAL. En el navegador se aborta **cualquier pedido
// que no sea GET**, así que ni un clic accidental puede escribir. Nunca se
// aprieta «Despachar» ni «Guardar».
//
//   BASE=http://localhost:3213 ETAPA=despues node scripts/_medir-guias-formulario-unico-anchos.mjs
//   BASE=http://localhost:3214 ETAPA=antes   node scripts/_medir-guias-formulario-unico-anchos.mjs
//
// 🩸 GOTCHAS DE LA CASA, todos ya cobrados en este repo:
//   · el formulario dibuja **los DOS layouts** (tarjeta `-m` y tabla `-d`) y
//     esconde uno con CSS → contar el DOM entero da el DOBLE de campos;
//   · el acordeón de la lista no desmonta las filas cerradas (`grid-rows-[0fr]`
//     + `overflow-hidden`) y sus botones conservan caja → hay que subir por los
//     padres y descartar lo que esté dentro de un contenedor de alto 0;
//   · los rótulos llevan `uppercase` POR CSS → `innerText` los da en MAYÚSCULAS
//     (se compara con /i, siempre);
//   · hay que sembrar `sessionStorage.cxc_role` y `delete
//     Navigator.prototype.serviceWorker` ANTES de navegar;
//   · los tocables <44 px del FORMULARIO en escritorio son los campos densos de
//     `pointer:fine` (`CTRL_BASE`) y **main los mide igual**: se informan pero
//     no se cuentan como hallazgo de esta rama.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3213";
const ETAPA = process.env.ETAPA ?? "despues";
const SALIDA = process.env.SALIDA ?? `/tmp/guias-anchos-${ETAPA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

/** Guías REALES de producción. Se LEEN, nunca se escriben. */
const PENDIENTE = { id: "fa6dafb3-604e-400e-8677-f7867a2cc206", rotulo: "GT-230" };
/**
 * La marca de que la fila del acordeón ABRIÓ.
 *
 * 🩸 «Compartir» solo existe en esta rama: en `origin/main` la fila abierta
 * tiene «Imprimir» y el menú «···». Esperar la palabra de la rama nueva contra
 * main cuelga la medición 25 s y después dice "no abrió" — un rojo del medidor.
 */
const ABRIO = ETAPA === "antes" ? /imprimir/ : /compartir/;
const DESPACHADA = { id: "446cd3e5-adea-49d6-8180-76a9a77e6069", rotulo: "GT-227" };

mkdirSync(SALIDA, { recursive: true });

const MEDIR = () => {
  const de = document.documentElement;

  // 🩸 El acordeón NO desmonta las filas cerradas: las aplasta. Un botón dentro
  // de un contenedor de alto 0 sigue teniendo caja propia.
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

  // Tocables: solo los que se VEN. Un control escondido no se toca.
  const chicos = [...document.querySelectorAll("button, a, input, select, textarea, [role=button]")]
    .filter(visible)
    .filter((e) => {
      const r = e.getBoundingClientRect();
      // 🩸 Un checkbox de 16 px DENTRO de una etiqueta de 44 px cumple la regla
      // táctil: lo que se toca es la etiqueta entera. Contarlo marca en rojo el
      // patrón de la casa.
      const lab = e.closest("label");
      if (lab) {
        const rl = lab.getBoundingClientRect();
        if (rl.height >= 44 && rl.width >= 44) return false;
      }
      return r.height < 44 || r.width < 44;
    })
    .map(caja);

  // Recortados: lo que desborda su caja SIN ser un scroller declarado.
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
  const vis = (sel) => [...document.querySelectorAll(sel)].filter(visible);

  return {
    arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth),
    altoPagina: Math.max(de.scrollHeight, document.body.scrollHeight),
    chicos,
    recortados,
    textoChico,
    // ── qué hay en pantalla (para que el medidor no reporte 0 por no mirar) ──
    // ⚠️ SOLO LOS VISIBLES: el formulario dibuja los dos layouts.
    camposCliente: vis('input[id^="cliente-"]').length,
    camposBultos: vis('input[id^="bultos-"]').length,
    camposFacturas: vis('input[id^="facturas-"]').length,
    // 🔴 El N° del transportista POR LÍNEA. En `origin/main` esto es 0: allá el
    // número es de la CABECERA y no existe en el renglón.
    cajasNumTransp: vis('input[id^="numtransp-"]').map((i) => ({ id: i.id, w: Math.round(i.getBoundingClientRect().width) })),
    tituloFormulario: /(editar|nueva) gu[ií]a de transporte/i.test(txt),
    diceEditar: /editar gu[ií]a de transporte/i.test(txt),
    diceNueva: /nueva gu[ií]a de transporte/i.test(txt),
    diceBloqueada: /ya se despach[óo]: no se puede editar/i.test(txt),
    diceSalioIncompleta: /sali[óo] incompleta/i.test(txt),
    botones: [...document.querySelectorAll("button")].filter(visible).map((b) => (b.textContent || "").trim()).filter(Boolean),
    // El scroller de la tabla de envíos: su ancho mínimo es lo que cambia de
    // 720 a 820 cuando se pregunta el N° del transportista.
    anchoTabla: (() => {
      const t = vis("table")[0];
      return t ? { min: getComputedStyle(t).minWidth, scroll: Math.round(t.scrollWidth) } : null;
    })(),
    urlActual: location.pathname + location.search,
  };
};

const informe = {};
const problemas = [];
const notas = [];
const nav = await chromium.launch();

/**
 * La fila de la lista, **la VISIBLE**.
 *
 * 🩸 GOTCHA: la lista dibuja DOS layouts (celular y escritorio) y esconde uno
 * con CSS. `getByText(...).first()` devuelve el INVISIBLE y el clic se queda
 * esperando 30 s a un elemento que nunca se va a ver.
 */
const fila = (page, rotulo) => page.locator(`span:text-is("${rotulo}"):visible`);

/** Espera a que un texto aparezca; FALLA si no llega. */
async function exigirTexto(page, rx, queEs, ancho, pantalla) {
  try {
    await page.waitForFunction((s) => new RegExp(s, "i").test(document.body.innerText), rx.source, { timeout: 25000 });
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
    // 🔴 Nada que no sea GET sale de acá. Ni un clic accidental puede escribir.
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

  // ── 1 · la lista con una PENDIENTE REAL abierta ────────────────────────────
  await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, new RegExp(PENDIENTE.rotulo), `la fila ${PENDIENTE.rotulo}`, ancho, "lista");
  await fila(page, PENDIENTE.rotulo).first().click();
  await exigirTexto(page, ABRIO, "el acordeón abierto de la pendiente", ancho, "lista-pendiente");
  await page.waitForTimeout(1500);
  const listaPendiente = await medir("lista-pendiente");

  // ── 2 · la lista con una DESPACHADA REAL abierta ───────────────────────────
  await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, new RegExp(PENDIENTE.rotulo), "la lista", ancho, "lista");
  // Por defecto la lista puede venir filtrada a pendientes: se pide "ver todas".
  if (!(await fila(page, DESPACHADA.rotulo).count())) {
    const verTodas = page.locator('button:has-text("Ver todas"):visible').first();
    if (await verTodas.count()) await verTodas.click();
    await page.waitForTimeout(1200);
  }
  if (!(await fila(page, DESPACHADA.rotulo).count())) {
    throw new Error(`🔴 ${ancho}: no se encontró la fila ${DESPACHADA.rotulo} en la lista`);
  }
  await fila(page, DESPACHADA.rotulo).first().scrollIntoViewIfNeeded();
  await fila(page, DESPACHADA.rotulo).first().click();
  await exigirTexto(page, ABRIO, "el acordeón abierto de la despachada", ancho, "lista-despachada");
  await page.waitForTimeout(1500);
  const listaDespachada = await medir("lista-despachada");

  // ── 3 · la guía PENDIENTE en LECTURA ───────────────────────────────────────
  await page.goto(`${BASE}/guias/${PENDIENTE.id}`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, new RegExp(PENDIENTE.rotulo), "la guía pendiente", ancho, "pendiente-lectura");
  await page.waitForTimeout(1500);
  const pendienteLectura = await medir("pendiente-lectura");

  // ── 4 · la MISMA con `?editar=1` ───────────────────────────────────────────
  await page.goto(`${BASE}/guias/${PENDIENTE.id}?editar=1`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, /editar gu[ií]a de transporte/, "el formulario de edición", ancho, "pendiente-editar");
  await page.waitForTimeout(1500);
  const pendienteEditar = await medir("pendiente-editar");

  // ── 5 · la DESPACHADA con `?editar=1` ──────────────────────────────────────
  await page.goto(`${BASE}/guias/${DESPACHADA.id}?editar=1`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, new RegExp(DESPACHADA.rotulo + "|editar gu[ií]a"), "la guía despachada", ancho, "despachada-editar");
  await page.waitForTimeout(2000);
  const despachadaEditar = await medir("despachada-editar");

  // ── 6 · `/guias/nueva` ─────────────────────────────────────────────────────
  await page.goto(`${BASE}/guias/nueva`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, /nueva gu[ií]a de transporte/, "el formulario de alta", ancho, "nueva");
  await page.waitForTimeout(1500);
  const nueva = await medir("nueva");

  informe[ancho] = { ...medidas, escrituras };

  // ── candados: si no se encontró lo que se mide, esto NO es verde ───────────
  if (!listaPendiente.botones.length) problemas.push(`🔴 ${ancho} lista-pendiente: no se vio ni un botón en la fila abierta`);
  if (!pendienteLectura.botones.some((b) => /despachar/i.test(b))) problemas.push(`🔴 ${ancho} pendiente-lectura: no aparece «Despachar»`);
  if (!pendienteEditar.diceEditar) problemas.push(`🔴 ${ancho} pendiente-editar: no abrió el formulario`);
  if (!pendienteEditar.camposCliente) problemas.push(`🔴 ${ancho} pendiente-editar: 0 campos de cliente VISIBLES`);
  if (!nueva.diceNueva) problemas.push(`🔴 ${ancho} nueva: no abrió el formulario de alta`);

  if (ETAPA === "antes") {
    // En `origin/main` la despachada NO se edita y el N° no es por línea: se
    // ANOTA, que es justamente lo que se está comparando.
    if (!despachadaEditar.diceBloqueada) notas.push(`ℹ️ ${ancho} despachada-editar (main): no dijo "no se puede editar"`);
    if (despachadaEditar.cajasNumTransp.length) notas.push(`ℹ️ ${ancho}: main ya traía cajas del N° por línea`);
  } else {
    if (!despachadaEditar.diceEditar) problemas.push(`🔴 ${ancho} despachada-editar: la despachada NO abre el formulario`);
    if (!despachadaEditar.camposFacturas) problemas.push(`🔴 ${ancho} despachada-editar: no hay campo de facturas editable`);
    if (despachadaEditar.camposBultos) problemas.push(`🔴 ${ancho} despachada-editar: los BULTOS quedaron editables en una guía firmada`);
    if (!despachadaEditar.cajasNumTransp.length) problemas.push(`🔴 ${ancho} despachada-editar: no está la caja del N° del transportista`);
    // La pendiente REAL es de transportista externo: tiene que pedir el N° por línea.
    if (!pendienteEditar.cajasNumTransp.length) problemas.push(`🔴 ${ancho} pendiente-editar: falta el N° del transportista POR LÍNEA`);
    if (pendienteEditar.cajasNumTransp.length !== pendienteEditar.camposCliente) {
      problemas.push(`🔴 ${ancho} pendiente-editar: ${pendienteEditar.cajasNumTransp.length} cajas de N° para ${pendienteEditar.camposCliente} renglones`);
    }
  }

  // ── los cuatro números de cada pantalla ────────────────────────────────────
  for (const [pantalla, m] of Object.entries(medidas)) {
    // 🔴 Rojo de verdad: la página no puede arrastrarse, y en guías nada baja
    // de 12 px (candado `iphone-targets-guias`).
    if (m.arrastrePagina > 0) problemas.push(`🔴 ${ancho} ${pantalla}: ${m.arrastrePagina} px de arrastre horizontal de la página`);
    if (m.textoChico.length) problemas.push(`🔴 ${ancho} ${pantalla}: ${m.textoChico.length} textos <12 px — ${JSON.stringify(m.textoChico.slice(0, 4))}`);
    // ⚠️ Los "recortados" se LISTAN, no tumban la corrida: en su enorme mayoría
    // son `truncate` con puntos suspensivos —el mecanismo, no un defecto— y los
    // 8 px del `-mx-2` de `SignatureCanvas`, todos PRE-EXISTENTES y medidos
    // idénticos en `origin/main`. Lo que decide si alguno es nuevo es la
    // comparación de las DOS etapas, no un umbral de este script.
    if (m.recortados.length) notas.push(`ℹ️ ${ancho} ${pantalla}: ${m.recortados.length} recortados — ${JSON.stringify(m.recortados.slice(0, 4))}`);
  }

  const sobreLaGuia = escrituras.filter((e) => /\/api\/guias/.test(e));
  if (sobreLaGuia.length) problemas.push(`🔴 ${ancho}: se intentó escribir sobre una guía — ${JSON.stringify(sobreLaGuia)}`);

  await ctx.close();
}
await nav.close();

writeFileSync(`${SALIDA}/informe-anchos.json`, JSON.stringify(informe, null, 2));

const PANTALLAS = ["lista-pendiente", "lista-despachada", "pendiente-lectura", "pendiente-editar", "despachada-editar", "nueva"];
console.log(`\n═══ LOS 4 ANCHOS · Guías (${ETAPA}) · BASE=${BASE} ═══`);
console.log("pantalla              ancho  arrastre  recortados  tocables<44  texto<12  N°porLínea");
for (const p of PANTALLAS) {
  for (const a of ANCHOS) {
    const m = informe[a][p];
    if (!m) continue;
    console.log(
      `${p.padEnd(21)} ${String(a).padStart(5)} ${String(m.arrastrePagina).padStart(9)} ${String(m.recortados.length).padStart(11)} ${String(m.chicos.length).padStart(12)} ${String(m.textoChico.length).padStart(9)} ${String(m.cajasNumTransp.length).padStart(11)}`,
    );
  }
}
console.log(`\ncapturas en ${SALIDA}`);
if (notas.length) { console.log("\nNOTAS:"); for (const n of notas) console.log("  -", n); }
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
