// Medición POR LA PANTALLA del aviso de marca desconocida (/productos/cargar).
//
// ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
// La fórmula de precio se elige POR MARCA. Una marca que no está en
// MARCAS_CATALOGO cae a "Otros" en reclassMarca, "Otros" no tiene fórmula, y el
// producto sale SIN PRECIO. Hasta el 26-ago-2026 eso pasaba EN SILENCIO: ni
// alerta ni aviso — el producto simplemente aparecía sin precio y nadie se
// enteraba hasta abrir el Excel.
//
// Un test unitario no alcanza para decir que "se ve en pantalla". Esto carga un
// archivo REAL del proveedor por el input de la pantalla y lee el DOM.
//
// Lo que mide, y por qué cada cosa:
//   A) archivo real INTACTO  → CERO avisos (el aviso no puede ser ruido)
//   B) el mismo archivo con 9 estilos de una línea que el sistema no conoce
//      → el aviso aparece, dice la marca CRUDA y el conteo, y la DESCARGA SIGUE
//        HABILITADA: el producto tiene que seguir saliendo, lo único que cambia
//        es que ahora se dice.
//   C) los 3 anchos (390 · 834 · 1440): visible y sin desborde horizontal.
//
// 🩸 GOTCHAS de medición (ya pagados, ver _medir-depurador-alertas-catalogo.mjs):
//   · la cookie va con el nombre real del usuario (_cookie-medicion-usuario.ts)
//   · sessionStorage.cxc_role se siembra ANTES de que monte la alarma
//   · delete Navigator.prototype.serviceWorker antes de navegar
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_cookie-medicion-usuario.ts > /tmp/tKL/cookie.txt
//   BASE=http://localhost:3187 node scripts/_medir-marca-desconocida.mjs
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import XLSXpkg from "xlsx-js-style";
const XLSX = XLSXpkg;
const BASE = process.env.BASE ?? "http://localhost:3187";
const DIR = process.env.DIR ?? "/tmp/tKL";
mkdirSync(DIR, { recursive: true });
const COOKIE = readFileSync(`${DIR}/cookie.txt`, "utf8").trim();

const LEER = `(() => {
  const avisos = [...document.querySelectorAll("[data-marca-desconocida]")]
    .map(e => (e.innerText||"").replace(/\\s+/g," ").trim());
  const btn = [...document.querySelectorAll("button")].find(b => /Descargar/i.test(b.textContent||""));
  const filas = document.querySelectorAll("tbody tr").length;
  const stats = [...document.querySelectorAll("span")].filter(e => /estilos|marca\(s\)/.test(e.textContent||"")).map(e => e.textContent.trim());
  // La columna Marca EXACTA: se busca su índice por el encabezado de la tabla.
  const ths = [...document.querySelectorAll("thead th")].map(e => (e.textContent||"").trim());
  const iM = ths.findIndex(t => /^Marca/.test(t));
  const marcasCol = {};
  for (const tr of document.querySelectorAll("tbody tr")) {
    const td = tr.children[iM]; if (!td) continue;
    const v = (td.innerText||"").trim(); if (!v) continue;
    marcasCol[v] = (marcasCol[v]||0)+1;
  }
  return { avisos, descargaHabilitada: btn ? !btn.disabled : null, filas, stats, marcasCol };
})()`;

async function cargar(page, archivo) {
  await page.goto(`${BASE}/productos/cargar`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => sessionStorage.setItem("cxc_role", "admin"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => { const i = document.querySelector("input[type=file]"); return i && !i.disabled; }, null, { timeout: 60000 });
  await page.setInputFiles("input[type=file]", archivo);
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length > 0, null, { timeout: 120000 });
  // cerrar la alarma de descripciones si apareció (no es lo que se mide acá)
  const cerrar = page.getByRole("button", { name: /Entendido|Cerrar/i }).first();
  if (await cerrar.count().catch(() => 0)) await cerrar.click().catch(() => {});
  await page.waitForTimeout(400);
  return page.evaluate(LEER);
}

// ── Los dos archivos de medición, armados desde uno REAL del proveedor ───────
// 3000014692_TXT.xls: 166 filas, todas "CK Menswear". Se le cambia la marca a 9
// estilos por una línea que el catálogo no conoce; el resto queda igual.
function armarArchivos() {
  const SRC = process.env.SRC ?? `${process.env.HOME}/Downloads/3000014692_TXT.xls`;
  const wb = XLSX.readFile(SRC);
  const hoja = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: false, defval: "" });
  const hdr = rows[0].map((h) => String(h).trim().toUpperCase());
  const cM = hdr.indexOf("MARCA"), cR = hdr.indexOf("REFERENCIA");
  const refs = new Set();
  for (let i = 1; i < rows.length; i++) {
    const ref = String(rows[i][cR] ?? "").trim();
    if (!ref) continue;
    if (!refs.has(ref)) { if (refs.size >= 9) continue; refs.add(ref); }
    rows[i][cM] = "CK Sombreros";
  }
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(rows), hoja);
  XLSX.writeFile(out, `${DIR}/proveedor-linea-nueva.xlsx`);
  XLSX.writeFile(XLSX.readFile(SRC), `${DIR}/proveedor-real.xlsx`);
  console.log(`archivos listos · estilos con marca desconocida: ${refs.size}`);
}
armarArchivos();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { delete Navigator.prototype.serviceWorker; } catch {} });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
const page = await ctx.newPage();

console.log("=== A) archivo REAL intacto (CK Menswear) — no debe avisar nada ===");
console.log(JSON.stringify(await cargar(page, `${DIR}/proveedor-real.xlsx`), null, 2));

console.log("\n=== B) mismo archivo con 9 estilos de una línea que el sistema NO conoce ===");
const b = await cargar(page, `${DIR}/proveedor-linea-nueva.xlsx`);
console.log(JSON.stringify(b, null, 2));

console.log("\n=== C) los 3 anchos ===");
for (const w of [390, 834, 1440]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(250);
  const r = await page.evaluate(`(() => {
    const e = document.querySelector("[data-marca-desconocida]");
    if (!e) return { ancho: ${w}, visible: false };
    const r = e.getBoundingClientRect();
    return { ancho: ${w}, visible: true, texto: (e.innerText||"").replace(/\\s+/g," ").trim(),
      left: Math.round(r.left), right: Math.round(r.right), alto: Math.round(r.height),
      desbordaX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  })()`);
  console.log(JSON.stringify(r));
  await page.screenshot({ path: `${DIR}/aviso-${w}.png`, fullPage: false });
}
await browser.close();
