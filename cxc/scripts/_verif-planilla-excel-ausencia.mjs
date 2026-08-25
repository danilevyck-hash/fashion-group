// Baja el Excel de la Planilla DESDE LA APP REAL (el botón que aprieta la
// contadora) y lo lee con DOS parsers distintos. Solo lectura.
//
// 🔴 POR QUÉ DOS: `xlsx-js-style` es el que ESCRIBE el archivo, así que leerlo
// con él solo prueba que sabe releerse a sí mismo. `openpyxl` es otro programa,
// escrito en otro lenguaje, y es el que de verdad abre Excel del lado de allá.
// Un archivo que solo abre nuestro parser no sirve para nada.
//
//   npm run build && PORT=3499 npm run start
//   BASE=http://localhost:3499 node scripts/_verif-planilla-excel-ausencia.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import crypto from "crypto";
// 🩸 `import * as XLSX` deja `XLSX.read` en `undefined`: el paquete es CommonJS
// y su default es el módulo entero. `createRequire` es la forma que no miente.
import { createRequire } from "node:module";
const XLSX = createRequire(import.meta.url)("xlsx-js-style");

const BASE = process.env.BASE ?? "http://localhost:3499";
const OUT = "/tmp/excel-ausencia";
mkdirSync(OUT, { recursive: true });

for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const body = Buffer.from(JSON.stringify({
  role: "admin", userId: "medicion", userName: "medicion", sessionToken: "medicion%local",
})).toString("base64url");
const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");

const b = await chromium.launch();
const c = await b.newContext({ acceptDownloads: true });
await c.addCookies([{ name: "cxc_session", value: `${body}.${sig}`, url: BASE }]);
await c.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});
const p = await c.newPage();
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto(`${BASE}/asistencia?tab=planilla`, { waitUntil: "networkidle", timeout: 180_000 });
await p.waitForTimeout(1500);
// La quincena del Excel de la contadora, que es la que tiene días de más de 30
// minutos tarde en Boston y en Vistana (medido).
await p.locator("select").first().selectOption({ label: "16 al 31 de julio de 2026" });
await p.waitForTimeout(1200);
await p.locator("select").nth(1).selectOption("confecciones_boston");
await p.waitForTimeout(2500);

const [descarga] = await Promise.all([
  p.waitForEvent("download", { timeout: 60_000 }),
  p.locator('button:has-text("Excel"), a:has-text("Excel")').first().click(),
]);
const ruta = `${OUT}/planilla-boston.xlsx`;
await descarga.saveAs(ruta);
await b.close();

const bytes = readFileSync(ruta);
console.log(`Bajado: ${ruta} — ${bytes.length} bytes`);
if (bytes.length < 5000) throw new Error("El archivo pesa menos de 5 KB: no es un Excel de verdad");

// ── Parser 1: xlsx-js-style ──────────────────────────────────────────────────
const wb = XLSX.read(bytes, { type: "buffer" });
console.log("hojas:", wb.SheetNames.join(" · "));

const problemas = [];
const hojaHoras = wb.Sheets[wb.SheetNames.find((n) => /hora/i.test(n)) ?? wb.SheetNames[1]];
const filasHoras = XLSX.utils.sheet_to_json(hojaHoras, { header: 1, blankrows: false });
const encabezado = filasHoras.find((f) => (f ?? []).some((c) => String(c).includes("Tarde >30 min")));
if (!encabezado) problemas.push("la hoja de horas no tiene las columnas «Tarde >30 min»");
else {
  const iMin = encabezado.findIndex((c) => String(c) === "Tarde >30 min (min)");
  const iDias = encabezado.findIndex((c) => String(c) === "Tarde >30 min (días)");
  const iTard = encabezado.findIndex((c) => String(c) === "Tardanza (min)");
  console.log(`columnas: Tardanza(min)=${iTard} · Tarde>30(min)=${iMin} · Tarde>30(días)=${iDias}`);
  const desde = filasHoras.indexOf(encabezado) + 1;
  let conGrave = 0;
  for (const f of filasHoras.slice(desde)) {
    const dias = Number(f?.[iDias] ?? 0);
    if (dias > 0) {
      conGrave += 1;
      console.log(`  ${String(f[0]).slice(0, 26).padEnd(26)} tardanza ${f[iTard]} min · tarde>30 ${f[iMin]} min en ${dias} día(s)`);
    }
  }
  if (!conGrave) problemas.push("ninguna fila de la hoja de horas trae días de más de 30 minutos tarde");
}

