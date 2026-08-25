// NINGÚN NÚMERO DE Ventas › Productos PUEDE CAMBIAR.
//
// Lo que ya se veía —Descripción, Códigos, Cant, Venta, Δ y Margen%— tiene que
// quedar EXACTAMENTE igual, en la MISMA FILA y en el MISMO ORDEN.
//
// ── 25-ago-2026: el script se ADAPTÓ a dos cambios de la pantalla ───────────
//
// 1. ⛔ EL MES SUELTO YA NO SE PUEDE ELEGIR. Daniel, textual: *"solo dejame las
//    4 primeras, las otras quítamelas que sobran, nunca te las pedí"*. El combo
//    `mes: "primero"` no se puede seguir midiendo porque la opción no existe en
//    el DESPUÉS — y forzarlo haría fallar el script por el cambio que se pidió,
//    no por un número movido. Se reemplazó por «Últimos 12 meses», que SÍ
//    existe en los dos lados y ejercita el mismo camino de servidor.
//    ⚠️ El servidor sigue aceptando `?mes=6` y contestando lo mismo (hay
//    candado en la ruta); lo que se retiró es que la pantalla lo pida.
//
// 2. LOS CÓDIGOS DEL DESPLEGABLE SIGUEN AHÍ, detrás de la pestaña «Códigos»
//    (el desplegable abre en «Quién lo compra»). El script la toca antes de
//    capturar, así que compara EXACTAMENTE los mismos renglones que antes.
//
// ⚠️ SE COMPARA POSICIÓN POR POSICIÓN, no como conjunto. Dos filas
// intercambiadas darían "los mismos números" mirando el conjunto, y es
// justamente el error que más daño hace acá: la cantidad de la CAMISA POLO en
// el renglón de la SANDALIA.
//
// Se capturan celda por celda usando los anclajes ESTABLES del DOM
// (`data-fila-producto` + `data-col`), no clases de breakpoint: si el corte se
// mueve, un selector por clase no encuentra nada y la comparación "pasa" sin
// haber comparado nada. Por eso el script FALLA si una combinación devuelve 0
// filas.
//
// Solo lectura: navega, cambia selectores y mira.
//
//   BASE=http://localhost:3214 ETAPA=antes node scripts/_verif-productos-numeros.mjs
//   BASE=http://localhost:3214 ETAPA=despues node scripts/_verif-productos-numeros.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3214";
const SALIDA = process.env.SALIDA ?? "/tmp/t214";
const ETAPA = process.env.ETAPA ?? "antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// Combinaciones que existen ANTES y DESPUÉS (las nuevas no se pueden comparar
// contra nada, así que no entran en la garantía de "no cambió").
const COMBOS = [
  { id: "fashion_wear-ytd", empresa: "Fashion Wear", periodo: null },
  { id: "vistana-ytd", empresa: "Vistana International", periodo: null },
  { id: "american_classic-ytd", empresa: "Multifashion", periodo: null },
  { id: "fashion_shoes-ytd", empresa: "Fashion Shoes", periodo: null },
  { id: "fashion_wear-12m", empresa: "Fashion Wear", periodo: "Últimos 12 meses" },
  { id: "vistana-12m", empresa: "Vistana International", periodo: "Últimos 12 meses" },
];

// Las columnas que YA EXISTÍAN. `precio` no entra: es la nueva.
const COLS_VIEJAS = ["descripcion", "codigos", "cantidad", "venta", "delta", "margen"];

const SONDA = `((cols) => {
  const filas = [...document.querySelectorAll("tr[data-fila-producto]")];
  return {
    filas: filas.map(tr => {
      const o = { fila: tr.getAttribute("data-fila-producto") };
      for (const c of cols) {
        const td = tr.querySelector('[data-col="' + c + '"]');
        // getAttribute + textContent: textContent NO depende de que la celda
        // esté visible en este ancho (a 390 la mitad de las columnas están
        // display:none pero su texto sigue en el DOM y es el mismo número).
        o[c] = td ? (td.textContent ?? "").replace(/\\s+/g, " ").trim() : null;
      }
      return o;
    }),
    totales: (document.querySelector("[data-totales-productos]")?.textContent ?? "")
      .replace(/\\s+/g, " ").trim(),
  };
})(${JSON.stringify(COLS_VIEJAS)})`;

const SONDA_DRILL = `(() => {
  const t = document.querySelector("[data-drill-codigos]");
  if (!t) return null;
  return [...t.querySelectorAll("tr")].map(tr =>
    [...tr.querySelectorAll("td")]
      .map(td => (td.textContent ?? "").replace(/\\s+/g, " ").trim())
      .join(" | "),
  );
})()`;

// Los tres selectores de la pantalla, en orden de DOM: el año es del shell de
// Ventas (no de este tab), después empresa y período.
const IDX_ANIO = 0, IDX_EMPRESA = 1, IDX_PERIODO = 2;

/** Radix Select: abre el trigger n-ésimo y elige la opción por texto exacto. */
async function elegir(page, indiceTrigger, textoOpcion) {
  const triggers = page.locator("button[role=combobox]");
  const n = await triggers.count();
  if (n <= indiceTrigger) throw new Error(`esperaba >${indiceTrigger} selectores, hay ${n}`);
  await triggers.nth(indiceTrigger).click();
  const opcion = page.getByRole("option", { name: textoOpcion, exact: true }).first();
  await opcion.waitFor({ state: "visible", timeout: 8000 });
  const txt = (await opcion.textContent())?.trim();
  await opcion.click();
  await page.waitForTimeout(3500);
  return txt;
}

