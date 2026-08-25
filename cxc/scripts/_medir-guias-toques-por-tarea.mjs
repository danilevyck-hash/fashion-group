// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — LOS TOQUES POR TAREA, ANTES Y DESPUÉS (25-ago-2026).
//
// Cuenta los toques REALES (clics) de seis tareas, TOCANDO los botones, no
// estimando: crear una guía · corregir un nombre en una pendiente · despachar ·
// imprimir · compartir · corregir una factura de una guía DESPACHADA.
//
// 🔴 NO TOCA NINGUNA GUÍA REAL. En el navegador se aborta **cualquier pedido
// que no sea GET**, y las tareas se cuentan HASTA el último toque ANTES del que
// escribiría: nunca se aprieta «Despachar», «Guardar Guía» ni «Guardar
// cambios». `window.print` y `navigator.share` se reemplazan por espías, así
// que tampoco sale una hoja ni se abre la hoja de compartir del sistema.
//
//   BASE=http://localhost:3213 ETAPA=despues node scripts/_medir-guias-toques-por-tarea.mjs
//   BASE=http://localhost:3214 ETAPA=antes   node scripts/_medir-guias-toques-por-tarea.mjs
//
// 🩸 GOTCHAS DE LA CASA: la lista dibuja los DOS layouts y esconde uno con CSS
// (hay que tocar el VISIBLE); el acordeón no desmonta las filas cerradas, así
// que sus botones siguen en el DOM; los rótulos llevan `uppercase` por CSS; y
// hay que sembrar `sessionStorage.cxc_role` y borrar
// `Navigator.prototype.serviceWorker` ANTES de navegar.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3213";
const ETAPA = process.env.ETAPA ?? "despues";
const SALIDA = process.env.SALIDA ?? `/tmp/guias-toques-${ETAPA}`;
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

/** Guías REALES de producción. Se LEEN, nunca se escriben. */
const PENDIENTE = { id: "fa6dafb3-604e-400e-8677-f7867a2cc206", rotulo: "GT-230" };
const DESPACHADA = { id: "446cd3e5-adea-49d6-8180-76a9a77e6069", rotulo: "GT-227" };

mkdirSync(SALIDA, { recursive: true });

const nav = await chromium.launch();
const resultados = [];
const problemas = [];

/** Una sesión limpia por tarea: los toques de una no pueden ahorrarle a la otra. */
async function sesion() {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
    // 🔴 Espías: ni se imprime ni se abre la hoja de compartir de verdad.
    //
    // 🩸 `window.print` NO alcanza y daría 0 sin haber mirado nada: el papel se
    // manda como un PDF con la orden `autoPrint` ADENTRO, cargado en un
    // `<iframe>` con una URL `blob:` (escritorio) o en una pestaña del visor
    // (iOS). Lo que hay que contar es el PDF que salió, no una llamada que
    // nadie hace.
    window.__imprimio = 0;
    window.print = () => { window.__imprimio++; };
    window.__blobs = 0;
    const crear = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { window.__blobs++; return crear(b); };
    window.__compartio = 0;
    const puedo = () => true;
    Object.defineProperty(navigator, "canShare", { value: puedo, configurable: true });
    Object.defineProperty(navigator, "share", {
      value: async () => { window.__compartio++; },
      configurable: true,
    });
  });
  const page = await ctx.newPage();
  const escrituras = [];
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") { escrituras.push(`${req.method()} ${req.url().replace(BASE, "")}`); return route.abort(); }
    return route.continue();
  });
  return { ctx, page, escrituras };
}

const fila = (page, rotulo) => page.locator(`span:text-is("${rotulo}"):visible`);
const boton = (page, rx) => page.locator("button:visible").filter({ hasText: rx });

/**
 * Un botón DE LA FILA `rotulo`, no el primero que aparezca en la lista.
 *
 * 🩸 GOTCHA: el acordeón deja en el DOM los botones de TODAS las filas y hay
 * 15 «Editar» a la vez. `.first()` agarra el de la fila de arriba, el clic cae
 * sobre su encabezado (que la cierra) y la medición termina "en la lista" —
 * un ⛔ del medidor, no del producto.
 */
const botonDeLaFila = (page, rotulo, rx) =>
  page
    .locator("div.border.rounded-lg")
    .filter({ has: page.locator(`span:text-is("${rotulo}")`) })
    .last()
    .locator("button:visible")
    .filter({ hasText: rx });

