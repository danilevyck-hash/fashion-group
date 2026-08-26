// ─────────────────────────────────────────────────────────────────────────────
// ¿La MUDANZA de Comisiones a Ventas movió UN SOLO NÚMERO?
//
// Comisiones es plata, así que no alcanza con "los tests pasan": se comparan las
// CELDAS RENDERIZADAS, posición por posición, entre las DOS puertas —la de
// siempre (`/comisiones`) y la nueva (`/ventas?tab=comisiones`)— con datos de
// PRODUCCIÓN:
//
//   · «Por empresa»           → 3 períodos × 6 empresas
//   · «Todas las empresas»    → la matriz consolidada, 3 períodos
//
// Se compara por POSICIÓN (fila, columna), no como conjunto: dos tablas con los
// mismos números en distinto orden NO son la misma tabla.
//
// 🩸 GOTCHAS medidos en este repo, y los tres daban verde sin haber mirado nada:
//   * hay que sembrar la COOKIE firmada y `sessionStorage.cxc_role`, y borrar
//     `Navigator.prototype.serviceWorker` ANTES de navegar;
//   * esperar "hay tabla con filas" JUSTO después del clic mide la tabla VIEJA,
//     la que sigue en pantalla mientras sale el pedido nuevo → se espera la
//     RESPUESTA del endpoint;
//   * tocar la pestaña o la empresa que YA está activa no dispara ningún pedido,
//     así que esperar una respuesta ahí CUELGA la medición.
//
// Solo lectura: nunca toca "Actualizar ahora" ni "Excel".
//
//   BASE=http://localhost:3164 node scripts/_verif-comisiones-mismos-numeros.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3164";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const COOKIE = readFileSync(process.env.COOKIE_FILE ?? "/tmp/fg-cookie.txt", "utf8").trim();

const PERIODOS = [
  { year: 2026, mes: 8 },
  { year: 2026, mes: 7 },
  { year: 2026, mes: 6 },
];
const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];

// Las dos PUERTAS a la misma pantalla.
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// Los nombres tal cual los pinta el selector (EMPRESA_KEY_TO_NAME).
const NOMBRES = {
  vistana: "Vistana International",
  fashion_wear: "Fashion Wear",
  fashion_shoes: "Fashion Shoes",
  active_shoes: "Active Shoes",
  active_wear: "Active Wear",
  joystep: "Joystep",
};

const PUERTAS = [
  { nombre: "modulo", url: "/comisiones" },
  { nombre: "pestana", url: "/ventas?tab=comisiones" },
];

/** Volcado de la tabla tal cual se ve: encabezados + celdas, por POSICIÓN. */
const LEER_TABLA = `(() => {
  const tabla = document.querySelector("table");
  if (!tabla) return null;
  const th = [...tabla.querySelectorAll("thead th")].map((e) => e.textContent.trim());
  const filas = [...tabla.querySelectorAll("tbody tr")].map((tr) =>
    [...tr.children].map((td) => td.textContent.trim()),
  );
  return { th, filas };
})()`;

/** Las TARJETAS del celular dicen los mismos números por otro camino. */
const LEER_TARJETAS = `(() => {
  const cards = [...document.querySelectorAll("[data-comision-card]")];
  return cards.map((c) => c.textContent.replace(/\\s+/g, " ").trim());
})()`;

mkdirSync(SALIDA, { recursive: true });

const navegador = await chromium.launch();

