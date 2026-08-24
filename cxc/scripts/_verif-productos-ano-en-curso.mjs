// SOLO LA Δ DEL «AÑO EN CURSO» PUEDE MOVERSE. LOS OTROS 4 PERÍODOS, NI UN PÍXEL.
//
// Este cambio corrige UNA cosa: «Año en curso» comparaba los meses transcurridos
// de 2026 contra los 12 meses ENTEROS de 2025. Todo lo demás —el mes suelto,
// Últimos 6 meses, Últimos 12 meses, Año pasado, y en «Año en curso» también las
// columnas Descripción / Códigos / Cant / Venta / Precio prom. / Margen%— tiene
// que quedar EXACTAMENTE igual, en la MISMA FILA y en el MISMO ORDEN.
//
// ⚠️ SE COMPARA POSICIÓN POR POSICIÓN, no como conjunto. Dos filas
// intercambiadas darían "los mismos números" mirando el conjunto, y es
// justamente el error que más daño hace acá: el Δ de la CAMISA POLO en el
// renglón de la SANDALIA.
//
// Se capturan celda por celda con los anclajes ESTABLES del DOM
// (`data-fila-producto` + `data-col`), nunca por clase de breakpoint: si el
// corte se mueve, un selector por clase no encuentra nada y la comparación
// "pasa" sin haber comparado nada. Por eso el script FALLA si una combinación
// devuelve 0 filas, si falta el renglón "Δ contra …", o si el período elegido no
// es el que se pidió.
//
// Solo lectura: navega, cambia selectores y mira.
//
//   BASE=http://localhost:3222 ETAPA=antes   node scripts/_verif-productos-ano-en-curso.mjs
//   BASE=http://localhost:3222 ETAPA=despues node scripts/_verif-productos-ano-en-curso.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3222";
const SALIDA = process.env.SALIDA ?? "/tmp/t222";
const ETAPA = process.env.ETAPA ?? "antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// Los CINCO períodos de la pantalla. `mes: "primero"` es el mes suelto, que se
// elige por su texto real (varía por empresa y por año).
const PERIODOS = [
  { id: "ano-en-curso", opcion: "Año en curso" },
  { id: "mes-suelto", opcion: null },
  { id: "ultimos-6", opcion: "Últimos 6 meses" },
  { id: "ultimos-12", opcion: "Últimos 12 meses" },
  { id: "ano-pasado", opcion: "Año pasado" },
];

// Dos empresas: la del ejemplo de Daniel (Fashion Wear · Women-T-Shirts S/S) y
// una segunda, porque un arreglo que solo se probó en una empresa no está
// probado.
const EMPRESAS = ["Fashion Wear", "Vistana International"];

// TODAS las columnas de la tabla. `delta` es la única que puede moverse, y solo
// en «Año en curso»: por eso se capturan también las otras cinco.
const COLS = ["descripcion", "codigos", "cantidad", "venta", "precio", "delta", "margen"];

// La Δ del «Año en curso» es lo ÚNICO que el arreglo puede tocar.
const CAMPOS_QUE_PUEDEN_MOVERSE = new Set(["delta", "comparativo"]);

const SONDA = `((cols) => {
  const filas = [...document.querySelectorAll("tr[data-fila-producto]")];
  return {
    filas: filas.map(tr => {
      const o = { fila: tr.getAttribute("data-fila-producto") };
      for (const c of cols) {
        const td = tr.querySelector('[data-col="' + c + '"]');
        // textContent NO depende de que la celda esté visible en este ancho: a
        // 390 la mitad de las columnas están display:none y su texto sigue ahí.
        o[c] = td ? (td.textContent ?? "").replace(/\\s+/g, " ").trim() : null;
      }
      return o;
    }),
    totales: (document.querySelector("[data-totales-productos]")?.textContent ?? "")
      .replace(/\\s+/g, " ").trim(),
    resumen: (document.querySelector("[data-resumen-productos]")?.textContent ?? "")
      .replace(/\\s+/g, " ").trim(),
  };
})(${JSON.stringify(COLS)})`;

