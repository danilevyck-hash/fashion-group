// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — LOS 4 ANCHOS de la tanda «la despachada se ve como al crear»
// (25-ago-2026).
//
// Mide, en 390 · 834 · 1024 · 1440, contra el build de PRODUCCIÓN y con DATOS
// DE PRODUCCIÓN:
//
//   1. `/guias/<pendiente>?editar=1`  — el formulario del alta sobre una guía
//      PENDIENTE REAL (GT-230), con el bloque de despacho debajo. Es LA pantalla
//      del encargo: acá vivía el bloque fijo de «Los que más usa este
//      transportista», y sacarlo tiene que ACORTARLA. Se reporta el ALTO.
//   2. `/guias/<despachada>?editar=1` — la guía DESPACHADA REAL de la captura
//      de Daniel (GT-229): los campos bloqueados con su candado.
//   3. `/guias/nueva`                 — la regresión: al crear no cambió nada.
//
// Y en la pendiente se PRUEBA el autocompletado de verdad: se escriben 2 letras
// en «Recibido por», se comprueba que aparezcan las opciones, se toca una y se
// verifica que los TRES campos (recibido por · cédula · placa) quedaron llenos.
//
// 🔴 NO TOCA NINGUNA GUÍA REAL. En el navegador se **aborta cualquier pedido
// que no sea GET**, así que ni un clic accidental puede escribir. Nunca se
// aprieta «Despachar» ni «Guardar Cambios».
//
//   BASE=http://localhost:3213 ETAPA=despues node scripts/_medir-guias-consistencia-anchos.mjs
//   BASE=http://localhost:3214 ETAPA=antes   node scripts/_medir-guias-consistencia-anchos.mjs
//
// 🩸 GOTCHAS DE LA CASA, todos ya cobrados en este repo:
//   · el formulario dibuja **los DOS layouts** (tarjeta `-m` y tabla `-d`) y
//     esconde uno con CSS → contar el DOM entero da el DOBLE de campos;
//   · los rótulos llevan `uppercase` POR CSS → `innerText` los devuelve en
//     MAYÚSCULAS (se compara con /i, siempre);
//   · hay que sembrar `sessionStorage.cxc_role` y `delete
//     Navigator.prototype.serviceWorker` ANTES de navegar;
//   · un checkbox de 16 px DENTRO de una etiqueta de 44 cumple la regla táctil:
//     lo que se toca es la etiqueta entera;
//   · los tocables <44 px del FORMULARIO en escritorio son los campos densos de
//     `pointer:fine` (`CTRL_BASE`) y **main los mide igual**.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3213";
const ETAPA = process.env.ETAPA ?? "despues";
const SALIDA = process.env.SALIDA ?? `/tmp/guias-consistencia-${ETAPA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

/** Guías REALES de producción. Se LEEN, nunca se escriben. */
const PENDIENTE = { id: "fa6dafb3-604e-400e-8677-f7867a2cc206", rotulo: "GT-230" };
/** La de la captura de Daniel. */
const DESPACHADA = { id: "703e3063-18a9-482e-89b1-63a7e1b6e621", rotulo: "GT-229" };
/**
 * 🔴 LAS DOS LETRAS QUE SE TECLEAN, elegidas contra los juegos REALES de ESTE
 * transportista (Edwin): `Álvaro ábrego · 4 veces` · `Anibal arauz · 4` ·
 * `Walter Arauz · 3` — los mismos tres de la captura de Daniel. `ar` pega con
 * los DOS «arauz» por el principio de una palabra, y NO con «Álvaro ábrego»
 * (que empieza con «al» y «ab»): sirve para ver el filtro Y el orden.
 */
const LETRAS = process.env.LETRAS ?? "ar";

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
  // 🩸 `innerText` NO devuelve el texto de un `sr-only` (está clipeado con
  // `clip-path`), así que preguntarle por el candado daba SIEMPRE 0 — un rojo
  // del medidor sobre algo que sí estaba puesto. Para eso va `textContent`.
  const txtCrudo = document.body.textContent || "";
  const vis = (sel) => [...document.querySelectorAll(sel)].filter(visible);

  return {
    arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth),
    altoPagina: Math.max(de.scrollHeight, document.body.scrollHeight),
    chicos,
    recortados,
    textoChico,
    // ── qué hay en pantalla (para que el medidor no reporte 0 por no mirar) ──
    camposCliente: vis('input[id^="cliente-"]').length,
    camposDireccion: vis('input[id^="direccion-"]').length,
    camposEmpresa: vis('select[id^="empresa-"]').length,
    camposBultos: vis('input[id^="bultos-"]').length,
    camposFacturas: vis('input[id^="facturas-"]').length,
    cajasNumTransp: vis('input[id^="numtransp-"]').length,
    // 🔴 Las cajas APAGADAS: se muestran, no se esconden.
    cajasBloqueadas: vis("[data-bloqueado='1']").map((e) => (e.textContent || "").trim().slice(0, 24)),
    // 🩸 EL ASTERISCO VIVE EN DOS SITIOS Y HAY QUE CONTAR LOS DOS: el rótulo
    // `<label>` de la tarjeta (que manda por debajo de `lg`) y el `<th>` de la
    // tabla (que manda desde `lg`). Contar solo los `label` daba **0
    // asteriscos** en escritorio aunque la tabla los tuviera todos — o sea
    // verde sin haber mirado la mitad de los anchos.
    asteriscos:
      vis("label").filter((l) => (l.textContent || "").includes("*")).length +
      vis("th").filter((t) => (t.textContent || "").includes("*")).length,
    // Los candados de la cabecera de la tabla, aparte.
    candadosTabla: vis("th").filter((t) => t.querySelector("svg")).length,
    // El candado (svg) dentro de un rótulo bloqueado.
    candados: vis("label").filter((l) => l.parentElement?.querySelector("svg")).length,
    diceBloqueado: (txtCrudo.match(/bloqueado, no se puede cambiar/g) || []).length,
    // 🔴 El «Falta: …» — lo que Daniel vio DOS veces.
    avisosFalta: [...document.querySelectorAll("p")]
      .filter(visible)
      .map((p) => (p.textContent || "").trim())
      .filter((t) => /^Falta:/.test(t)),
    // El bloque FIJO que se retiró.
    diceBloqueFijo: /los que m[áa]s usa este transportista/i.test(txt),
    diceTocaloYSeLlenan: /t[óo]calo y se llenan los tres campos/i.test(txt),
    // «Agregar destino», y DÓNDE está.
    botonAgregarDestino: vis("button").filter((b) => /agregar destino a la lista/i.test(b.textContent || "")).length,
    tituloDetalleTieneBoton: (() => {
      const enc = [...document.querySelectorAll("div")].find(
        (d) => (d.textContent || "").trim() === "Detalle de Envío",
      );
      return enc ? !!enc.querySelector("button") : null;
    })(),
    tituloFormulario: /(editar|nueva) gu[ií]a de transporte/i.test(txt),
    diceEditar: /editar gu[ií]a de transporte/i.test(txt),
    diceNueva: /nueva gu[ií]a de transporte/i.test(txt),
    diceBloqueada: /ya se despach[óo]: no se puede editar/i.test(txt),
    urlActual: location.pathname + location.search,
  };
};

const informe = {};
const problemas = [];
const notas = [];
const nav = await chromium.launch();

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
    // 🔴 Nada que no sea GET sale de acá.
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

  // ── 1 · la guía PENDIENTE con el formulario abierto ────────────────────────
  await page.goto(`${BASE}/guias/${PENDIENTE.id}?editar=1`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, /editar gu[ií]a de transporte/, "el formulario", ancho, "pendiente-editar");
  await page.waitForTimeout(2000);
  const pendiente = await medir("pendiente-editar");

  // ── 1b · EL AUTOCOMPLETADO, tocado de verdad ───────────────────────────────
  const receptor = page.locator("#despacho-receptor");
  let auto = { hay: false, motivo: "no se encontró el campo «Recibido por»" };
  if (await receptor.count()) {
    await receptor.scrollIntoViewIfNeeded();
    // Estado 0: sin escribir nada, no puede haber opciones.
    const antesDeEscribir = await page.locator("[role=option]").count();
    // 🔴 Se escribe con el TECLADO, como una persona: `fill()` no dispara la
    // secuencia de eventos que abre la lista.
    await receptor.click();
    await receptor.press("Control+a").catch(() => {});
    await receptor.fill("");
    await receptor.type(LETRAS, { delay: 60 });
    await page.waitForTimeout(600);
    const conDosLetras = await page.locator("[role=option]").count();
    let tresCampos = null;
    let todasLasOpciones = [];
    if (conDosLetras > 0) {
      const opcion = page.locator("[role=option]").first();
      const textoOpcion = (await opcion.innerText()).trim();
      // 🔴 EL ORDEN, leído en pantalla: por FRECUENCIA, no alfabético ni por
      // fecha. Con `ar` pegan `Anibal arauz · 4 veces` y `Walter Arauz · 3`.
      todasLasOpciones = await page.locator("[role=option]").allInnerTexts();
      await medir("pendiente-autocompletado");
      await opcion.click();
      await page.waitForTimeout(400);
      tresCampos = {
        receptor: await page.locator("#despacho-receptor").inputValue(),
        cedula: await page.locator("#despacho-cedula").inputValue(),
        placa: await page.locator("#despacho-placa").inputValue(),
        opcionTocada: textoOpcion,
        listaCerrada: (await page.locator("[role=option]").count()) === 0,
      };
    }
    auto = { hay: true, letras: LETRAS, antesDeEscribir, conDosLetras, opciones: todasLasOpciones, tresCampos };
  }

  // ── 2 · la guía DESPACHADA con el formulario abierto ───────────────────────
  await page.goto(`${BASE}/guias/${DESPACHADA.id}?editar=1`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, new RegExp(`${DESPACHADA.rotulo}|editar gu[ií]a`), "la guía despachada", ancho, "despachada-editar");
  await page.waitForTimeout(2000);
  const despachada = await medir("despachada-editar");

  // ── 3 · `/guias/nueva` ─────────────────────────────────────────────────────
  await page.goto(`${BASE}/guias/nueva`, { waitUntil: "domcontentloaded" });
  await exigirTexto(page, /nueva gu[ií]a de transporte/, "el formulario de alta", ancho, "nueva");
  await page.waitForTimeout(1500);
  const nueva = await medir("nueva");

  informe[ancho] = { ...medidas, autocompletado: auto, escrituras };

  // ── candados del MEDIDOR: si no encontró lo que mide, esto NO es verde ─────
  if (!pendiente.diceEditar) problemas.push(`🔴 ${ancho} pendiente-editar: no abrió el formulario`);
  if (!pendiente.camposCliente) problemas.push(`🔴 ${ancho} pendiente-editar: 0 campos de cliente VISIBLES`);
  if (!nueva.diceNueva) problemas.push(`🔴 ${ancho} nueva: no abrió el formulario de alta`);

  if (ETAPA === "antes") {
    if (!despachada.diceEditar) notas.push(`ℹ️ ${ancho} despachada-editar (main): no abrió el formulario`);
    if (!despachada.asteriscos) notas.push(`ℹ️ ${ancho} main: la despachada ya salía sin asteriscos`);
    if (!auto.hay) notas.push(`ℹ️ ${ancho} main: no se encontró «Recibido por»`);
  } else {
    // 🔴 LO QUE ESTE PR TIENE QUE CUMPLIR, o la corrida es ROJA.
    if (!despachada.diceEditar) problemas.push(`🔴 ${ancho} despachada-editar: no abrió el formulario`);
    if (despachada.asteriscos > 0)
      problemas.push(`🔴 ${ancho} despachada-editar: quedan ${despachada.asteriscos} asteriscos de obligatorio`);
    if (despachada.camposDireccion || despachada.camposEmpresa || despachada.camposBultos)
      problemas.push(`🔴 ${ancho} despachada-editar: dirección/empresa/bultos siguen siendo campos escribibles`);
    if (!despachada.camposCliente || !despachada.camposFacturas || !despachada.cajasNumTransp)
      problemas.push(`🔴 ${ancho} despachada-editar: falta alguno de los TRES campos que sí se corrigen`);
    if (despachada.cajasBloqueadas.length < 3)
      problemas.push(`🔴 ${ancho} despachada-editar: solo ${despachada.cajasBloqueadas.length} cajas apagadas — lo bloqueado tiene que VERSE`);
    if (!despachada.diceBloqueado)
      problemas.push(`🔴 ${ancho} despachada-editar: el candado no se dice para quien no ve la pantalla`);
    // La pendiente NO puede perder sus asteriscos ni ganar candados.
    if (!pendiente.asteriscos) problemas.push(`🔴 ${ancho} pendiente-editar: perdió los asteriscos del alta`);
    if (pendiente.cajasBloqueadas.length)
      problemas.push(`🔴 ${ancho} pendiente-editar: apareció una caja apagada al CREAR`);
    if (!nueva.asteriscos) problemas.push(`🔴 ${ancho} nueva: perdió los asteriscos`);
    // El bloque fijo se fue de las tres pantallas.
    for (const [p, m] of Object.entries(medidas)) {
      if (m.diceBloqueFijo) problemas.push(`🔴 ${ancho} ${p}: volvió el bloque fijo «Los que más usa este transportista»`);
      if (m.diceTocaloYSeLlenan) problemas.push(`🔴 ${ancho} ${p}: volvió el «Tócalo y se llenan los tres campos»`);
      if (m.avisosFalta.length !== new Set(m.avisosFalta).size)
        problemas.push(`🔴 ${ancho} ${p}: el mismo «Falta: …» se dice dos veces — ${JSON.stringify(m.avisosFalta)}`);
    }
    // «Agregar destino» salió del título y sigue existiendo en el alta.
    if (nueva.tituloDetalleTieneBoton) problemas.push(`🔴 ${ancho} nueva: «Detalle de Envío» sigue con un botón pegado al título`);
    if (!nueva.botonAgregarDestino) problemas.push(`🔴 ${ancho} nueva: se perdió «Agregar destino a la lista»`);
    if (despachada.botonAgregarDestino)
      problemas.push(`🔴 ${ancho} despachada-editar: se ofrece «Agregar destino» con la dirección bloqueada`);
    // El autocompletado, tocado de verdad.
    if (!auto.hay) {
      problemas.push(`🔴 ${ancho}: no se encontró «Recibido por» — no se pudo probar el autocompletado`);
    } else {
      if (auto.antesDeEscribir > 0)
        problemas.push(`🔴 ${ancho}: había ${auto.antesDeEscribir} opciones ANTES de escribir nada`);
      if (!auto.conDosLetras) {
        notas.push(`ℹ️ ${ancho}: con 2 letras no salió ninguna opción (¿este transportista no tiene juegos guardados?)`);
      } else if (!auto.tresCampos?.receptor || !auto.tresCampos?.cedula || !auto.tresCampos?.placa) {
        problemas.push(`🔴 ${ancho}: tocar una opción NO llenó los tres campos — ${JSON.stringify(auto.tresCampos)}`);
      } else if (!auto.tresCampos.listaCerrada) {
        problemas.push(`🔴 ${ancho}: la lista quedó abierta después de elegir`);
      }
    }
  }

  for (const [pantalla, m] of Object.entries(medidas)) {
    if (m.arrastrePagina > 0) problemas.push(`🔴 ${ancho} ${pantalla}: ${m.arrastrePagina} px de arrastre horizontal de la página`);
    if (m.textoChico.length) problemas.push(`🔴 ${ancho} ${pantalla}: ${m.textoChico.length} textos <12 px — ${JSON.stringify(m.textoChico.slice(0, 4))}`);
    if (m.recortados.length) notas.push(`ℹ️ ${ancho} ${pantalla}: ${m.recortados.length} recortados — ${JSON.stringify(m.recortados.slice(0, 4))}`);
  }

  const sobreLaGuia = escrituras.filter((e) => /\/api\/guias/.test(e));
  if (sobreLaGuia.length) problemas.push(`🔴 ${ancho}: se intentó escribir sobre una guía — ${JSON.stringify(sobreLaGuia)}`);

  await ctx.close();
}
await nav.close();

writeFileSync(`${SALIDA}/informe.json`, JSON.stringify(informe, null, 2));

const PANTALLAS = ["pendiente-editar", "pendiente-autocompletado", "despachada-editar", "nueva"];
console.log(`\n═══ LOS 4 ANCHOS · Guías consistencia (${ETAPA}) · BASE=${BASE} ═══`);
console.log("pantalla                  ancho   ALTO  arrastre  recortados  tocables<44  texto<12  asteriscos  bloqueadas");
for (const p of PANTALLAS) {
  for (const a of ANCHOS) {
    const m = informe[a][p];
    if (!m) continue;
    console.log(
      `${p.padEnd(25)} ${String(a).padStart(5)} ${String(m.altoPagina).padStart(6)} ${String(m.arrastrePagina).padStart(9)} ` +
      `${String(m.recortados.length).padStart(11)} ${String(m.chicos.length).padStart(12)} ${String(m.textoChico.length).padStart(9)} ` +
      `${String(m.asteriscos).padStart(11)} ${String(m.cajasBloqueadas.length).padStart(11)}`,
    );
  }
}
console.log("\n── el bloque FIJO de frecuentes ──");
for (const a of ANCHOS) {
  const m = informe[a]["pendiente-editar"];
  console.log(`  ${a}: «Los que más usa este transportista» en pantalla = ${m.diceBloqueFijo}`);
}
console.log("\n── autocompletado ──");
for (const a of ANCHOS) {
  const x = informe[a].autocompletado;
  console.log(`  ${a}: sin escribir=${x.antesDeEscribir ?? "?"} · con «${x.letras ?? "?"}»=${x.conDosLetras ?? "?"} → ${JSON.stringify(x.opciones ?? [])}`);
  console.log(`       tres campos: ${JSON.stringify(x.tresCampos ?? null)}`);
}
console.log(`\ncapturas en ${SALIDA}`);
if (notas.length) { console.log("\nNOTAS:"); for (const n of notas) console.log("  -", n); }
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
