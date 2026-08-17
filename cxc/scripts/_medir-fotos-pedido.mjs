// ¿Cuánto tarda y cuánto pesa el pedido de Reebok CON las fotos pegadas?
//
// Se mide EN EL NAVEGADOR, contra el build de producción, con la CARPETA REAL
// (`~/Library/CloudStorage/OneDrive-FashionGroup/Reebok/Fotos`, 4.744 .jpg) y
// con los CÓDIGOS REALES del Excel que Daniel arma hoy a mano con el macro
// (`1000 fiver excel.xlsm`, 203 códigos). No hay fotos inventadas ni códigos de
// prueba: si el resultado con 200 filas fuera inusable, eso es un hallazgo.
//
// Qué mide, y por qué cada cosa:
//   * `msTotal`   — del clic a que el archivo termina de bajar. Es lo que la
//                   secretaria espera mirando la pantalla.
//   * `msFotos`   — cuánto de eso es achicar las fotos (lo caro).
//   * `mb`        — cuánto pesa el .xlsx. 203 fotos de cámara sin achicar darían
//                   ~20 MB y el archivo sería imposible de mandar por correo.
//   * `abre`      — el archivo se vuelve a abrir con la librería de Excel y se
//                   cuentan las imágenes DENTRO del ZIP. Que baje un archivo no
//                   prueba que Excel lo pueda abrir.
//   * arrastre / táctiles / textos chicos a 390 · 834 · 1024 · 1440.
//
// ⚠️ Solo lectura sobre la carpeta de fotos: se leen, nunca se escriben ni se
// mueven. Lo único que se escribe es el .xlsx descargado, en /tmp.
//
// GOTCHAS (heredados del resto de las mediciones, no tocar sin leer):
//   * Sembrar la cookie de sesión Y `sessionStorage.cxc_role`, o todo redirige
//     al login.
//   * `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//   * El encabezado de las tarjetas lleva `uppercase` POR CSS: `innerText` lo
//     devuelve en MAYÚSCULAS y compararlo tal cual da SIEMPRE false.
//
//   BASE=http://localhost:3207 node scripts/_medir-fotos-pedido.mjs
//
// El script FALLA si no encuentra el bloque de fotos, si no empareja las 203, si
// el archivo no baja o si no se puede abrir: medir cero y dar verde sin haber
// mirado nada es el peor resultado posible.

import { chromium } from "playwright";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx-js-style";
import JSZip from "jszip";

const BASE = process.env.BASE ?? "http://localhost:3207";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const FOTOS = "/Users/daniellevy/Library/CloudStorage/OneDrive-FashionGroup/Reebok/Fotos";
const MACRO = path.join(FOTOS, "1000 fiver excel.xlsm");
const TMP = process.env.TMP_DIR ?? "/tmp/fotos-pedido";
const ANCHOS = [390, 834, 1024, 1440];

mkdirSync(TMP, { recursive: true });

// ── 1. Los 203 códigos reales, en un Excel con el formato del proveedor ──────
// El Depurador lee el "Book4" de Reebok, no el Excel del macro. Se arma uno con
// los MISMOS 203 códigos, nombres, precios y piezas del archivo de Daniel para
// que la medición sea sobre su pedido de verdad.
const HEAD = ["Order", "ClientName", "PO NAME", "New Article", "Old Article ", "SKU", "PREPACK FTW",
  "Name", "Department", "CAMPAÑAS", "PRIORIDAD", "OptionName", "CurveName", "CATEGORY", "AGE GROUP",
  "COLOR NAME", "GENDER", "SELL-IN QUARTER", "SPORTS CATEGORY", "Talla", "RRP", "WholesalePrice",
  "PREVENTA", "DROP", "FW26 FINAL", "JULIO", "COMENTARIOS", "DELIVERY", "UBICACIÓN"];

function armarEntrada() {
  const wb = XLSX.read(readFileSync(MACRO), { type: "buffer" });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets["Main Sheet"], { header: 1, defval: null });
  const cab = aoa[0].map((c) => String(c ?? "").trim());
  const iCod = cab.indexOf("New Article"), iNom = cab.indexOf("Name");
  const iPre = cab.indexOf("Precio"), iPz = cab.indexOf("Piezas"), iPo = cab.indexOf("PO NAME");
  const filas = [new Array(29).fill(null), HEAD];
  const codigos = [];
  for (const r of aoa.slice(1)) {
    const cod = String(r[iCod] ?? "").trim();
    if (!cod) continue;
    codigos.push(cod);
    const f = new Array(29).fill(null);
    f[2] = String(r[iPo] ?? "ACTIVE SHOES"); f[3] = cod; f[5] = `${cod}-9`;
    f[7] = String(r[iNom] ?? ""); f[8] = "FOOTWEAR"; f[13] = "SHOES"; f[14] = "Adult";
    f[16] = "Male"; f[19] = 9; f[20] = Number(r[iPre] ?? 0) || 0;
    f[21] = Number(r[iPre] ?? 0) || 0; f[25] = Number(r[iPz] ?? 0) || 0;
    filas.push(f);
  }
  const ws = XLSX.utils.aoa_to_sheet(filas);
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, ws, "Sheet1");
  const ruta = path.join(TMP, "reebok-203.xlsx");
  XLSX.writeFile(out, ruta);
  return { ruta, codigos };
}

