// ¿CAMBIÓ ALGÚN NÚMERO de Ventas › Resumen al llevar las tarjetas hasta 1440 px?
//
// Compara la MISMA pantalla en dos anchos, celda por celda: los 12 meses, el
// Total y la Proyección de cada empresa y del total del grupo.
//
// 🔑 EL ANCLA YA EXISTÍA, Y NO ES UNA CLASE DE BREAKPOINT. Cada celda de la
// matriz y cada renglón de la tarjeta llevan un `data-celda` armado con el MISMO
// `celdaKey(vista, filaId, columna)`. Sólo cambia el primer tramo: "d" en la
// matriz, "m" en las tarjetas — y TIENE que ser distinto, porque las dos formas
// conviven en el DOM y esa llave es la que dice cuál celda está abierta. Se le
// saca el prefijo y el join queda `filaId:columna`.
//
// 🩸 DOS COSAS LAS ENCONTRÓ EL CONTROL DE VACÍO, no yo. Sin él, el script habría
// impreso "0 diferencias" con cara de aprobado las dos veces:
//   1. La primera versión comparaba las llaves crudas ("d:x:3" contra "m:x:3") y
//      daba CERO celdas en común.
//   2. La segunda abría las 9 tarjetas de un saque, sin ver que el acordeón deja
//      UNA sola abierta: leía 8 celdas de 79. Ahora abre de a una, lee, y sigue.
// Por eso cero celdas es FALLA declarada, y por eso además se exige un mínimo de
// COBERTURA contra el total de la matriz: "0 diferencias sobre 8 de 79" no es un
// aprobado.
//
// LO QUE SE COMPARA ES EL VALOR, NO LA CADENA. Las dos formas ya mostraban lo
// mismo con distinto formato ANTES de este cambio (viene del #369): la tarjeta
// antepone la etiqueta del período ("Ene") porque no tiene encabezado de
// columna, y el Total del grupo va compacto ("$5.42M") donde la matriz lo pone
// entero ("$5,417,722.60"). Comparar el texto crudo marcaría eso como "cambió un
// número" siendo la misma plata. Se comparan los NÚMEROS, con la tolerancia que
// impone la precisión con la que cada lado los dibuja.
//
// GOTCHAS heredados: sembrar la cookie firmada y `sessionStorage` (si no, todo
// al login) y `delete Navigator.prototype.serviceWorker` antes de navegar.
//
// Solo lectura: los únicos clicks son en el encabezado que despliega una
// tarjeta. No se toca nada que ejecute, guarde ni sincronice.
//
//   BASE=http://localhost:3177 node scripts/_verif-resumen-ipad.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3177";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// Angosto (tarjetas) contra 1440 (matriz). 834 = iPad vertical; 1024 y 1366 = el
// mismo iPad acostado — los anchos donde antes se arrastraban 724, 534 y ~189 px.
const ANGOSTOS = [390, 834, 1024, 1366];
const REFERENCIA = 1440;

/** Lee las celdas VISIBLES por su `data-celda`, sin el prefijo de vista. */
const LEER = `(() => {
  const out = {};
  for (const el of document.querySelectorAll("[data-celda]")) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const k = el.getAttribute("data-celda").replace(/^[dm]:/, "");
    out[k] = (el.textContent ?? "").replace(/\\s+/g, " ").trim();
  }
  return out;
})()`;

/**
 * Saca los números de una celda: montos y porcentajes, en orden. La etiqueta del
 * período ("Ene") no es un número y se cae sola.
 * Cada número viene con la TOLERANCIA que impone su propia precisión: "$5.42M"
 * no distingue nada por debajo de 5.000, así que exigirle el centavo sería
 * marcar como error el redondeo con el que se dibuja.
 */
function numeros(txt) {
  if (txt == null) return null;
  const out = [];
  const re = /(▼\s*-|▲\s*\+|-|\+)?\s*(\$?)\s*(\d[\d,]*(?:\.\d+)?)\s*([KkMm])?(%?)/g;
  let m;
  while ((m = re.exec(txt)) !== null) {
    const crudo = m[3].replace(/,/g, "");
    const n = Number(crudo);
    if (!Number.isFinite(n)) continue;
    const dinero = m[2] === "$";
    const pct = m[5] === "%";
    // La tarjeta antepone la ETIQUETA del período porque no tiene encabezado de
    // columna: "Total 2026$1.09M▲ +18%". Ese 2026 es un rótulo, no una cifra —
    // sin descartarlo, la tarjeta parece tener un número más que la matriz y
    // TODAS las celdas de Total salen como diferencia.
    if (!dinero && !pct && /^(19|20)\d\d$/.test(crudo)) continue;
    const suf = (m[4] ?? "").toUpperCase();
    const mult = suf === "M" ? 1e6 : suf === "K" ? 1e3 : 1;
    const dec = (crudo.split(".")[1] ?? "").length;
    out.push({
      valor: (/-/.test(m[1] ?? "") ? -1 : 1) * n * mult,
      tol: (mult / Math.pow(10, dec)) / 2,   // medio "último dígito mostrado"
      pct,
    });
  }
  return out;
}

/**
 * Compara UNA celda. Devuelve `{ ok, nota }`.
 *
 * ⚠️ QUÉ SE COMPARA Y QUÉ NO, dicho en voz alta (una exclusión callada es la
 * misma trampa que un verificador vacío):
 *   · El MONTO principal: siempre, en las dos formas. Es el número.
 *   · El PORCENTAJE: sólo si las dos formas lo muestran.
 *   · Un monto EXTRA que sólo trae la matriz NO se compara y se CUENTA aparte.
 *     Es el caso de Proyección: la matriz agrega el Δ contra el año anterior
 *     ("$2,746,281 +$412,435") y la tarjeta muestra el monto y deja el Δ para
 *     cuando se toca el renglón. Eso viene del #369 y NO lo introduce este
 *     cambio: `git diff origin/main` sobre ResumenViewMobile.tsx no toca una
 *     sola celda, sólo la clase del contenedor.
 */
