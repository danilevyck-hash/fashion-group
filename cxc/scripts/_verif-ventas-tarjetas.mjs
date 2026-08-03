// Verificación en el navegador del paso de Ventas › Resumen a tarjetas (celular).
//
// Responde las tres preguntas que importan, contra el build de PRODUCCIÓN y con
// datos de producción:
//
//   1. ¿Se acabó el scroll lateral? (el censo ya lo mide; acá se confirma con la
//      tarjeta ABIERTA, que es cuando aparecen los 14 renglones).
//   2. ¿Sigue estando TODO? — se leen los 12 meses + Total + Proyección de cada
//      tarjeta en celular y se comparan CELDA POR CELDA contra la matriz del
//      ESCRITORIO a 1440 px, que no se tocó. Si un número cambió, salta acá.
//   3. ¿El detalle sigue abriendo donde se tocó?
//
// GOTCHAS heredados (no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o TODO redirige al login.
//   * Hay que sembrar sessionStorage (`cxc_role`): useAuth lo lee de AHÍ.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar
//     (bloquear el SW mata la hidratación).
//
// Solo lectura: no guarda, no borra, no envía nada.
//
//   node scripts/_verif-ventas-tarjetas.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3167";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();

async function abrirVentas(width, height) {
  const ctx = await navegador.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    ...(width < 900 ? { hasTouch: true } : {}),
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/ventas?tab=resumen`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  return { ctx, page };
}

const desborde = `(() => {
  let peor = 0, quien = null;
  for (const el of document.querySelectorAll("*")) {
    const s = el.scrollWidth - el.clientWidth;
    if (s <= 1) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "auto" && cs.overflowX !== "scroll") continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (s > peor) { peor = s; quien = el.tagName + "." + String(el.className).slice(0, 70); }
  }
  return { peor: Math.round(peor), quien };
})()`;

// ── 1 + 3. Celular: abrir todas las tarjetas y leer sus renglones ────────────

const { ctx: ctxM, page: movil } = await abrirVentas(390, 844);

const cerrado = await movil.evaluate(desborde);

// Abrir TODAS las tarjetas, una por una, y quedarse con sus renglones.
const tarjetas = await movil.locator("article").locator("visible=true");
const nTarjetas = await tarjetas.count();
const celular = {};
let peorAbierta = 0;
let peorAbiertaQuien = null;

for (let i = 0; i < nTarjetas; i++) {
  const art = tarjetas.nth(i);
  const encabezado = art.locator("button").first();
  await encabezado.click({ timeout: 8000 }).catch(() => {});
  await movil.waitForTimeout(500);

  const d = await movil.evaluate(desborde);
  if (d.peor > peorAbierta) { peorAbierta = d.peor; peorAbiertaQuien = d.quien; }

  const datos = await art.evaluate((el) => {
    const nombre = el.querySelector("span.truncate")?.textContent?.trim() ?? "?";
    const renglones = [...el.querySelectorAll("li")].map((li) => {
      const spans = [...li.querySelectorAll("span")];
      const etiqueta = spans[0]?.textContent?.trim() ?? "";
      const mono = li.querySelector("span.font-mono");
      return { etiqueta, valor: mono?.textContent?.trim() ?? "" };
    });
    return { nombre, renglones };
  });
  if (datos.renglones.length) celular[datos.nombre] = datos.renglones;

  if (i === 0) {
    await movil.screenshot({ path: path.join(SALIDA, "tarjetas-abierta-390.png"), fullPage: true });
    // El detalle: tocar el renglón del primer período.
    const periodo = art.locator("button[data-celda]").first();
    if (await periodo.count()) {
      await periodo.click({ timeout: 8000 }).catch(() => {});
      await movil.waitForTimeout(600);
      const hayDetalle = await movil.locator('[data-testid="fila-detalle"]').count();
      const dDet = await movil.evaluate(desborde);
      console.error(`detalle abierto: ${hayDetalle > 0 ? "SÍ" : "NO"} · desborde con detalle: ${dDet.peor} px`);
      await movil.screenshot({ path: path.join(SALIDA, "tarjetas-detalle-390.png"), fullPage: true });
      const cerrar = movil.locator('button[aria-label="Cerrar detalle"]').first();
      if (await cerrar.count()) await cerrar.click().catch(() => {});
      await movil.waitForTimeout(400);
    }
  }
  await encabezado.click({ timeout: 8000 }).catch(() => {});
  await movil.waitForTimeout(250);
}
await ctxM.close();

// ── 2. Escritorio: la matriz intacta, fila por fila ─────────────────────────

const { ctx: ctxD, page: escritorio } = await abrirVentas(1440, 900);
const filasDesktop = await escritorio.evaluate(() => {
  const out = {};
  const tabla = [...document.querySelectorAll("table")].find(
    (t) => t.offsetParent !== null && t.querySelectorAll("thead th").length > 10,
  );
  if (!tabla) return out;
  const heads = [...tabla.querySelectorAll("thead th")].map((h) => h.textContent.trim());
  for (const tr of tabla.querySelectorAll("tbody tr")) {
    const celdas = [...tr.children];
    if (celdas.length < 3) continue;
    // El nombre puede venir pegado a la nota de mayoreo (Multifashion), sin
    // salto de línea. Se corta en el primer "incluye".
    const nombre = celdas[0].textContent.trim().split("\n")[0].split("incluye")[0].trim();
    const vals = celdas.slice(1).map((td, i) => ({
      etiqueta: heads[i + 1] ?? String(i),
      valor: (td.querySelector(".font-mono, span")?.textContent ?? td.textContent).trim().split("\n")[0].trim(),
    }));
    out[nombre] = vals;
  }
  return out;
});
await escritorio.screenshot({ path: path.join(SALIDA, "tarjetas-escritorio-1440.png") });
await ctxD.close();
await navegador.close();

// ── Veredicto ───────────────────────────────────────────────────────────────

console.error(`\nSCROLL LATERAL @390px`);
console.error(`  tarjetas cerradas: ${cerrado.peor} px  ${cerrado.quien ?? ""}`);
console.error(`  con una tarjeta ABIERTA: ${peorAbierta} px  ${peorAbiertaQuien ?? ""}`);

console.error(`\nPARIDAD DE NÚMEROS — celular contra la matriz del escritorio`);

/**
 * El texto crudo de las dos vistas NO es comparable tal cual, y las dos razones
 * son de FORMATO, no de dato:
 *   · el escritorio pega el Δ al monto en la misma celda ("$3,001▼ -69%") y el
 *     celular los separa en dos elementos;
 *   · el Total y la Proyección van en formato compacto en celular ($379K) desde
 *     mucho antes de este cambio — no es algo que el paso a tarjetas introdujo.
 * Así que se compara el NÚMERO, y contra el compacto se admite el redondeo del
 * propio formato (3 cifras significativas → menos de 0,5 %).
 */
function aNumero(txt) {
  const m = String(txt).match(/-?\$?\s?([\d,]+(?:\.(\d+))?)\s*([KM])?/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const escala = m[3] === "M" ? 1e6 : m[3] === "K" ? 1e3 : 1;
  // La tolerancia sale de la PRECISIÓN QUE SE MUESTRA, no de un porcentaje al
  // ojo: "$27K" no puede distinguir nada por debajo de medio millar, así que su
  // margen es 500 y punto. Con un % fijo, un valor chico en compacto (27K sobre
  // 26.574,97 = 1,6 %) se leía como "cambió el número" siendo solo el redondeo.
  const decimales = (m[2] ?? "").length;
  const granularidad = escala / 10 ** decimales;
  return { n: n * escala, tolerancia: granularidad === 1 ? 0.005 : granularidad / 2 };
}

let comparados = 0, distintos = 0, sinPar = 0;
for (const [nombre, renglones] of Object.entries(celular)) {
  const clave = Object.keys(filasDesktop).find(
    (k) => k.toLowerCase().startsWith(nombre.toLowerCase().slice(0, 10)),
  );
  if (!clave) { console.error(`  ⚠️ ${nombre}: no lo encontré en el escritorio`); sinPar++; continue; }
  const dsk = filasDesktop[clave];
  for (const r of renglones) {
    const et = r.etiqueta.toUpperCase().slice(0, 3);
    const par = dsk.find((d) => d.etiqueta.toUpperCase().startsWith(et));
    if (!par) continue;
    const a = aNumero(r.valor), b = aNumero(par.valor);
    if (!a || !b) continue;
    comparados++;
    // Manda la lectura MENOS precisa de las dos: comparar un compacto contra un
    // exacto no puede exigir más resolución de la que el compacto tiene.
    const tolerancia = Math.max(a.tolerancia, b.tolerancia);
    if (Math.abs(a.n - b.n) > tolerancia) {
      distintos++;
      console.error(`  ✗ ${nombre} · ${r.etiqueta}: celular ${r.valor} ≠ escritorio ${par.valor}`);
    }
  }
}
console.error(`  ${comparados} celdas comparadas · ${distintos} distintas · ${sinPar} filas sin par`);
console.error(distintos === 0 && comparados > 0 ? "\n✅ ningún número cambió" : "\n⚠️ revisar");