const { ruta: ENTRADA, codigos } = armarEntrada();

// ── 2. Las fotos que corresponden a esos códigos, de la carpeta REAL ─────────
const enCarpeta = new Map();
for (const n of readdirSync(FOTOS)) {
  const m = /^(.+)\.(jpe?g)$/i.exec(n);
  if (m) enCarpeta.set(m[1].toLowerCase(), path.join(FOTOS, n));
}
let bytesOriginales = 0;
for (const c of codigos) {
  const r = enCarpeta.get(c.toLowerCase());
  if (r) bytesOriginales += statSync(r).size;
}

// 🔴 SE LE PASA LA CARPETA ENTERA, no una selección de archivos: es lo que hace
// la persona (elige la carpeta y ya). Con `MUESTRA=1` se arma una copia por
// enlaces duros con solo las fotos del pedido + 50 ajenas, para poder medir sin
// que el navegador tenga que tragarse los 818 MB de la carpeta completa.
const MUESTRA = process.env.MUESTRA === "1";
let CARPETA_SELECCION = FOTOS;
if (MUESTRA) {
  const { linkSync, rmSync, existsSync } = await import("node:fs");
  CARPETA_SELECCION = path.join(TMP, "carpeta-muestra");
  rmSync(CARPETA_SELECCION, { recursive: true, force: true });
  mkdirSync(CARPETA_SELECCION, { recursive: true });
  const elegidas = [];
  for (const c of codigos) { const r = enCarpeta.get(c.toLowerCase()); if (r) elegidas.push(r); }
  for (const [k, r] of enCarpeta) {
    if (elegidas.length >= codigos.length + 50) break;
    if (!codigos.some((c) => c.toLowerCase() === k)) elegidas.push(r);
  }
  for (const r of elegidas) {
    const d = path.join(CARPETA_SELECCION, path.basename(r));
    if (!existsSync(d)) linkSync(r, d); // enlace duro: mismos bytes, sin copiar
  }
}

console.log(`ENTRADA  ${codigos.length} códigos · ${enCarpeta.size} .jpg en la carpeta real`);
console.log(`FOTOS    carpeta ${CARPETA_SELECCION}${MUESTRA ? " (muestra por enlaces duros)" : " (LA REAL, entera)"} · ${(bytesOriginales / 1048576).toFixed(1)} MB de originales emparejados`);

const SONDA = `(() => {
  const doc = document.documentElement;
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0"; };
  const nodos = [...document.querySelectorAll("*")].filter(visible);
  const arrastre = Math.max(0, doc.scrollWidth - doc.clientWidth);
  const tactiles = nodos.filter((el) => ["BUTTON","A","SELECT","INPUT","LABEL"].includes(el.tagName))
    .map((el) => { const r = el.getBoundingClientRect(); return { t: el.tagName, txt: (el.innerText||el.value||"").trim().slice(0,26), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((x) => x.h > 0 && x.h < 44);
  const chicos = nodos.filter((el) => el.children.length === 0 && (el.textContent||"").trim())
    .map((el) => ({ txt: el.textContent.trim().slice(0,26), px: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((x) => x.px < 12);
  const recortes = nodos.map((el) => ({ d: Math.max(0, el.scrollWidth - el.clientWidth),
      q: el.tagName + "." + String(el.className || "").split(" ").slice(0,2).join("."),
      txt: (el.innerText || "").trim().slice(0, 30) }))
    .filter((x) => x.d > 0).sort((a, b) => b.d - a.d);
  // La CAJA NUEVA, aislada: lo que importa no es cuánto texto chico hay en la
  // pantalla (el Depurador ya tenía 11 px por todos lados) sino si ESTE cambio
  // agregó alguno. Se busca por el rótulo, que va en MAYÚSCULAS por CSS pero en
  // el DOM está en minúsculas — comparar innerText tal cual daría SIEMPRE false.
  const caja = [...document.querySelectorAll("div")].find((d) =>
    [...d.children].some((c) => (c.textContent || "").trim() === "Fotos del pedido (opcional)"));
  const dentro = caja ? [...caja.querySelectorAll("*")].filter(visible) : [];
  const cajaTactiles = dentro.filter((el) => ["BUTTON","A","SELECT","INPUT","LABEL"].includes(el.tagName))
    .map((el) => { const r = el.getBoundingClientRect(); return { t: el.tagName, txt: (el.innerText||"").trim().slice(0,26), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((x) => x.h > 0 && x.h < 44);
  const cajaChicos = dentro.filter((el) => el.children.length === 0 && (el.textContent||"").trim())
    .map((el) => ({ txt: el.textContent.trim().slice(0,26), px: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((x) => x.px < 12);
  const cajaAlto = caja ? Math.round(caja.getBoundingClientRect().height) : 0;
  const cajaRecorte = dentro.map((el) => Math.max(0, el.scrollWidth - el.clientWidth)).reduce((a,b)=>Math.max(a,b),0);
  return { arrastre, recorteMax: recortes[0]?.d ?? 0, recortePeor: recortes[0] ?? null,
    tactiles, chicos, cajaTactiles, cajaChicos, cajaAlto, cajaRecorte, hayCaja: !!caja,
    texto: document.body.innerText };
})()`;