/**
 * Deja la lista con la fila `rotulo` a la vista y devuelve **los toques que
 * costó llegar a ella**.
 *
 * 🩸 La lista NO muestra todas las guías de entrada: arranca con las últimas y
 * un «Ver más (197 restantes)» al pie. Esperar el rótulo a secas cuelga la
 * medición 25 s con una guía vieja y la deja en 0 toques — verde por no haber
 * mirado. Los toques de «Ver más» se CUENTAN: la persona los da igual.
 */
async function irALaLista(page, rotulo) {
  await page.goto(`${BASE}/guias`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /GT-\d/.test(document.body.innerText), null, { timeout: 25000 });
  await page.waitForTimeout(1200);
  let toques = 0;
  for (let i = 0; i < 4; i++) {
    if (await fila(page, rotulo).count()) break;
    const mas = page.locator('button:visible').filter({ hasText: /^Ver (todas|más)/i }).first();
    if (!(await mas.count())) break;
    await mas.click();
    toques++;
    await page.waitForTimeout(1500);
  }
  if (!(await fila(page, rotulo).count())) throw new Error(`no se encontró la fila ${rotulo} en la lista`);
  await fila(page, rotulo).first().scrollIntoViewIfNeeded().catch(() => {});
  return toques;
}

/** Abre la fila del acordeón. Cuesta UN toque y es donde viven los botones. */
async function abrirFila(page, rotulo) {
  await fila(page, rotulo).first().click();
  await page.waitForFunction(() => /imprimir/i.test(document.body.innerText), null, { timeout: 25000 });
  // El acordeón ANIMA su apertura: tocar antes de que asiente mueve el botón.
  await page.waitForTimeout(2500);
  return 1;
}

const hayFormulario = (page) =>
  page.evaluate(() => /(editar|nueva) gu[ií]a de transporte/i.test(document.body.innerText));

/** Espera a que la pantalla llegue a un estado; devuelve si llegó. */
async function esperar(page, fn, ms = 20000) {
  try { await page.waitForFunction(fn, null, { timeout: ms }); return true; } catch { return false; }
}

async function tarea(nombre, cuerpo) {
  const { ctx, page, escrituras } = await sesion();
  let toques = 0;
  const toque = async (loc, comoSeLlama) => {
    if (!(await loc.count())) throw new Error(`🔴 ${nombre}: no existe el control «${comoSeLlama}»`);
    const b = loc.first();
    // Centrarlo, no solo "traerlo a la vista": pegado al borde de arriba queda
    // debajo de la barra pegajosa y el clic se declara "interceptado".
    await b.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
    await page.waitForTimeout(400);
    try {
      await b.click({ timeout: 12000 });
    } catch {
      // 🩸 La barra pegajosa del encabezado tapa el botón cuando la fila queda
      // arriba de todo: Playwright lo llama "intercepted" y reintenta 30 s. Un
      // dedo lo alcanza igual (se arrastra un poco), así que se aparta la
      // pantalla y se vuelve a tocar; si aun así no se puede, se fuerza.
      await page.evaluate(() => window.scrollBy(0, -120));
      await page.waitForTimeout(400);
      try { await b.click({ timeout: 8000 }); } catch { await b.click({ force: true }); }
    }
    toques++;
    await page.waitForTimeout(900);
  };
  let nota = "";
  try {
    nota = (await cuerpo({ page, toque, sumar: (n) => { toques += n; } })) || "";
  } catch (e) {
    nota = `⚠️ ${e.message}`;
    problemas.push(`🔴 ${nombre}: ${e.message}`);
  }
  await page.screenshot({ path: `${SALIDA}/${nombre.replace(/[^a-z0-9]+/gi, "-")}.png`, fullPage: true });
  const sobreLaGuia = escrituras.filter((e) => /\/api\/guias/.test(e));
  if (sobreLaGuia.length) problemas.push(`🔴 ${nombre}: se intentó escribir sobre una guía — ${JSON.stringify(sobreLaGuia)}`);
  // 🔴 Un medidor que canta 🟢 con un ⛔ adentro es peor que ninguno.
  if (/[⛔⚠️]/.test(nota)) problemas.push(`🔴 ${nombre}: ${nota}`);
  resultados.push({ tarea: nombre, toques, nota });
  await ctx.close();
}

