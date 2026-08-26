// Medición de VACACIONES en los tres anchos: 390 · 834 · 1440 (más 1024, el
// iPad acostado, que es donde este repo ya se quemó dos veces).
//
// Qué mide:
//   1. `/asistencia?tab=vacaciones` — la pestaña nueva: el formulario con el
//      interruptor en la MISMA fila de las fechas, y la lista cargada.
//   2. La misma pestaña con el interruptor MARCADO (cambia la línea gris).
//   3. `/asistencia?tab=reporte` con el detalle abierto: el renglón que dice
//      «Vacaciones (ya pagadas)» y las marcas ignoradas con su «(no cuenta)».
//   4. `/asistencia?tab=planilla` con el aviso ámbar de lo que NO se pagó.
//
// Y en las cuatro: ARRASTRE de página · RECORTES · blancos táctiles <44 px ·
// textos <12 px.
//
// 🔑 EL ANCHO QUE DECIDE ES EL ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// 🩸 LA TABLA `asistencia_vacaciones` TODAVÍA NO EXISTE EN PRODUCCIÓN (la DDL
// la corre Daniel a mano), así que sin ayuda la pantalla —correctamente— no
// tiene nada que mostrar y no habría nada que medir. Se INTERCEPTAN las
// respuestas de `/api/asistencia/vacaciones`, `/reporte` y `/planilla` y se les
// inyecta UNA vacación con la forma EXACTA que va a tener. Los datos siguen
// siendo los de producción y los componentes que se miden son los REALES.
//
// 🔴 NO SE ESCRIBE NADA: el navegador ABORTA cualquier pedido que no sea GET.
// Medir no puede depender de que nadie toque un botón por accidente.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`,
// `delete Navigator.prototype.serviceWorker` antes de navegar, la pestaña vive
// en la URL (`?tab=`), esta app NO tiene <main> (el primer
// `div[class*="transition-"]` es un overlay VACÍO: mediría 0 en todo), y los
// rótulos llevan `uppercase` POR CSS — `innerText` los devuelve en mayúsculas.
//
//   npm run build && npx next start -p 3471
//   BASE=http://localhost:3471 node scripts/_medir-vacaciones-anchos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3471";
/**
 * 🔴 EL BASELINE. Con `SOLO_PANTALLA=1` no se inyecta nada y no se exige ningún
 * contenido nuevo: se miden SOLO el Reporte y la Planilla tal como están, para
 * poder correr EL MISMO ARCHIVO contra `origin/main` y comparar recortes y
 * textos chicos. Dos scripts distintos no comparan nada.
 */
const SOLO_PANTALLA = process.env.SOLO_PANTALLA === "1";
const OUT = process.env.OUT ?? "/tmp/asistencia-vacaciones";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPadAcostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

const CODIGO = "29";
const NOMBRE = "ELOYN MENDOZA";
const DESDE = "2026-07-16";
const HASTA = "2026-08-13";
const AVISO =
  "1 vacación marcada como «ya se le pagó»: esos días NO se pagaron en este cuadro. "
  + `${NOMBRE} · 16 jul 2026 → 13 ago 2026 · 5 días · $194.80`;

