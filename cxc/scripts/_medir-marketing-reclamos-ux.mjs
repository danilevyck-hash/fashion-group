// Medición REAL en navegador de los arreglos de flujo de Marketing y Reclamos
// (24-ago-2026), en los 4 anchos de la casa: 390 · 834 · 1024 · 1440.
//
// SOLO LECTURA: no se guarda, no se borra, no se envía un correo. Se navega,
// se abre lo que hay que mirar y se mide.
//
// Qué mide en cada pantalla:
//   A. ARRASTRE de la página (documentElement.scrollWidth − innerWidth).
//   B. RECORTADOS — contenido fuera de su caja sin scroller propio.
//   C. TÁCTILES < 44 px.
//   D. TEXTOS < 12 px.
// Y VERIFICA que lo arreglado esté EN PANTALLA (si no aparece, FALLA):
//   · los 3 botones de la factura, con "Eliminar definitivamente";
//   · la X de borrar foto VISIBLE sin pasar el mouse;
//   · "Eliminar definitivamente" del proyecto;
//   · el desplegable "Marca" del reporte por proyecto CON marcas;
//   · UNA sola línea de métricas en Mobiliario y UN solo "Descargar Excel";
//   · la ventana de "Enviar al proveedor" con la libreta abierta.
//
// 🔴 El script FALLA si no encuentra lo que va a medir: medir cero y dar verde
// sin haber mirado nada es el peor resultado posible.
//
// GOTCHAS de este repo (no tocar sin leer):
//   * Cookie de sesión VIVA o todo redirige al login.
//   * Y ADEMÁS sessionStorage.cxc_role: useAuth lo lee de AHÍ.
//   * Y `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
//   BASE=http://localhost:3477 node scripts/_medir-marketing-reclamos-ux.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3477";
const ETIQUETA = process.env.ETIQUETA ?? "PR";
const COOKIE = readFileSync(process.env.COOKIE_FILE ?? "/tmp/fg-cookie.txt", "utf8").trim();
// Proyecto REAL con 10 facturas y 4 fotos (el peor caso disponible).
const PROY = process.env.PROY ?? "f66c2385-e69d-4d90-82d5-6f694379464e";
const RUTA_PERIODO = process.env.RUTA_PERIODO ?? "/marketing/calvin-klein/periodo-2026";
const EMPRESA_RECLAMOS = process.env.EMPRESA_RECLAMOS ?? "Fashion Wear";

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1194 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

const fallos = [];
const hallazgos = []; // táctiles/recortes, para comparar PR vs main

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { sessionStorage.setItem("fg_modules", JSON.stringify(["marketing", "reclamos"])); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});
const page = await ctx.newPage();

// 🩸 La libreta de contactos está VACÍA en producción, y sin una fila no existe
// el tacho que hay que medir. Se responde SÓLO ese GET con un contacto de
// mentira: el resto de la pantalla es producción de verdad, no se escribe nada,
// y el DELETE nunca se dispara (la medición no toca el tacho).
await ctx.route("**/api/reclamos/contactos-email", async (route) => {
  if (route.request().method() !== "GET") return route.abort();
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([
      { id: "medicion-1", email: "compras@proveedor-de-prueba.com", nombre: "Contacto de medición", created_at: "2026-01-01" },
    ]),
  });
});