// ── 1 · CREAR UNA GUÍA ───────────────────────────────────────────────────────
// Se cuenta hasta tener el formulario en blanco listo para escribir. Guardar es
// un toque más, el mismo en las dos ramas, y **no se aprieta**.
await tarea("crear una guía", async ({ page, toque, sumar }) => {
  sumar(await irALaLista(page, PENDIENTE.rotulo));
  await toque(boton(page, /^Nueva Guía$/i), "Nueva Guía");
  if (!(await esperar(page, () => /nueva gu[ií]a de transporte/i.test(document.body.innerText)))) {
    throw new Error("el formulario de alta no abrió");
  }
  return "hasta el formulario en blanco (Guardar es 1 toque más, igual en las dos)";
});

// ── 2 · CORREGIR UN NOMBRE EN UNA PENDIENTE ──────────────────────────────────
// Hasta tener el campo del CLIENTE escribible.
await tarea("corregir un nombre (pendiente)", async ({ page, toque, sumar }) => {
  sumar(await irALaLista(page, PENDIENTE.rotulo));
  sumar(await abrirFila(page, PENDIENTE.rotulo));
  if (ETAPA === "antes") {
    // main: la fila solo ofrece «Despachar» → la guía en LECTURA → «Editar».
    await toque(boton(page, /^Despachar$/i), "Despachar (fila)");
    if (!(await esperar(page, () => [...document.querySelectorAll("button")].some((b) => /^editar$/i.test((b.textContent || "").trim()))))) {
      throw new Error("la guía no ofreció «Editar»");
    }
  }
  await toque(ETAPA === "antes" ? boton(page, /^Editar$/i) : botonDeLaFila(page, PENDIENTE.rotulo, /^Editar$/i), "Editar");
  let abrio = await esperar(page, () => /editar gu[ií]a de transporte/i.test(document.body.innerText), 12000);
  let extra = "";
  if (!abrio) {
    // 🔴 HALLAZGO: en esta rama, «Editar» de la FILA deja la URL en `?editar=1`
    // pero la pantalla en LECTURA. Hace falta tocar «Editar» otra vez, ya
    // dentro de la guía. Se cuenta el toque de verdad, no el que debería.
    extra = " — 🔴 el «Editar» de la fila deja la pantalla en LECTURA con ?editar=1: hay que tocar «Editar» OTRA VEZ";
    problemas.push("🔴 llegar con ?editar=1 desde la lista aterriza en LECTURA (pendiente): el formulario NO abre solo");
    await toque(boton(page, /^Editar$/i), "Editar (segunda vez)");
    abrio = await esperar(page, () => /editar gu[ií]a de transporte/i.test(document.body.innerText));
  }
  if (!abrio) throw new Error("el formulario nunca abrió");
  const campos = await page.evaluate(() => [...document.querySelectorAll('input[id^="cliente-"]')].filter((e) => e.getBoundingClientRect().width > 0).length);
  if (!campos) throw new Error("el formulario abrió sin campo de cliente");
  return `hasta el campo del cliente escribible${extra}`;
});

// ── 3 · DESPACHAR ────────────────────────────────────────────────────────────
// Hasta tener a la vista los campos del despacho y el botón. 🔴 NO SE APRIETA.
await tarea("despachar", async ({ page, toque, sumar }) => {
  sumar(await irALaLista(page, PENDIENTE.rotulo));
  sumar(await abrirFila(page, PENDIENTE.rotulo));
  await toque(botonDeLaFila(page, PENDIENTE.rotulo, /^Despachar$/i), "Despachar (fila)");
  if (!(await esperar(page, () => [...document.querySelectorAll("button")].some((b) => /despachar/i.test(b.textContent || "")) && /recibido por|quién recibe|placa/i.test(document.body.innerText)))) {
    throw new Error("no aparecieron los campos del despacho");
  }
  return "hasta los campos del despacho (el botón «Despachar» NO se aprieta)";
});

