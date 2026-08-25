// ---------------------------------------------------------------------------
// ¿La TARJETA de celular dice EXACTAMENTE lo mismo que la TABLA?
//
// Ventas > Productos pasa a tarjetas debajo de `sm`. El peor final de un cambio
// asi no es que se vea feo: es que las dos pantallas del MISMO dato digan cosas
// distintas y nadie se entere hasta que alguien compare.
//
// 🩸 POR QUE `data-vista` Y NO LA CLASE DEL BREAKPOINT. La trampa de este tipo
// de verificacion es buscar el layout por su clase (`.sm\\:hidden`): en cuanto
// el corte se mueve esa clase no existe, `querySelector` devuelve vacio, el
// script compara CERO celdas y pasa en verde SIN HABER MIRADO NADA. Por eso
// cada layout lleva un `data-vista` FIJO y esto **falla si encuentra cero**.
//
// QUE COMPARA, en la misma empresa y el mismo periodo:
//   · que las dos vistas listen las MISMAS descripciones y en el MISMO orden;
//   · que los CUATRO numeros de cada tarjeta (piezas, venta, precio prom.,
//     margen %) sean IGUALES, caracter por caracter, a los de la fila.
//   Se compara el TEXTO DIBUJADO, no el dato crudo: un segundo formateador o un
//   segundo redondeo es justamente lo que hay que cazar.
//
// GOTCHAS heredados (no tocar sin leer): cookie firmada, `sessionStorage
// .cxc_role` y `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura.
//   BASE=http://localhost:3350 node scripts/_verif-tarjetas-productos.mjs
// ---------------------------------------------------------------------------

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3350";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const EMPRESAS = (process.env.EMPRESAS ?? "vistana,fashion_wear,fashion_shoes,active_wear,active_shoes,joystep").split(",");
const PERIODOS = (process.env.PERIODOS ?? "ytd,6m,12m,anio_pasado").split(",");

// Los cuatro numeros que la tarjeta muestra y que la tabla ya mostraba. `col`
// es el MISMO nombre en los dos layouts a proposito: si alguien renombra uno
// solo, esto revienta en vez de comparar de a pares equivocados.
const COLS = ["cantidad", "venta", "precio", "margen"];

const SONDA = `(() => {
  const vista = (v) => document.querySelector('[data-vista="' + v + '"]');
  const tabla = vista("tabla");
  const tarjetas = vista("tarjetas");
  if (!tabla || !tarjetas) return { error: "falta un data-vista: " + (!tabla ? "tabla" : "tarjetas") };

  const filas = [...tabla.querySelectorAll("tr[data-fila-producto]")].map(tr => {
    const o = { descripcion: tr.getAttribute("data-fila-producto") };
    for (const c of ${JSON.stringify(COLS)}) {
      o[c] = (tr.querySelector('[data-col="' + c + '"]')?.textContent ?? "").trim();
    }
    return o;
  });
  const cards = [...tarjetas.querySelectorAll("li[data-tarjeta-producto]")].map(li => {
    const o = { descripcion: li.getAttribute("data-tarjeta-producto") };
    for (const c of ${JSON.stringify(COLS)}) {
      o[c] = (li.querySelector('[data-tarjeta-col="' + c + '"]')?.textContent ?? "").trim();
    }
    return o;
  });
  const chips = [...tarjetas.parentElement.querySelectorAll("[data-orden-chip]")]
    .map(b => b.getAttribute("data-orden-chip"));
  return { filas, cards, chips };
})()`;

const navegador = await chromium.launch();
// 🔑 Se mide en UN solo ancho GRANDE a proposito: en jsdom-menos-CSS los dos
// layouts existen igual, y aca lo que se compara es el CONTENIDO, no cual se
// ve. Cual se ve en cada ancho lo mide `_medir-productos-tarjetas-anchos.mjs`.
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_is_owner", "1");
  sessionStorage.setItem("fg_modules", JSON.stringify(["ventas", "cxc", "clientes", "multifashion"]));
});
const page = await ctx.newPage();

let comparadas = 0;
let difs = 0;
let pantallas = 0;
const fallos = [];

for (const empresa of EMPRESAS) {
  for (const periodo of PERIODOS) {
    await page.goto(`${BASE}/ventas?tab=productos&empresa=${empresa}&periodo=${periodo}`, {
      waitUntil: "domcontentloaded", timeout: 60000,
    });
    await page.waitForSelector("tr[data-fila-producto]", { timeout: 45000 });
    await page.waitForTimeout(900);
    const r = await page.evaluate(SONDA);
    if (r.error) { fallos.push(`${empresa}/${periodo}: ${r.error}`); difs += 1; continue; }
    pantallas += 1;

    if (r.filas.length === 0 || r.cards.length === 0) {
      fallos.push(`${empresa}/${periodo}: CERO elementos (filas=${r.filas.length} tarjetas=${r.cards.length}) — no se comparó nada`);
      difs += 1;
      continue;
    }
    if (r.filas.length !== r.cards.length) {
      fallos.push(`${empresa}/${periodo}: ${r.filas.length} filas vs ${r.cards.length} tarjetas`);
      difs += 1;
    }
    // Los cuatro criterios de orden tienen que estar en celular: es justo lo
    // que se pierde al quedarse sin encabezado.
    const esperados = ["cantidad", "venta", "precio", "margen"];
    if (JSON.stringify(r.chips) !== JSON.stringify(esperados)) {
      fallos.push(`${empresa}/${periodo}: chips de orden ${JSON.stringify(r.chips)} != ${JSON.stringify(esperados)}`);
      difs += 1;
    }
    const n = Math.min(r.filas.length, r.cards.length);
    for (let i = 0; i < n; i += 1) {
      const f = r.filas[i];
      const c = r.cards[i];
      comparadas += 1;
      if (f.descripcion !== c.descripcion) {
        difs += 1;
        if (fallos.length < 25) fallos.push(`${empresa}/${periodo} pos ${i}: "${c.descripcion}" (tarjeta) vs "${f.descripcion}" (tabla)`);
        continue;
      }
      for (const col of COLS) {
        comparadas += 1;
        if (f[col] !== c[col]) {
          difs += 1;
          if (fallos.length < 25) fallos.push(`${empresa}/${periodo} "${f.descripcion}" ${col}: tarjeta "${c[col]}" vs tabla "${f[col]}"`);
        }
      }
    }
    process.stderr.write(`  ${empresa}/${periodo}: ${n} productos\n`);
  }
}
await navegador.close();

console.log("=".repeat(76));
console.log(`  Pantallas medidas:   ${pantallas} (${EMPRESAS.length} empresas x ${PERIODOS.length} periodos)`);
console.log(`  Celdas comparadas:   ${comparadas.toLocaleString("en-US")}`);
console.log(`  Diferencias:         ${difs}`);
for (const f of fallos) console.log(`  ✗ ${f}`);

// 🔑 Con 0 comparadas esto no probaria NADA: se exige haber mirado algo.
const ok = difs === 0 && comparadas > 0 && pantallas === EMPRESAS.length * PERIODOS.length;
console.log(`\n  ${ok ? "✅ La tarjeta dice lo mismo que la tabla, celda por celda." : "❌ REVISAR arriba."}`);
process.exit(ok ? 0 : 1);