function compararCelda(a, b) {
  const x = numeros(a), y = numeros(b);
  if (x == null || y == null) return { ok: false, nota: null };

  const montoX = x.find((t) => !t.pct);
  const montoY = y.find((t) => !t.pct);
  if (!montoX || !montoY) return { ok: false, nota: null };
  if (Math.abs(montoX.valor - montoY.valor) > Math.max(montoX.tol, montoY.tol)) {
    return { ok: false, nota: null };
  }

  const pctX = x.filter((t) => t.pct);
  const pctY = y.filter((t) => t.pct);
  const n = Math.min(pctX.length, pctY.length);
  for (let i = 0; i < n; i++) {
    if (Math.abs(pctX[i].valor - pctY[i].valor) > Math.max(pctX[i].tol, pctY[i].tol)) {
      return { ok: false, nota: null };
    }
  }

  const montosX = x.filter((t) => !t.pct).length;
  const montosY = y.filter((t) => !t.pct).length;
  return { ok: true, nota: montosY > montosX ? "matriz-trae-un-monto-mas" : null };
}

async function abrir(nav, ancho) {
  const alto = ancho >= 1200 ? 900 : ancho >= 700 ? 1194 : 844;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto },
    deviceScaleFactor: 1,
    hasTouch: ancho < 1200,
    isMobile: false,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem("fg_modules", JSON.stringify(["ventas", "cxc", "clientes", "vista-general", "admin"]));
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/ventas?tab=resumen", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("[data-celda]", { timeout: 60000, state: "attached" }).catch(() => {});
  await page.waitForTimeout(3000);
  return { ctx, page };
}

/**
 * El acordeón deja UNA tarjeta abierta a la vez, así que hay que recorrerlas de
 * a una: abrir, leer sus renglones, cerrar. Abrirlas todas de un saque leía sólo
 * la última.
 */
async function leerTarjetas(page) {
  const acumulado = {};
  Object.assign(acumulado, await page.evaluate(LEER));   // lo que se ve cerrado
  const cabeceras = page.locator("article > button[aria-expanded]");
  const n = await cabeceras.count();
  for (let i = 0; i < n; i++) {
    const b = cabeceras.nth(i);
    await b.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(250);
    Object.assign(acumulado, await page.evaluate(LEER));
    await b.click({ timeout: 8000 }).catch(() => {});   // cerrar antes de la próxima
    await page.waitForTimeout(120);
  }
  return { celdas: acumulado, tarjetas: n };
}

const nav = await chromium.launch();
let fallas = 0;
let totalComparadas = 0;

const ref = await abrir(nav, REFERENCIA);
const patron = await ref.page.evaluate(LEER);
await ref.ctx.close();

const nPatron = Object.keys(patron).length;
if (nPatron === 0) {
  console.log("❌ la matriz de 1440 px vino VACÍA — el 0 no prueba nada");
  await nav.close();
  process.exit(1);
}
console.log(`patrón: ${nPatron} celdas leídas de la matriz a ${REFERENCIA} px\n`);

for (const ancho of ANGOSTOS) {
  const { ctx, page } = await abrir(nav, ancho);
  const { celdas, tarjetas } = await leerTarjetas(page);
  await ctx.close();

  const claves = Object.keys(celdas);
  if (claves.length === 0) {
    console.log(`❌ ${ancho}px: SIN CELDAS. El 0 no prueba nada.`);
    fallas++;
    continue;
  }

  const diffs = [];
  let comparadas = 0;
  let soloAngosto = 0;
  let montoExtra = 0;
  for (const k of claves) {
    // Un mes futuro sin nada del año anterior la matriz lo dibuja como un "—"
    // mudo, sin `data-celda`. Se cuenta aparte, no se calla.
    if (!(k in patron)) { soloAngosto++; continue; }
    comparadas++;
    totalComparadas++;
    const r = compararCelda(celdas[k], patron[k]);
    if (!r.ok) diffs.push(`${k}: "${celdas[k]}" ≠ "${patron[k]}"`);
    else if (r.nota) montoExtra++;
  }

  const cobertura = comparadas / nPatron;
  if (cobertura < 0.9) {
    console.log(`❌ ${ancho}px: sólo ${comparadas} de ${nPatron} celdas de la matriz (${(cobertura * 100).toFixed(0)}%). Cobertura insuficiente.`);
    fallas++;
  } else if (diffs.length) {
    fallas++;
    console.log(`❌ ${ancho}px vs ${REFERENCIA}px: ${diffs.length} diferencia(s) sobre ${comparadas} celdas`);
    for (const d of diffs.slice(0, 10)) console.log(`     ${d}`);
  } else {
    console.log(
      `✅ ${ancho}px vs ${REFERENCIA}px: ${comparadas}/${nPatron} celdas · 0 diferencias ` +
      `(${tarjetas} tarjetas${soloAngosto ? `, ${soloAngosto} celda(s) que la matriz dibuja como "—" mudo` : ""})` +
      (montoExtra ? `\n     ⚠️ ${montoExtra} celda(s) donde la MATRIZ trae un monto más (el Δ de Proyección, que la tarjeta muestra al tocar) — ya era así en main` : ""),
    );
  }
}

await nav.close();
console.log(`\n${totalComparadas} celdas comparadas · ${fallas} ancho(s) con problemas`);
process.exit(fallas ? 1 : 0);