// ── 4 · IMPRIMIR ─────────────────────────────────────────────────────────────
await tarea("imprimir", async ({ page, toque, sumar }) => {
  sumar(await irALaLista(page, PENDIENTE.rotulo));
  sumar(await abrirFila(page, PENDIENTE.rotulo));
  const antes = page.context().pages().length;
  await toque(botonDeLaFila(page, PENDIENTE.rotulo, /^Imprimir$/i), "Imprimir");
  await page.waitForTimeout(4000);
  const medido = await page.evaluate(() => ({
    print: window.__imprimio || 0,
    blobs: window.__blobs || 0,
    iframesPdf: document.querySelectorAll('iframe[src^="blob:"]').length,
  })).catch(() => ({ print: 0, blobs: 0, iframesPdf: 0 }));
  const pestañas = page.context().pages().length - antes;
  const directo = medido.iframesPdf > 0 || (medido.blobs > 0 && pestañas > 0);
  return `${directo ? "imprime DIRECTO" : "no se detectó salida"} · PDF armado: ${medido.blobs} · iframe con el PDF: ${medido.iframesPdf} · pestañas nuevas: ${pestañas} · window.print: ${medido.print}`;
});

// ── 5 · COMPARTIR ────────────────────────────────────────────────────────────
await tarea("compartir", async ({ page, toque, sumar }) => {
  sumar(await irALaLista(page, PENDIENTE.rotulo));
  sumar(await abrirFila(page, PENDIENTE.rotulo));
  if (!(await botonDeLaFila(page, PENDIENTE.rotulo, /^Compartir$/i).count())) {
    return "⛔ no existe «Compartir» en la fila";
  }
  await toque(botonDeLaFila(page, PENDIENTE.rotulo, /^Compartir$/i), "Compartir");
  await page.waitForTimeout(5000);
  const compartio = await page.evaluate(() => window.__compartio || 0).catch(() => 0);
  return `salida: ${compartio} apertura(s) de la hoja de compartir`;
});

// ── 6 · CORREGIR UNA FACTURA DE UNA GUÍA DESPACHADA ──────────────────────────
await tarea("corregir una factura (despachada)", async ({ page, toque, sumar }) => {
  sumar(await irALaLista(page, DESPACHADA.rotulo));
  sumar(await abrirFila(page, DESPACHADA.rotulo));
  if (!(await botonDeLaFila(page, DESPACHADA.rotulo, /^Editar$/i).count())) {
    return "⛔ IMPOSIBLE desde la pantalla: una guía despachada no ofrece «Editar»";
  }
  await toque(botonDeLaFila(page, DESPACHADA.rotulo, /^Editar$/i), "Editar");
  let abrio = await esperar(page, () => /editar gu[ií]a de transporte/i.test(document.body.innerText), 12000);
  let extra = "";
  if (!abrio) {
    const enLaGuia = await page.evaluate(() => location.pathname.startsWith("/guias/"));
    if (!enLaGuia) return "⚠️ el toque se perdió: la pantalla siguió en la lista (medición inválida, repetir)";
    extra = " — 🔴 el «Editar» de la fila deja la pantalla en LECTURA: hay que tocar «Editar» OTRA VEZ";
    problemas.push("🔴 llegar con ?editar=1 desde la lista aterriza en LECTURA (despachada): el formulario NO abre solo");
    await page.waitForTimeout(1500);
    if (!(await boton(page, /^Editar$/i).count())) {
      return "⛔ IMPOSIBLE desde la pantalla: quedó en lectura y no ofrece «Editar»";
    }
    await toque(boton(page, /^Editar$/i), "Editar (segunda vez)");
    abrio = await esperar(page, () => /editar gu[ií]a de transporte/i.test(document.body.innerText));
  }
  if (!abrio) {
    const donde = await page.evaluate(() => ({
      url: location.pathname + location.search,
      botones: [...document.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().height > 0).map((b) => (b.textContent || "").trim()).filter((t) => t && t.length < 22).slice(0, 8),
    }));
    return `⛔ el formulario no abrió — quedó en ${donde.url} con ${JSON.stringify(donde.botones)}`;
  }
  const facturas = await page.evaluate(() => [...document.querySelectorAll('input[id^="facturas-"]')].filter((e) => e.getBoundingClientRect().width > 0).length);
  if (!facturas) throw new Error("el formulario abrió sin campo de facturas");
  return `hasta el campo de facturas escribible${extra}`;
});

await nav.close();
writeFileSync(`${SALIDA}/informe-toques.json`, JSON.stringify(resultados, null, 2));

console.log(`\n═══ TOQUES POR TAREA (${ETAPA}) · BASE=${BASE} ═══`);
for (const r of resultados) {
  console.log(`${String(r.toques).padStart(2)} toques · ${r.tarea}`);
  if (r.nota) console.log(`            ${r.nota}`);
}
console.log(`\ncapturas en ${SALIDA}`);
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