async function medir(sel, etiqueta, ancho) {
  const m = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const desbordes = [], chicos = [], tactiles = [];
    for (const n of el.querySelectorAll("*")) {
      const b = n.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const cs = getComputedStyle(n);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      if (b.right > r.right + 1 || b.left < r.left - 1) {
        desbordes.push(`${n.tagName}.${String(n.className).slice(0, 40)}`);
      }
      const fs = parseFloat(cs.fontSize);
      if (n.children.length === 0 && n.textContent.trim() && fs < 12) {
        chicos.push(`${Math.round(fs * 10) / 10}px "${n.textContent.trim().slice(0, 28)}"`);
      }
      if (["BUTTON", "INPUT", "A", "SELECT", "TEXTAREA"].includes(n.tagName) && (b.height < 44 || b.width < 44)) {
        const lbl = n.closest("label");
        const lr = lbl ? lbl.getBoundingClientRect() : null;
        if (!(lr && lr.height >= 44 && lr.width >= 44)) {
          const txt = (n.getAttribute("aria-label") || n.textContent || n.getAttribute("placeholder") || n.type || "").trim().slice(0, 26);
          tactiles.push(`${n.tagName}[${txt}] ${Math.round(b.width)}×${Math.round(b.height)}`);
        }
      }
    }
    return {
      docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      w: Math.round(r.width), h: Math.round(r.height),
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      desbordes, chicos, tactiles,
    };
  }, sel);

  if (!m) {
    fallos.push(`${etiqueta} @${ancho}: NO SE ENCONTRÓ ${sel}`);
    console.log(`  ❌ ${etiqueta}: no se encontró ${sel}`);
    return;
  }
  const arrastre = m.docScrollW - m.innerW;
  const recorte = m.scrollW - m.clientW;
  if (arrastre > 0) fallos.push(`${etiqueta} @${ancho}: arrastre ${arrastre}px`);
  if (m.desbordes.length) fallos.push(`${etiqueta} @${ancho}: hijos fuera → ${m.desbordes.slice(0, 6).join(" | ")}`);
  if (m.chicos.length) fallos.push(`${etiqueta} @${ancho}: texto <12px → ${m.chicos.slice(0, 6).join(" | ")}`);
  if (recorte > 0 || m.tactiles.length) {
    hallazgos.push(`${etiqueta} @${ancho}: recorte ${recorte} · táctiles<44 [${[...new Set(m.tactiles)].sort().join(" | ")}]`);
  }
  console.log(
    `  ${etiqueta}: ${m.w}×${m.h} · arrastre ${arrastre <= 0 ? "✅ 0" : `❌ ${arrastre}`}` +
      ` · recorte ${recorte <= 0 ? "✅ 0" : `⚠️ ${recorte}`}` +
      ` · táctil<44 ${m.tactiles.length === 0 ? "✅ 0" : `⚠️ ${m.tactiles.length}`}` +
      ` · texto<12px ${m.chicos.length === 0 ? "✅ 0" : `❌ ${m.chicos.length}`}`,
  );
}

/** Exige que un texto/selector esté en pantalla; si no, el script FALLA. */
async function exigir(cond, descripcion, ancho) {
  const ok = await cond();
  if (!ok) {
    fallos.push(`@${ancho}: NO se encontró en pantalla → ${descripcion}`);
    console.log(`     ❌ ${descripcion}`);
  } else {
    console.log(`     ✅ ${descripcion}`);
  }
  return ok;
}

const texto = () => page.evaluate(() => document.body.innerText);
const cuantos = (frag) =>
  page.evaluate((f) => [...document.querySelectorAll("button, a")].filter((b) => (b.textContent || "").includes(f)).length, frag);

console.log(`\n${"═".repeat(78)}\n  MEDICIÓN — ${ETIQUETA} — ${BASE}\n${"═".repeat(78)}`);