/** Abre una puerta y devuelve el volcado de los dos modos, período por período. */
async function recorrer(puerta) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
    localStorage.setItem("fg_comisiones_mode", "todas");
  });
  const page = await ctx.newPage();
  const erroresJs = [];
  page.on("pageerror", (e) => erroresJs.push(String(e.message)));

  await page.goto(`${BASE}${puerta.url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const out = { puerta: puerta.nombre, consolidado: {}, porEmpresa: {}, erroresJs };

  // ── Modo «Todas las empresas» (la matriz) ──────────────────────────────────
  for (const p of PERIODOS) {
    await elegirPeriodo(page, p);
    await page.waitForTimeout(1200);
    out.consolidado[`${p.year}-${String(p.mes).padStart(2, "0")}`] = {
      tabla: await page.evaluate(LEER_TABLA),
      tarjetas: await page.evaluate(LEER_TARJETAS),
    };
  }

  // ── Modo «Por empresa» ─────────────────────────────────────────────────────
  // 🩸 Tocar el modo que YA está activo no dispara nada: se comprueba primero.
  const botonEmpresa = page.getByRole("button", { name: "Por empresa", exact: true });
  if ((await botonEmpresa.getAttribute("aria-current")) !== "page") {
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/ventas/comisiones?"), { timeout: 30000 }).catch(() => null),
      botonEmpresa.click(),
    ]);
  }
  await page.waitForTimeout(1200);

  for (const p of PERIODOS) {
    await elegirPeriodo(page, p);
    for (const emp of EMPRESAS) {
      await elegirEmpresa(page, emp);
      await page.waitForTimeout(900);
      out.porEmpresa[`${p.year}-${String(p.mes).padStart(2, "0")}|${emp}`] = {
        tabla: await page.evaluate(LEER_TABLA),
        tarjetas: await page.evaluate(LEER_TARJETAS),
      };
    }
  }

  await ctx.close();
  return out;
}

async function elegirPeriodo(page, p) {
  // El control es UN botón que dice "Julio 2026" (aria-label "Período: …") y
  // abre un panel con el año en stepper y los 12 meses en grilla, cada uno con
  // `aria-label` de nombre completo.
  const etiqueta = `Período: ${MESES[p.mes - 1]} ${p.year}`;
  // 🩸 NO vale `button[aria-haspopup="dialog"]` a secas: la pantalla tiene TRES
  // (los dos «Cómo se calcula» y el del período), y `.first()` agarra el de
  // Criterios — se abre un popover que no tiene año ni meses y la medición muere
  // por timeout culpando al período. Se ancla al `aria-label`, que es propio.
  const abierto = page.locator('button[aria-label^="Período:"]').first();
  const actual = (await abierto.getAttribute("aria-label")) ?? "";
  if (actual === etiqueta) return; // 🩸 ya está: tocarlo no dispara ningún pedido

  await abierto.click();
  await page.waitForTimeout(400);
  const panel = page.locator('div[role="dialog"]').filter({ has: page.getByRole("button", { name: "Año anterior" }) }).first();
  await panel.waitFor({ state: "visible", timeout: 15000 });

  // Año: stepper ‹ ›. Se camina hasta el año pedido.
  for (let i = 0; i < 12; i += 1) {
    const y = Number(await panel.locator("span.tabular-nums").first().textContent());
    if (y === p.year) break;
    const flecha = panel.getByRole("button", { name: y > p.year ? "Año anterior" : "Año siguiente" });
    await flecha.click();
    await page.waitForTimeout(200);
  }

  const mesBtn = panel.getByRole("button", { name: MESES[p.mes - 1], exact: true }).first();
  if (!(await mesBtn.count())) throw new Error(`no encontré el mes ${MESES[p.mes - 1]}`);
  if (await mesBtn.isDisabled()) throw new Error(`el mes ${MESES[p.mes - 1]} ${p.year} está apagado (futuro)`);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/ventas/comisiones"), { timeout: 30000 }).catch(() => null),
    mesBtn.click(),
  ]);
}

async function elegirEmpresa(page, key) {
  // Radix Select: el trigger es un combobox que muestra el NOMBRE de la empresa.
  const nombre = NOMBRES[key];
  const combo = page.getByRole("combobox").first();
  if (!(await combo.count())) throw new Error("no encontré el selector de empresa");
  const actual = (await combo.textContent())?.trim() ?? "";
  if (actual === nombre) return; // 🩸 ya activa: tocarla no dispara nada

  await combo.click();
  await page.waitForTimeout(250);
  const opcion = page.getByRole("option", { name: nombre, exact: true }).first();
  if (!(await opcion.count())) throw new Error(`no encontré la opción "${nombre}"`);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/ventas/comisiones?"), { timeout: 30000 }).catch(() => null),
    opcion.click(),
  ]);
}

const volcados = [];
for (const p of PUERTAS) {
  console.error(`— recorriendo ${p.nombre} (${p.url}) …`);
  volcados.push(await recorrer(p));
}
await navegador.close();

writeFileSync(path.join(SALIDA, "comisiones-volcado-puertas.json"), JSON.stringify(volcados, null, 2));

// ── Comparación por POSICIÓN ─────────────────────────────────────────────────
const [A, B] = volcados;
let celdas = 0;
const distintas = [];

const comparar = (etiqueta, x, y) => {
  if (!x || !y) { distintas.push(`${etiqueta}: una de las dos puertas no dibujó tabla`); return; }
  const filasX = x.tabla?.filas ?? [];
  const filasY = y.tabla?.filas ?? [];
  if (filasX.length !== filasY.length) distintas.push(`${etiqueta}: ${filasX.length} filas vs ${filasY.length}`);
  const n = Math.max(filasX.length, filasY.length);
  for (let i = 0; i < n; i += 1) {
    const fx = filasX[i] ?? [];
    const fy = filasY[i] ?? [];
    const m = Math.max(fx.length, fy.length);
    for (let j = 0; j < m; j += 1) {
      celdas += 1;
      if (fx[j] !== fy[j]) distintas.push(`${etiqueta} [${i}][${j}]: "${fx[j]}" ≠ "${fy[j]}"`);
    }
  }
  const thX = (x.tabla?.th ?? []).join("|");
  const thY = (y.tabla?.th ?? []).join("|");
  if (thX !== thY) distintas.push(`${etiqueta} encabezados: "${thX}" ≠ "${thY}"`);
};

for (const k of Object.keys(A.consolidado)) comparar(`matriz ${k}`, A.consolidado[k], B.consolidado[k]);
for (const k of Object.keys(A.porEmpresa)) comparar(`empresa ${k}`, A.porEmpresa[k], B.porEmpresa[k]);

console.error("\n════════════════════════════════════════════════════════════");
console.error(`CELDAS COMPARADAS: ${celdas}`);
console.error(`DIFERENCIAS:       ${distintas.length}`);
for (const d of distintas.slice(0, 40)) console.error("  🔴 " + d);
for (const v of volcados) {
  if (v.erroresJs.length) console.error(`  ⚠️ errores JS en ${v.puerta}: ${v.erroresJs.slice(0, 3).join(" | ")}`);
}
console.error("════════════════════════════════════════════════════════════");

if (celdas === 0) { console.error("🔴 0 celdas comparadas — la medición no midió nada."); process.exit(2); }
process.exit(distintas.length === 0 ? 0 : 1);