function cookieDeSesion() {
  // 🩸 La cookie se FIRMA acá, no se toma de un archivo compartido: `/tmp` lo
  // usan varios scripts a la vez y una cookie de otra corrida deja la medición
  // en la pantalla de login — con TODO en cero y en verde si nadie lo mira.
  // Con `COOKIE_FILE` se puede pasar una a propósito.
  const propia = process.env.COOKIE_FILE;
  if (propia && existsSync(propia)) return readFileSync(propia, "utf8").trim();
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "Daniel", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
const COOKIE = cookieDeSesion();

const MEDIR = () => {
  const raiz = [...document.querySelectorAll('div[class*="transition-"]')]
    .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
    ?? document.body;
  const arrastre = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const recortados = [];
  const tactiles = [];
  const textosChicos = [];
  const zonas = [raiz, ...document.querySelectorAll("body > div.fixed.inset-0")];
  for (const zona of zonas) {
    for (const el of zona.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      const ox = cs.overflowX;
      // `auto`/`scroll` es un scroller DECLARADO: se arrastra, no es un recorte.
      if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
        recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 60)}`, px: el.scrollWidth - el.clientWidth });
      }
      // 🔑 Un checkbox de 16 px DENTRO de una etiqueta de 44 cumple la regla:
      // lo que se toca es la etiqueta entera. Contarlo marcaría en rojo el
      // patrón de la casa (ya pasó en la medición de Metas).
      if (el.matches("button, a[href], select, textarea, [role=button], input:not([type=checkbox]):not([type=radio])")
          && r.height < 43.5) {
        tactiles.push({
          el: `${el.tagName}[${el.getAttribute("type") ?? ""}]`,
          alto: Math.round(r.height * 10) / 10,
          txt: (el.textContent ?? "").trim().slice(0, 28),
        });
      }
      if (el.children.length === 0 && (el.textContent ?? "").trim()) {
        const fs = parseFloat(cs.fontSize);
        if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
      }
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
};

/** Lo que este PR cambió, leído del DOM. */
// ⚠️ Recibe el nombre por ARGUMENTO: la función se serializa y se ejecuta en el
// navegador, donde las constantes de este archivo no existen.
const LEER = (NOMBRE) => {
  const txt = (document.body.textContent ?? "").replace(/\s+/g, " ");
  const caja = [...document.querySelectorAll("div")]
    .find((d) => /Ya se le pagó/.test(d.textContent ?? "") && d.getBoundingClientRect().height > 0);
  return {
    // Pestaña
    diceYaSeLePago: txt.includes("Ya se le pagó"),
    efectoSePagan: txt.includes("Se le pagan estos días."),
    efectoNoSePagan: txt.includes("No se le pagan estos días"),
    filaCargada: txt.includes("16 jul 2026 → 13 ago 2026"),
    // ⛔ Una vacación son cuatro cosas: no hay nota ni motivo.
    pideNota: /\bNota\b/.test(txt),
    pideMotivo: /\bMotivo\b/.test(txt),
    altoCaja: caja ? Math.round(caja.getBoundingClientRect().height) : 0,
    // Reporte
    diaDiceVacaciones: /Vacaciones \(ya pagadas\)/.test(txt),
    diceNoCuenta: txt.includes("no cuenta"),
    diceAusenciaEnEseDia: /Ausencia justificada — Vacaciones/.test(txt),
    // Planilla
    avisoAmbar: txt.includes("esos días NO se pagaron en este cuadro"),
    avisoConNombre: txt.includes(NOMBRE),
    avisoConRango: txt.includes("16 jul 2026 → 13 ago 2026"),
    avisoConMonto: txt.includes("$194.80"),
  };
};

/** El selector de período de la Planilla, leído del DOM. */
const LEER_PLANILLA = () => {
  const btn = (t) => [...document.querySelectorAll("button")]
    .some((b) => (b.textContent ?? "").trim() === t);
  const manuales = [...document.querySelectorAll('input[placeholder="por quincena"]')];
  return {
    // ⛔ El modo «Quincena» se retiró: con una sola opción, un segmentado no es
    // una elección.
    hayBotonQuincena: btn("Quincena"),
    hayBotonRango: btn("Rango de fechas"),
    camposDeFecha: document.querySelectorAll('input[type="date"]').length,
    desde: document.querySelector('input[aria-label="Desde"]')?.value ?? "",
    hasta: document.querySelector('input[aria-label="Hasta"]')?.value ?? "",
    manualesApagados: manuales.length,
    todosApagados: manuales.length > 0 && manuales.every((i) => i.disabled),
    dicePorQueApagados: (document.body.textContent ?? "")
      .includes("Los montos a mano se guardan por quincena"),
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});

// 🔴 NADA QUE NO SEA GET SALE DE ACÁ. No se escribe una fila.
let escriturasBloqueadas = 0;
await ctx.route("**/*", async (route) => {
  if (route.request().method() !== "GET") { escriturasBloqueadas += 1; return route.abort(); }
  return route.fallback();
});

// ── La pestaña: una vacación con la forma exacta que va a tener ─────────────
if (!SOLO_PANTALLA) await ctx.route("**/api/asistencia/vacaciones*", async (route) => {
  const res = await route.fetch();
  const d = await res.json().catch(() => null);
  const personas = d?.personas?.length
    ? d.personas
    : [{ codigo: CODIGO, nombre: NOMBRE, etiqueta: NOMBRE, configurado: true }];
  return route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      vacaciones: [{
        id: "simulada", empleado_codigo: CODIGO, desde: DESDE, hasta: HASTA,
        ya_pagadas: false, registrado_por: "Daniel",
      }],
      personas, faltaMigracion: false, puedeCargar: true, avisoMigracion: null,
    }),
  });
});

// ── El reporte: un día de vacaciones MARCADO y con marcas ignoradas ────────
if (!SOLO_PANTALLA) await ctx.route("**/api/asistencia/reporte*", async (route) => {
  const res = await route.fetch();
  const d = await res.json().catch(() => null);
  if (!d?.personas?.length) return route.fulfill({ response: res });

  const p = d.personas[0];
  const dia = p.dias.find((x) => x.marcas.length >= 2) ?? p.dias[0];
  if (dia) {
    dia.vacacion = { yaPagadas: true, marcasIgnoradas: ["08:47:00", "12:00:00", "12:30:00", "18:30:00"] };
    dia.marcas = [];
    dia.marcasIds = [];
    dia.entrada = null; dia.salida = null;
    dia.tardeMin = 0; dia.extraMin = 0; dia.trabajadoMin = 0;
    dia.excesoAlmuerzoMin = 0; dia.salidaTempranaMin = 0;
    dia.ausente = false; dia.revisar = false; dia.justificado = null; dia.permiso = null;
    p.resumen.diasVacaciones = 1;
    p.resumen.diasVacacionesYaPagadas = 1;
    d.__persona = p.nombre ?? p.codigo;
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
});

// ── La planilla: el aviso ámbar de lo que NO se pagó ───────────────────────
if (!SOLO_PANTALLA) await ctx.route("**/api/asistencia/planilla*", async (route) => {
  const res = await route.fetch();
  const d = await res.json().catch(() => null);
  if (!d?.avisos) return route.fulfill({ response: res });
  d.avisos.vacacionesNoPagadas = [{
    codigo: CODIGO, etiqueta: NOMBRE,
    rangos: [{ desde: DESDE, hasta: HASTA }], dias: 5, monto: 194.8,
  }];
  d.avisos.avisoVacacionesNoPagadas = AVISO;
  d.avisos.faltaMigracionVacaciones = null;
  const l = d.lineas?.find((x) => x.dinero);
  if (l) {
    l.dinero.vacacionesYaPagadas = 194.8;
    l.dinero.ausencias = Math.round((l.dinero.ausencias + 194.8) * 100) / 100;
    l.horas.vacacionesYaPagadasDias = 5;
    l.horas.vacacionesYaPagadasMin = 2400;
    l.horas.vacacionesDias = 5;
    d.__lineaConVacacion = l.etiqueta;
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
});

const page = await ctx.newPage();

// 🔴 Si la sesión no entra, la pantalla es el LOGIN y todo mide cero — el peor
// resultado posible es un verde sin haber mirado nada.
await page.goto(`${BASE}/asistencia?tab=planilla`, { waitUntil: "networkidle", timeout: 180_000 });
if (/\/(\?|$)/.test(new URL(page.url()).pathname + "/")) { /* noop */ }
if (!page.url().includes("/asistencia")) {
  console.error(`🔴 la sesión no entró: quedé en ${page.url()}`);
  await browser.close();
  process.exit(1);
}

const resultados = {};
const problemas = [];

for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });
  const paso = {};

  // 1 ── La pestaña, con el interruptor SIN marcar. (No existe en el baseline.)
  if (!SOLO_PANTALLA) {
  await page.goto(`${BASE}/asistencia?tab=vacaciones`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(2500);
  paso.pestana = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER, NOMBRE)) };
  await page.screenshot({ path: `${OUT}/pestana-${a.w}.png`, fullPage: true });

  // 2 ── El interruptor del formulario, MARCADO.
  await page.locator('input[type=checkbox]').first().check({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(500);
  paso.pestanaMarcada = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER, NOMBRE)) };
  await page.screenshot({ path: `${OUT}/pestana-marcada-${a.w}.png`, fullPage: true });
  }

  // 3 ── El reporte, con el detalle abierto.
  await page.goto(`${BASE}/asistencia?tab=reporte`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(3500);
  await page.locator("table").first().locator("tbody > tr").first()
    .click({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  paso.reporte = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER, NOMBRE)) };
  await page.screenshot({ path: `${OUT}/reporte-${a.w}.png`, fullPage: true });

  // 4 ── La planilla: el aviso ámbar y el selector de fechas (sin «Quincena»).
  await page.goto(`${BASE}/asistencia?tab=planilla`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(4000);
  paso.planilla = {
    ...(await page.evaluate(MEDIR)),
    ...(await page.evaluate(LEER, NOMBRE)),
    ...(await page.evaluate(LEER_PLANILLA)),
  };
  await page.screenshot({ path: `${OUT}/planilla-${a.w}.png`, fullPage: true });

  // 5 ── El mismo cuadro pedido por un rango que NO es una quincena: los
  // montos a mano quedan apagados y la pantalla dice por qué.
  await page.goto(`${BASE}/asistencia?tab=planilla`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(2500);
  await page.getByLabel("Desde").fill("2026-07-25").catch(() => {});
  await page.waitForTimeout(3500);
  paso.planillaRangoLibre = {
    ...(await page.evaluate(MEDIR)),
    ...(await page.evaluate(LEER, NOMBRE)),
    ...(await page.evaluate(LEER_PLANILLA)),
  };
  await page.screenshot({ path: `${OUT}/planilla-rango-${a.w}.png`, fullPage: true });

  resultados[a.nombre] = paso;

  for (const [nombre, m] of Object.entries(paso)) {
    if (m.arrastre > 0) problemas.push(`${a.nombre}/${nombre}: arrastre ${m.arrastre}px`);
    if (m.recortados.length) problemas.push(`${a.nombre}/${nombre}: ${m.recortados.length} recortados`);
    if (m.tactiles.length) problemas.push(`${a.nombre}/${nombre}: ${m.tactiles.length} táctiles <44px`);
    if (m.textosChicos.length) problemas.push(`${a.nombre}/${nombre}: ${m.textosChicos.length} textos <12px`);
  }

  // 🔴 El script FALLA si no encuentra lo que vino a medir: medir cero y darlo
  // por bueno es el peor resultado posible. En el baseline no hay nada nuevo
  // que exigir: solo se miden las cajas.
  if (SOLO_PANTALLA) continue;
  if (!paso.pestana.diceYaSeLePago) problemas.push(`${a.nombre}: NO se ve el interruptor`);
  if (!paso.pestana.efectoSePagan) problemas.push(`${a.nombre}: falta la línea «Se le pagan estos días.»`);
  if (!paso.pestanaMarcada.efectoNoSePagan) problemas.push(`${a.nombre}: marcado NO cambia la línea`);
  if (!paso.pestana.filaCargada) problemas.push(`${a.nombre}: la fila cargada no se ve`);
  if (paso.pestana.pideNota || paso.pestana.pideMotivo) problemas.push(`${a.nombre}: la pestaña pide nota/motivo`);
  if (!paso.reporte.diaDiceVacaciones) problemas.push(`${a.nombre}: el día NO dice «Vacaciones (ya pagadas)»`);
  if (!paso.reporte.diceNoCuenta) problemas.push(`${a.nombre}: no se muestran las marcas ignoradas`);
  if (paso.reporte.diceAusenciaEnEseDia) problemas.push(`${a.nombre}: 🔴 el día dice AUSENCIA`);
  if (!paso.planilla.avisoAmbar) problemas.push(`${a.nombre}: falta el aviso ámbar`);
  if (!(paso.planilla.avisoConNombre && paso.planilla.avisoConRango && paso.planilla.avisoConMonto)) {
    problemas.push(`${a.nombre}: 🔴 el aviso no trae nombre + rango + monto`);
  }
  // ── El selector: un solo modo, el rango ──────────────────────────────────
  if (paso.planilla.hayBotonQuincena || paso.planilla.hayBotonRango) {
    problemas.push(`${a.nombre}: 🔴 volvió el control de modo de período`);
  }
  if (paso.planilla.camposDeFecha !== 2) {
    problemas.push(`${a.nombre}: se esperaban 2 campos de fecha, hay ${paso.planilla.camposDeFecha}`);
  }
  if (paso.planillaRangoLibre.desde !== "2026-07-25") {
    problemas.push(`${a.nombre}: el rango no se movió (${paso.planillaRangoLibre.desde})`);
  }
  if (!paso.planillaRangoLibre.todosApagados) {
    problemas.push(`${a.nombre}: 🔴 los montos a mano NO quedaron bloqueados en un rango libre`);
  }
  if (!paso.planillaRangoLibre.dicePorQueApagados) {
    problemas.push(`${a.nombre}: 🔴 no se dice por qué los montos a mano están apagados`);
  }
}

console.log(JSON.stringify({ resultados, escriturasBloqueadas, problemas }, null, 1));
console.log(`\nescrituras bloqueadas: ${escriturasBloqueadas}`);
console.log(problemas.length ? `\n🔴 ${problemas.length} problemas:\n- ${problemas.join("\n- ")}` : "\n🟢 sin problemas");
await browser.close();
process.exit(problemas.length ? 1 : 0);