for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });
  console.log(`\n${"─".repeat(78)}\n${a.nombre} (${a.w}px)\n${"─".repeat(78)}`);

  // ── 1 y 2. Ficha del proyecto: facturas + botón de borrado definitivo ────
  await page.goto(`${BASE}${RUTA_PERIODO}?proyecto=${PROY}&pt=facturas`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  let hayFicha = true;
  try {
    await page.waitForSelector("text=Registrar factura", { timeout: 45_000 });
  } catch {
    try { await page.waitForSelector("text=Facturas", { timeout: 15_000 }); }
    catch { hayFicha = false; }
  }
  await page.waitForTimeout(700);
  console.log("\n  · Ficha del proyecto · Facturas");
  if (!hayFicha) {
    fallos.push(`ficha @${a.w}: el overlay del proyecto NO abrió — pantalla: ${(await texto()).slice(0, 200).replace(/\n+/g, " · ")}`);
    console.log("     ❌ el overlay no abrió");
  } else {
    await exigir(async () => (await cuantos("Editar")) >= 1, "botón «Editar» de factura", a.w);
    await exigir(async () => (await cuantos("Anular")) >= 1, "botón «Anular» de factura", a.w);
    await exigir(async () => (await cuantos("Eliminar definitivamente")) >= 1, "«Eliminar definitivamente» (proyecto y/o factura)", a.w);
    // Ni un solo botón que diga sólo "Eliminar" a secas en la ficha.
    const pelados = await page.evaluate(() =>
      [...document.querySelectorAll("button")].filter((b) => (b.textContent || "").trim() === "Eliminar").length);
    if (pelados > 0) fallos.push(`ficha @${a.w}: ${pelados} botón(es) dicen sólo «Eliminar»`);
    console.log(`     ${pelados === 0 ? "✅" : "❌"} ningún botón dice sólo «Eliminar» (${pelados})`);
    await medir("div.max-h-\\[95vh\\], div[class*='max-h-[95vh]']", "ficha del proyecto", a.w);
  }

  // ── 5. Fotos: la X tiene que VERSE sin pasar el mouse ────────────────────
  await page.goto(`${BASE}${RUTA_PERIODO}?proyecto=${PROY}&pt=fotos`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  try { await page.waitForSelector('button[aria-label="Eliminar foto"]', { timeout: 45_000 }); } catch {}
  await page.waitForTimeout(700);
  console.log("\n  · Ficha del proyecto · Fotos");
  const xs = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('button[aria-label="Eliminar foto"]')];
    return bs.map((b) => {
      const r = b.getBoundingClientRect();
      return { op: getComputedStyle(b).opacity, w: Math.round(r.width), h: Math.round(r.height) };
    });
  });
  if (xs.length === 0) {
    fallos.push(`fotos @${a.w}: no hay ni una X de borrar foto (el proyecto ${PROY} debería tener fotos)`);
    console.log("     ❌ ninguna X de borrar foto");
  } else {
    const invisibles = xs.filter((x) => Number(x.op) === 0).length;
    const chicas = xs.filter((x) => x.w < 44 || x.h < 44).length;
    // 🔑 La X se muestra SIEMPRE por debajo de `sm` (640 px) —que es donde vive
    // el dedo— y se sigue revelando por hover de 640 para arriba, que es lo que
    // ya hacía y nadie pidió cambiar. Exigirla visible sin hover a 1440 sería
    // medir otra cosa: el mouse existe ahí.
    const tactil = a.w < 640;
    if (tactil && invisibles > 0) fallos.push(`fotos @${a.w}: ${invisibles}/${xs.length} X invisibles sin hover EN PANTALLA TÁCTIL`);
    if (chicas > 0) fallos.push(`fotos @${a.w}: ${chicas}/${xs.length} X por debajo de 44 px (${xs[0].w}×${xs[0].h})`);
    console.log(
      `     ${tactil ? (invisibles === 0 ? "✅ visibles sin hover (táctil)" : `❌ ${invisibles} invisibles`) : `· ${xs.length - invisibles}/${xs.length} visibles sin hover (≥640 px: se revelan por hover, como siempre)`}` +
        ` · ${chicas === 0 ? "✅" : "❌"} ${xs[0].w}×${xs[0].h} px`,
    );
  }

  // ── 4. Reporte por proyecto: el filtro «Marca» ───────────────────────────
  await page.goto(`${BASE}/marketing?vista=reportes&rep=proyecto`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  try { await page.waitForSelector("text=Reportes de gastos", { timeout: 60_000 }); } catch {}
  // Se espera a que el desplegable TENGA marcas: un timeout fijo hace que la
  // primera pasada (servidor frío) mida el select todavía vacío y acuse un
  // defecto que no existe.
  try {
    await page.waitForFunction(() => {
      const l = [...document.querySelectorAll("label")].find((x) => (x.textContent || "").trim().startsWith("Marca"));
      return (l?.querySelector("select")?.options.length ?? 0) > 1;
    }, { timeout: 30_000 });
  } catch {}
  await page.waitForTimeout(400);
  console.log("\n  · Reporte por proyecto");
  const opciones = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("label")];
    const l = labels.find((x) => (x.textContent || "").trim().startsWith("Marca"));
    const sel = l?.querySelector("select");
    return sel ? [...sel.options].map((o) => o.textContent.trim()) : null;
  });
  if (!opciones) {
    fallos.push(`reporte @${a.w}: no se encontró el desplegable «Marca»`);
    console.log("     ❌ no se encontró el desplegable «Marca»");
  } else if (opciones.length <= 1) {
    fallos.push(`reporte @${a.w}: el desplegable «Marca» sólo ofrece ${JSON.stringify(opciones)}`);
    console.log(`     ❌ «Marca» sólo ofrece ${JSON.stringify(opciones)}`);
  } else {
    console.log(`     ✅ «Marca» ofrece ${opciones.length} opciones: ${opciones.join(" · ")}`);
  }
  await medir("main", "reporte por proyecto", a.w);

  // ── 7 y 8. Mobiliario ────────────────────────────────────────────────────
  await page.goto(`${BASE}/marketing/mobiliario`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  try { await page.waitForSelector("text=Resumen por tienda", { timeout: 45_000 }); } catch {}
  await page.waitForTimeout(700);
  console.log("\n  · Mobiliario");
  const t = await texto();
  if (/Valor total/.test(t)) { fallos.push(`mobiliario @${a.w}: sigue diciendo «Valor total»`); console.log("     ❌ sigue diciendo «Valor total»"); }
  else console.log("     ✅ ya no dice «Valor total»");
  if (/Disponible:/.test(t)) { fallos.push(`mobiliario @${a.w}: sigue la línea «Disponible:» duplicando el mismo número`); console.log("     ❌ sigue «Disponible:»"); }
  else console.log("     ✅ ya no hay dos números idénticos en la línea");
  if (!/En bodega/.test(t)) { fallos.push(`mobiliario @${a.w}: falta la línea «En bodega»`); console.log("     ❌ falta «En bodega»"); }
  else console.log("     ✅ dice «En bodega»");
  const excels = await cuantos("Descargar Excel");
  if (excels !== 1) { fallos.push(`mobiliario @${a.w}: hay ${excels} «Descargar Excel» (tiene que haber 1)`); }
  console.log(`     ${excels === 1 ? "✅" : "❌"} «Descargar Excel» ×${excels}`);
  await medir("main", "mobiliario", a.w);

  // ── 3. Reclamos: la ventana de enviar al proveedor ───────────────────────
  // La lista de reclamos (y su botón de sobre) vive DENTRO de una empresa: la
  // portada de /reclamos es el listado de empresas. Se entra por la URL.
  await page.goto(`${BASE}/reclamos?empresa=${encodeURIComponent(EMPRESA_RECLAMOS)}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  console.log("\n  · Reclamos · Enviar al proveedor");
  let abrio = false;
  try {
    await page.waitForSelector('button[aria-label="Enviar al proveedor"]', { timeout: 90_000 });
    // `:visible` importa: la lista se dibuja DOS veces (tarjetas hasta lg,
    // tabla desde lg) y el primer sobre del DOM puede ser el de la mitad
    // escondida — el clic se quedaría esperando para siempre.
    await page.locator('button[aria-label="Enviar al proveedor"]:visible').first().click();
    await page.waitForSelector("textarea", { timeout: 30_000 });
    // Abrir la libreta: ahí viven los 4 botones del contacto.
    await page.locator("button", { hasText: "Libreta de contactos" }).first().click();
    await page.waitForSelector('button[aria-label="Borrar contacto de la libreta"]', { timeout: 20_000 });
    await page.waitForTimeout(400);
    abrio = true;
  } catch {
    fallos.push(`reclamos @${a.w}: no se pudo abrir la ventana de enviar al proveedor — pantalla: ${(await texto()).slice(0, 200).replace(/\n+/g, " · ")}`);
    console.log("     ❌ no abrió la ventana");
  }
  if (abrio) {
    const libreta = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")];
      const tacho = b.find((x) => x.getAttribute("aria-label") === "Borrar contacto de la libreta");
      const lapiz = b.find((x) => x.getAttribute("aria-label") === "Editar contacto");
      const caja = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
      return { tacho: caja(tacho), lapiz: caja(lapiz) };
    });
    if (!libreta.tacho) {
      fallos.push(`reclamos @${a.w}: la libreta no mostró ningún contacto (no se pudo medir el tacho)`);
      console.log("     ❌ la libreta no mostró contactos");
    } else {
      const ok = libreta.tacho.h >= 44 && libreta.tacho.w >= 44 && libreta.lapiz.h >= 44 && libreta.lapiz.w >= 44;
      if (!ok) fallos.push(`reclamos @${a.w}: tacho ${libreta.tacho.w}×${libreta.tacho.h}, lápiz ${libreta.lapiz.w}×${libreta.lapiz.h} (mínimo 44)`);
      console.log(`     ${ok ? "✅" : "❌"} tacho ${libreta.tacho.w}×${libreta.tacho.h} · lápiz ${libreta.lapiz.w}×${libreta.lapiz.h}`);
    }
    await medir("div.z-\\[60\\] > div, div[class*='z-[60]'] > div", "ventana enviar al proveedor", a.w);
  }
}

await browser.close();

console.log(`\n${"═".repeat(78)}`);
if (hallazgos.length) {
  console.log("RECORTES Y TÁCTILES <44 encontrados (para comparar PR vs main):");
  for (const h of hallazgos) console.log(`  · ${h}`);
  console.log("");
}
if (fallos.length) {
  console.log(`❌ ${fallos.length} FALLO(S):`);
  for (const f of fallos) console.log(`  · ${f}`);
  process.exit(1);
}
console.log("✅ 0 arrastre · 0 desbordes · 0 textos <12px · todo lo arreglado está en pantalla, en los 4 anchos.");