/** Si el desplegable tiene pestañas (DESPUÉS), toca la de «Códigos». En el
 *  ANTES no hay ninguna y los códigos ya están a la vista: no-op. */
async function abrirCodigos(page) {
  const tab = page.getByRole("tab", { name: /Códigos/ });
  if (await tab.count()) {
    await tab.first().click();
    await page.waitForTimeout(700);
  }
}

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_is_owner", "1");
  sessionStorage.setItem("fg_modules", JSON.stringify(["ventas", "cxc", "clientes", "multifashion"]));
});

const resultado = {};
let vacios = 0;
const page = await ctx.newPage();
const erroresJs = [];
page.on("pageerror", x => erroresJs.push(String(x.message)));

for (const combo of COMBOS) {
  await page.goto(`${BASE}/ventas?tab=productos`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("tr[data-fila-producto]", { timeout: 45000 });
  const empresaElegida = await elegir(page, IDX_EMPRESA, combo.empresa);
  await page.waitForSelector("tr[data-fila-producto]", { timeout: 45000 });
  let periodo = "YTD";
  if (combo.periodo) {
    periodo = await elegir(page, IDX_PERIODO, combo.periodo);
    await page.waitForSelector("tr[data-fila-producto]", { timeout: 45000 });
  }
  const r = await page.evaluate(SONDA);

  // Drill-down: se abre la primera fila desplegable y se capturan sus códigos.
  let drill = null;
  const desplegable = page.locator("tr[data-fila-producto].cursor-pointer").first();
  if (await desplegable.count()) {
    await desplegable.click();
    await page.waitForTimeout(3000);
    await abrirCodigos(page);
    drill = await page.evaluate(SONDA_DRILL);
  }

  resultado[combo.id] = { empresa: empresaElegida, periodo, ...r, drill };
  if (r.filas.length === 0) vacios++;
  console.error(
    `[${ETAPA}] ${combo.id.padEnd(24)} ${String(r.filas.length).padStart(4)} filas · ` +
    `drill ${drill ? drill.length : "—"} códigos${r.filas.length === 0 ? "  ⚠️ VACÍO" : ""}`,
  );
}
await page.close();
await navegador.close();

if (erroresJs.length) console.error(`⚠️ errores JS: ${erroresJs.slice(0, 3).join(" | ")}`);
if (vacios > 0) {
  console.error(`❌ ${vacios} combinaciones sin filas — la medición NO prueba nada. Abortado.`);
  process.exit(2);
}

const archivo = path.join(SALIDA, `productos-numeros-${ETAPA}.json`);
writeFileSync(archivo, JSON.stringify(resultado, null, 1));
console.error(`\nGuardado en ${archivo}`);

const otro = path.join(SALIDA, `productos-numeros-${ETAPA === "antes" ? "despues" : "antes"}.json`);
if (!existsSync(otro)) process.exit(0);

const a = JSON.parse(readFileSync(path.join(SALIDA, "productos-numeros-antes.json"), "utf8"));
const d = JSON.parse(readFileSync(path.join(SALIDA, "productos-numeros-despues.json"), "utf8"));

console.log("\n=== ANTES vs DESPUÉS · celda por celda, en su fila ===");
let distintasTotal = 0;
let celdasComparadas = 0;
for (const id of Object.keys(a)) {
  const A = a[id], D = d[id];
  const distintas = [];
  if (!D) { console.log(`${id}: ❌ falta en DESPUÉS`); distintasTotal++; continue; }
  const n = Math.max(A.filas.length, D.filas.length);
  for (let i = 0; i < n; i++) {
    const fa = A.filas[i], fd = D.filas[i];
    if (!fa || !fd) { distintas.push({ i, campo: "fila", antes: fa?.fila, despues: fd?.fila }); continue; }
    if (fa.fila !== fd.fila) distintas.push({ i, campo: "ORDEN", antes: fa.fila, despues: fd.fila });
    for (const c of COLS_VIEJAS) {
      celdasComparadas++;
      if (fa[c] !== fd[c]) distintas.push({ i, campo: c, fila: fa.fila, antes: fa[c], despues: fd[c] });
    }
  }
  const dA = A.drill ?? [], dD = D.drill ?? [];
  for (let i = 0; i < Math.max(dA.length, dD.length); i++) {
    celdasComparadas++;
    // El drill-down gana una columna: se compara que el texto viejo SIGA ADENTRO.
    if (dA[i] == null || dD[i] == null || !contieneLoViejo(dA[i], dD[i])) {
      distintas.push({ i, campo: "drill", antes: dA[i], despues: dD[i] });
    }
  }
  distintasTotal += distintas.length;
  console.log(
    `${id.padEnd(24)} ${String(A.filas.length).padStart(4)} filas · ` +
    (distintas.length === 0 ? "✅ 0 distintas" : `❌ ${distintas.length} DISTINTAS`),
  );
  if (A.totales !== D.totales) console.log(`     totales: antes="${A.totales}"  después="${D.totales}"`);
  for (const x of distintas.slice(0, 15)) {
    console.log(`     [${x.i}] ${x.campo}${x.fila ? ` (${x.fila})` : ""}: antes=${x.antes ?? "—"}  después=${x.despues ?? "—"}`);
  }
}
console.log(`\n${celdasComparadas} celdas comparadas.`);
console.log(distintasTotal === 0 ? "✅ NINGÚN NÚMERO CAMBIÓ." : `❌ ${distintasTotal} celdas distintas.`);
process.exit(distintasTotal === 0 ? 0 : 1);

/** Cada trozo del renglón viejo tiene que seguir estando en el nuevo. */
function contieneLoViejo(viejo, nuevo) {
  return viejo.split(" | ").every(p => nuevo.includes(p));
}