// Los tres selectores, en orden de DOM: el año es del shell de Ventas, después
// empresa y período.
const IDX_ANIO = 0, IDX_EMPRESA = 1, IDX_PERIODO = 2;

async function elegir(page, indiceTrigger, textoOpcion) {
  const triggers = page.locator("button[role=combobox]");
  const n = await triggers.count();
  if (n <= indiceTrigger) throw new Error(`esperaba >${indiceTrigger} selectores, hay ${n}`);
  await triggers.nth(indiceTrigger).click();
  const opcion = page.getByRole("option", { name: textoOpcion, exact: true }).first();
  await opcion.waitFor({ state: "visible", timeout: 10000 });
  await opcion.click();
  await page.waitForTimeout(3500);
  return textoOpcion;
}

/** El primer mes que ofrezca el selector de período (varía por empresa/año). */
async function primerMes(page) {
  const triggers = page.locator("button[role=combobox]");
  await triggers.nth(IDX_PERIODO).click();
  const opciones = page.locator("[role=option]");
  await opciones.first().waitFor({ state: "visible", timeout: 10000 });
  const textos = await opciones.allTextContents();
  const MES = /^(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)\b/;
  const elegido = textos.map(t => t.trim()).find(t => MES.test(t));
  if (!elegido) throw new Error(`el selector de período no ofrece ningún mes: ${textos.join(" / ")}`);
  await page.getByRole("option", { name: elegido, exact: true }).first().click();
  await page.waitForTimeout(3500);
  return elegido;
}

/** Lo que el trigger del selector de período está mostrando AHORA. */
async function periodoElegido(page) {
  return (await page.locator("button[role=combobox]").nth(IDX_PERIODO).textContent())?.trim() ?? "";
}