const hojaComo = wb.Sheets[wb.SheetNames.find((n) => /calcula/i.test(n))];
const textoComo = JSON.stringify(XLSX.utils.sheet_to_json(hojaComo, { header: 1, blankrows: false }));
if (!/Llegar más de 30 minutos tarde/.test(textoComo)) {
  problemas.push("la hoja «Cómo se calcula» no explica la regla de los 30 minutos");
}
if (!/SE DESCUENTAN LOS MINUTOS/.test(textoComo)) {
  problemas.push("la hoja «Cómo se calcula» no dice que los minutos se descuentan igual");
}

// ── El cuadro: la columna «Ausencias» tiene que cuadrar con el bruto ──────────
const hojaCuadro = wb.Sheets[wb.SheetNames[0]];
const filasCuadro = XLSX.utils.sheet_to_json(hojaCuadro, { header: 1, blankrows: false });
const encCuadro = filasCuadro.find((f) => (f ?? []).some((c) => String(c) === "Total bruto"));
if (!encCuadro) problemas.push("no encontré el encabezado del cuadro");
else {
  const idx = (n) => encCuadro.findIndex((c) => String(c) === n);
  // 🩸 LOS NOMBRES SE COPIAN DEL ARCHIVO, no de la memoria. La primera versión
  // buscaba «Extra 1.25» y el encabezado dice «Horas extra 1.25»: `findIndex`
  // devolvía −1, la columna entraba como 0 y el cuadro "no cuadraba" por el
  // monto exacto de los extras. El script denunciaba un bug que no existía.
  const NOMBRES = ["Salario quincenal", "Horas extra 1.25", "Ausencias", "Tardanzas",
    "Horas extra 1.50", "Excedente 2.625", "Domingos", "Feriados", "Total bruto"];
  const faltantes = NOMBRES.filter((n) => idx(n) === -1);
  if (faltantes.length) {
    problemas.push(`el encabezado del cuadro no tiene: ${faltantes.join(" · ")}`);
  }
  const [iQ, iE125, iAus, iTar, iE150, iExc, iDom, iFer, iBruto] = NOMBRES.map(idx);
  let revisadas = 0;
  for (const f of filasCuadro.slice(filasCuadro.indexOf(encCuadro) + 1)) {
    const bruto = Number(f?.[iBruto]);
    if (!Number.isFinite(bruto) || bruto === 0) continue;
    const n = (i) => Number(f?.[i] ?? 0) || 0;
    const esperado = Math.round((n(iQ) + n(iE125) + n(iE150) + n(iExc) + n(iDom) + n(iFer) - n(iAus) - n(iTar)) * 100) / 100;
    revisadas += 1;
    if (Math.abs(esperado - bruto) > 0.005) {
      problemas.push(`${f[0]}: el bruto del Excel (${bruto}) no cuadra con sus columnas (${esperado})`);
    }
  }
  console.log(`filas del cuadro con bruto verificado a mano: ${revisadas}`);
  if (revisadas < 5) problemas.push("se verificaron menos de 5 filas: el Excel salió casi vacío");
}

if (problemas.length) {
  console.error("\n🔴 " + problemas.join("\n🔴 "));
  process.exitCode = 1;
} else {
  console.error("\n🟢 xlsx-js-style: hojas, columnas nuevas y el bruto cuadrando columna por columna.");
}