const resultados = [];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem("cxc_role", "admin"); sessionStorage.setItem("cxc_user", "medicion"); } catch {}
    // El service worker mata la hidratación si se bloquea de otra forma.
    delete Navigator.prototype.serviceWorker;
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  ⚠️ pageerror:", e.message));

  await page.goto(`${BASE}/productos/cargar`, { waitUntil: "networkidle" });

  // Cargar el Excel del proveedor.
  await page.setInputFiles('input[type="file"][accept=".xlsx,.xls"]', ENTRADA);
  await page.waitForSelector("text=Vista previa", { timeout: 30000 });

  // Salida = pedido para cliente (es la que lleva fotos).
  await page.getByRole("button", { name: "Pedido para cliente" }).click();
  await page.waitForSelector("text=Fotos del pedido", { timeout: 10000 });

  // ── ANTES de elegir carpeta: el botón dice "Descargar pedido" a secas ──────
  const antes = await page.evaluate(SONDA);
  if (!/Elegir carpeta de fotos/.test(antes.texto)) throw new Error("no aparece el botón de elegir carpeta");
  if (/Descargar pedido con fotos/.test(antes.texto)) throw new Error("dice 'con fotos' sin haber elegido carpeta");

  // ── Elegir la carpeta ─────────────────────────────────────────────────────
  const t0 = Date.now();
  await page.setInputFiles('input[aria-label="Carpeta de fotos"]', CARPETA_SELECCION);
  await page.waitForSelector("text=en la carpeta", { timeout: 60000 });
  const msCarpeta = Date.now() - t0;

  const conCarpeta = await page.evaluate(SONDA);
  const linea = (conCarpeta.texto.match(/^.*códigos? con foto.*$/m) || [""])[0].trim();
  console.log(`\nEMPAREJADO  ${linea}   (leer la carpeta tardó ${msCarpeta} ms)`);
  // El Depurador agrupa por PO + artículo y descarta los que no tienen piezas del
  // mes, así que las filas del Excel son menos que las 203 líneas del archivo del
  // macro. Lo que se exige es que NO FALTE NINGUNA foto y que sea un pedido de
  // verdad (>150 filas): un "0 de 0 · no falta ninguna" también pasaría el texto.
  const m = /(\d+) de (\d+) códigos? con foto/.exec(linea);
  if (!m) throw new Error(`no encontré el emparejado: ${linea}`);
  const [, conFotoTxt, totalTxt] = m;
  if (conFotoTxt !== totalTxt) throw new Error(`faltan fotos: ${linea}`);
  if (Number(totalTxt) < 150) throw new Error(`el pedido salió con ${totalTxt} filas, no es el caso real`);

  // ── Descargar ─────────────────────────────────────────────────────────────
  const tDesc = Date.now();
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 300000 }),
    page.getByRole("button", { name: /Descargar pedido con fotos/ }).click(),
  ]);
  const destino = path.join(TMP, "Pedido_con_fotos.xlsx");
  await descarga.saveAs(destino);
  const msTotal = Date.now() - tDesc;

  const resumen = (await page.evaluate(SONDA)).texto.match(/^Listo · .*$/m)?.[0] ?? "";
  const bytes = statSync(destino).size;
  console.log(`\nDESCARGA    ${msTotal} ms · ${(bytes / 1048576).toFixed(2)} MB`);
  console.log(`EN PANTALLA ${resumen}`);

  // ── El archivo se abre de verdad y trae las fotos adentro ──────────────────
  const buf = readFileSync(destino);
  const wb = XLSX.read(buf, { type: "buffer" });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const zip = await JSZip.loadAsync(buf);
  const medias = Object.keys(zip.files).filter((f) => f.startsWith("xl/media/"));
  const dib = await zip.file("xl/drawings/drawing1.xml")?.async("string");
  const anclas = dib ? [...dib.matchAll(/<xdr:oneCellAnchor>/g)].length : 0;
  const primeraCol = aoa[0][0];
  const noImagen = aoa.slice(1).filter((r) => r[0] === "NO IMAGEN").length;
  console.log(`ABRE        hoja "${wb.SheetNames[0]}" · ${aoa.length - 1} filas · 1ª columna "${primeraCol}"`);
  console.log(`            ${medias.length} imágenes en el ZIP · ${anclas} anclas · ${noImagen} celdas NO IMAGEN`);
  if (aoa.length - 1 < 150) throw new Error(`el Excel salió con ${aoa.length - 1} filas`);
  if (primeraCol !== "Foto") throw new Error("la primera columna no es la foto");
  if (anclas !== aoa.length - 1 - noImagen) throw new Error(`anclas ${anclas} ≠ filas con foto ${aoa.length - 1 - noImagen}`);
  if (medias.length === 0) throw new Error("el ZIP no trae ninguna imagen");
  // Los códigos siguen siendo TEXTO (si no, salen en notación científica).
  const c2 = wb.Sheets[wb.SheetNames[0]]["C2"];
  console.log(`            C2 = ${JSON.stringify(c2?.v)} (t="${c2?.t}")`);
  if (c2?.t !== "s") throw new Error("el código dejó de ser texto");

  // ── Sin carpeta: el Excel de siempre ──────────────────────────────────────
  await page.getByRole("button", { name: "Quitar fotos" }).click();
  await page.waitForSelector("text=Elegir carpeta de fotos");
  const [d2] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByRole("button", { name: /^Descargar pedido$/ }).click(),
  ]);
  const sinFotos = path.join(TMP, "Pedido_sin_fotos.xlsx");
  await d2.saveAs(sinFotos);
  const wb2 = XLSX.read(readFileSync(sinFotos), { type: "buffer" });
  const aoa2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1, defval: null });
  const zip2 = await JSZip.loadAsync(readFileSync(sinFotos));
  console.log(`\nSIN FOTOS   ${(statSync(sinFotos).size / 1024).toFixed(0)} KB · 1ª columna "${aoa2[0][0]}" · ${aoa2[0].length} columnas · media en el ZIP: ${Object.keys(zip2.files).filter((f) => f.startsWith("xl/media/")).length}`);
  if (aoa2[0][0] !== "PO NAME") throw new Error("el Excel sin fotos cambió de columnas");
  if (aoa2[0].length !== 10) throw new Error("el Excel sin fotos cambió de ancho");

  // ── Los 3 anchos (+ el iPad acostado), con la carpeta puesta ──────────────
  await page.setInputFiles('input[aria-label="Carpeta de fotos"]', CARPETA_SELECCION);
  await page.waitForSelector("text=en la carpeta");
  console.log("");
  for (const w of ANCHOS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(300);
    const m = await page.evaluate(SONDA);
    resultados.push({ w, ...m });
    if (!m.hayCaja) throw new Error(`a ${w} px no encuentro la caja de fotos`);
    console.log(`  ${String(w).padStart(4)} px  PANTALLA: arrastre ${m.arrastre} · recorte ${m.recorteMax} (${m.recortePeor?.q ?? "—"}) · táctiles<44 ${m.tactiles.length} · textos<12px ${m.chicos.length}`);
    console.log(`           CAJA NUEVA: alto ${m.cajaAlto} px · recorte ${m.cajaRecorte} · táctiles<44 ${m.cajaTactiles.length} · textos<12px ${m.cajaChicos.length}${m.cajaChicos.length ? " → " + m.cajaChicos.map((c) => `"${c.txt}" ${c.px}px`).join(" | ") : ""}`);
    if (m.cajaTactiles.length) console.log(`           ⚠️ ${m.cajaTactiles.map((t) => `${t.t} "${t.txt}" ${t.w}×${t.h}`).join(" | ")}`);
  }

  writeFileSync(path.join(TMP, "medicion.json"), JSON.stringify({ msCarpeta, msTotal, bytes, medias: medias.length, anclas, resultados }, null, 2));
  await browser.close();
  console.log(`\n🟢 OK · detalle en ${TMP}/medicion.json`);
}

main().catch((e) => { console.error("🔴", e.message); process.exit(1); });