/** "Δ contra 1 ene 2025 – 31 dic 2025" → el trozo de fechas, o null. */
function extraerComparativo(resumen) {
  const m = /Δ contra (.+)$/.exec(resumen);
  return m ? m[1].trim() : null;
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
const fallas = [];
const page = await ctx.newPage();
const erroresJs = [];
page.on("pageerror", x => erroresJs.push(String(x.message)));

for (const empresa of EMPRESAS) {
  for (const per of PERIODOS) {
    const id = `${empresa.split(" ")[0].toLowerCase()}-${per.id}`;
    await page.goto(`${BASE}/ventas?tab=productos`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("tr[data-fila-producto]", { timeout: 45000 });
    await elegir(page, IDX_EMPRESA, empresa);
    await page.waitForSelector("tr[data-fila-producto]", { timeout: 45000 });

    let etiqueta;
    if (per.opcion === null) etiqueta = await primerMes(page);
    else etiqueta = await elegir(page, IDX_PERIODO, per.opcion);
    await page.waitForSelector("tr[data-fila-producto]", { timeout: 45000 });

    // El selector tiene que estar mostrando lo que pedimos. Medir el período
    // equivocado y darlo por bueno es peor que no medir.
    const mostrado = await periodoElegido(page);
    if (mostrado !== etiqueta) fallas.push(`${id}: pedí "${etiqueta}" y el selector dice "${mostrado}"`);

    const r = await page.evaluate(SONDA);
    const comparativo = extraerComparativo(r.resumen);
    if (r.filas.length === 0) fallas.push(`${id}: 0 filas`);
    if (!comparativo) fallas.push(`${id}: la pantalla NO dice contra qué compara ("${r.resumen}")`);

    resultado[id] = { empresa, etiqueta, comparativo, ...r };
    console.error(
      `[${ETAPA}] ${id.padEnd(26)} ${String(r.filas.length).padStart(4)} filas · ` +
      `${etiqueta.padEnd(18)} · Δ contra ${comparativo ?? "—"}`,
    );
  }
}
await page.close();
await navegador.close();

if (erroresJs.length) console.error(`⚠️ errores JS: ${erroresJs.slice(0, 3).join(" | ")}`);
if (fallas.length) {
  console.error(`\n❌ la medición NO prueba nada:\n  - ${fallas.join("\n  - ")}`);
  process.exit(2);
}

const archivo = path.join(SALIDA, `productos-periodos-${ETAPA}.json`);
writeFileSync(archivo, JSON.stringify(resultado, null, 1));
console.error(`\nGuardado en ${archivo}`);

const antesPath = path.join(SALIDA, "productos-periodos-antes.json");
const despuesPath = path.join(SALIDA, "productos-periodos-despues.json");
if (!existsSync(antesPath) || !existsSync(despuesPath)) process.exit(0);

const a = JSON.parse(readFileSync(antesPath, "utf8"));
const d = JSON.parse(readFileSync(despuesPath, "utf8"));

console.log("\n=== ANTES vs DESPUÉS · celda por celda, en su fila ===");
let celdas = 0, prohibidas = 0, permitidas = 0;
for (const id of Object.keys(a)) {
  const A = a[id], D = d[id];
  if (!D) { console.log(`${id}: ❌ falta en DESPUÉS`); prohibidas++; continue; }
  // «Año en curso» es el único donde la Δ tiene permiso de moverse.
  const esAnioEnCurso = id.endsWith("-ano-en-curso");
  const dif = [];

  celdas++;
  if (A.comparativo !== D.comparativo) {
    dif.push({ i: "—", campo: "comparativo", antes: A.comparativo, despues: D.comparativo });
  }
  celdas++;
  if (A.totales !== D.totales) dif.push({ i: "—", campo: "totales", antes: A.totales, despues: D.totales });

  const n = Math.max(A.filas.length, D.filas.length);
  for (let i = 0; i < n; i++) {
    const fa = A.filas[i], fd = D.filas[i];
    if (!fa || !fd) { dif.push({ i, campo: "fila", antes: fa?.fila, despues: fd?.fila }); continue; }
    if (fa.fila !== fd.fila) dif.push({ i, campo: "ORDEN", antes: fa.fila, despues: fd.fila });
    for (const c of COLS) {
      celdas++;
      if (fa[c] !== fd[c]) dif.push({ i, campo: c, fila: fa.fila, antes: fa[c], despues: fd[c] });
    }
  }

  const malas = dif.filter(x => !(esAnioEnCurso && CAMPOS_QUE_PUEDEN_MOVERSE.has(x.campo)));
  prohibidas += malas.length;
  permitidas += dif.length - malas.length;
  const veredicto = malas.length
    ? `❌ ${malas.length} PROHIBIDAS`
    : dif.length
      ? `✅ intacto salvo ${dif.length} Δ (con permiso)`
      : "✅ idéntico";
  console.log(`${id.padEnd(26)} ${String(A.filas.length).padStart(4)} filas · ${veredicto}`);
  for (const x of dif.slice(0, 12)) {
    const marca = malas.includes(x) ? "❌" : "•";
    console.log(`   ${marca} [${x.i}] ${x.campo}${x.fila ? ` (${x.fila})` : ""}: antes=${x.antes ?? "—"}  después=${x.despues ?? "—"}`);
  }
}

// El arreglo TIENE que haber movido algo: si «Año en curso» sale idéntico, o no
// se aplicó, o el script no está mirando lo que cree.
console.log(`\n${celdas} celdas comparadas · ${permitidas} cambios con permiso · ${prohibidas} prohibidos.`);
if (permitidas === 0) {
  console.log("❌ NADA cambió en «Año en curso»: el arreglo no llegó a la pantalla.");
  process.exit(1);
}
console.log(prohibidas === 0
  ? "✅ SOLO se movió la Δ de «Año en curso». Los otros 4 períodos, intactos."
  : `❌ ${prohibidas} celdas se movieron donde no debían.`);
process.exit(prohibidas === 0 ? 0 : 1);
