// "Fotos a mi Excel" — medido EN EL NAVEGADOR, contra el build de producción,
// con el ARCHIVO REAL de Daniel (`1000 fiver excel.xlsm`, 203 filas, con macro)
// y la CARPETA REAL (`~/…/Reebok/Fotos`, 4.744 .jpg).
//
// Qué mide, y por qué cada cosa:
//   * msCarpeta — cuánto tarda en leer la carpeta y emparejar.
//   * msTotal   — del clic a que el archivo baja. Es lo que la persona espera.
//   * MB        — cuánto pesa. 203 fotos de cámara sin achicar dan ~20 MB y el
//                 archivo sería imposible de mandar por correo.
//   * abre      — el archivo se vuelve a abrir con la librería de Excel Y con
//                 JSZip: se comparan TODAS las celdas fuera de la columna A
//                 contra el original, y se verifica que el MACRO siga adentro.
//   * arrastre / recorte / táctiles<44 / textos<12px a 390 · 834 · 1024 · 1440.
//
// ⚠️ SOLO LECTURA sobre la carpeta y sobre el .xlsm de Daniel: se leen, nunca se
// escriben ni se mueven. Lo único que se escribe es la descarga, en /tmp.
//
// GOTCHAS (heredados, no tocar sin leer):
//   * Sembrar la cookie de sesión Y `sessionStorage.cxc_role`, o todo redirige
//     al login.
//   * `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//   * Los rótulos llevan `uppercase` POR CSS: `innerText` los devuelve en
//     MAYÚSCULAS y compararlos tal cual da SIEMPRE false.
//
//   BASE=http://localhost:3208 node scripts/_medir-excel-propio.mjs
//   MUESTRA=1 → carpeta reducida por enlaces duros (mismos bytes, más rápido).
//
// El script FALLA si no encuentra el archivo cargado, si falta alguna foto, si
// el archivo no baja, si el macro no viaja o si alguna celda fuera de la columna
// A cambió: medir cero y dar verde sin haber mirado nada es el peor resultado.

import { chromium } from "playwright";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx-js-style";
import JSZip from "jszip";

const BASE = process.env.BASE ?? "http://localhost:3208";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const FOTOS = path.join(process.env.HOME, "Library/CloudStorage/OneDrive-FashionGroup/Reebok/Fotos");
const LIBRO = path.join(FOTOS, "1000 fiver excel.xlsm");
const TMP = process.env.TMP_DIR ?? "/tmp/excel-propio";
const ANCHOS = [390, 834, 1024, 1440];
mkdirSync(TMP, { recursive: true });

// ── la carpeta que se le pasa al navegador ──────────────────────────────────
const enCarpeta = new Map();
for (const n of readdirSync(FOTOS)) {
  const m = /^(.+)\.(jpe?g)$/i.exec(n);
  if (m) enCarpeta.set(m[1].toLowerCase(), path.join(FOTOS, n));
}
const wbEntrada = XLSX.read(readFileSync(LIBRO), { type: "buffer" });
const aoaEntrada = XLSX.utils.sheet_to_json(wbEntrada.Sheets[wbEntrada.SheetNames[0]], { header: 1, defval: null });
const codigos = aoaEntrada.slice(1).map((r) => String(r[1] ?? "").trim()).filter(Boolean);
let bytesOriginales = 0;
for (const c of codigos) { const r = enCarpeta.get(c.toLowerCase()); if (r) bytesOriginales += statSync(r).size; }

const MUESTRA = process.env.MUESTRA === "1";
let CARPETA = FOTOS;
if (MUESTRA) {
  const { linkSync, rmSync, existsSync } = await import("node:fs");
  CARPETA = path.join(TMP, "carpeta-muestra");
  rmSync(CARPETA, { recursive: true, force: true });
  mkdirSync(CARPETA, { recursive: true });
  const elegidas = [];
  for (const c of codigos) { const r = enCarpeta.get(c.toLowerCase()); if (r && !elegidas.includes(r)) elegidas.push(r); }
  for (const [k, r] of enCarpeta) {
    if (elegidas.length >= codigos.length + 50) break;
    if (!codigos.some((c) => c.toLowerCase() === k)) elegidas.push(r);
  }
  for (const r of elegidas) {
    const d = path.join(CARPETA, path.basename(r));
    if (!existsSync(d)) linkSync(r, d);
  }
}

console.log(`ENTRADA  ${path.basename(LIBRO)} · ${codigos.length} códigos en la columna B · ${(statSync(LIBRO).size / 1048576).toFixed(2)} MB`);
console.log(`FOTOS    ${CARPETA}${MUESTRA ? " (muestra por enlaces duros)" : " (LA REAL, entera)"} · ${enCarpeta.size} .jpg · ${(bytesOriginales / 1048576).toFixed(1)} MB de originales emparejados`);

const SONDA = `(() => {
  const doc = document.documentElement;
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0"; };
  const nodos = [...document.querySelectorAll("*")].filter(visible);
  const arrastre = Math.max(0, doc.scrollWidth - doc.clientWidth);
  const tactiles = nodos.filter((el) => ["BUTTON","A","SELECT","INPUT","LABEL"].includes(el.tagName))
    .map((el) => { const r = el.getBoundingClientRect(); return { t: el.tagName, txt: (el.innerText||el.value||"").trim().slice(0,30), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((x) => x.h > 0 && x.h < 44);
  const chicos = nodos.filter((el) => el.children.length === 0 && (el.textContent||"").trim())
    .map((el) => ({ txt: el.textContent.trim().slice(0,30), px: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((x) => x.px < 12);
  const recortes = nodos.map((el) => ({ d: Math.max(0, el.scrollWidth - el.clientWidth),
      q: el.tagName + "." + String(el.className || "").split(" ").slice(0,2).join("."),
      txt: (el.innerText || "").trim().slice(0, 30) }))
    .filter((x) => x.d > 0).sort((a, b) => b.d - a.d);
  return { arrastre, recorteMax: recortes[0]?.d ?? 0, recortePeor: recortes[0] ?? null,
    tactiles, chicos, texto: document.body.innerText };
})()`;

/** Todas las celdas de la hoja, por fila y columna, tal cual el XML. */
async function celdasDeLaHoja(buf) {
  const zip = await JSZip.loadAsync(buf);
  const wbXml = await zip.file("xl/workbook.xml").async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wbXml)[1];
  const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)[1];
  const ruta = `xl/${target.replace(/^\/?xl\//, "").replace(/^\.\//, "")}`;
  const xml = await zip.file(ruta).async("string");
  const data = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml)[1];
  const filas = new Map();
  for (const m of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const n = Number(/\br="(\d+)"/.exec(m[1])?.[1] ?? "0");
    if (!n) continue;
    const celdas = new Map();
    for (const c of (m[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)(\d+)"/.exec(c[1]);
      if (!ref) continue;
      celdas.set(ref[1], c[0]);
    }
    filas.set(n, celdas);
  }
  return { zip, filas, ruta };
}

const resultados = [];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem("cxc_role", "admin"); sessionStorage.setItem("cxc_user", "medicion"); } catch {}
    delete Navigator.prototype.serviceWorker;
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  ⚠️ pageerror:", e.message));

  await page.goto(`${BASE}/productos/cargar?tab=misfotos`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Cómo tiene que estar tu archivo", { timeout: 20000 });

  // ── 1. subir el Excel propio ──────────────────────────────────────────────
  const t0 = Date.now();
  await page.setInputFiles('input[type="file"][accept=".xlsx,.xlsm"]', LIBRO);
  await page.waitForSelector("text=códigos en la columna B", { timeout: 30000 });
  const msLeer = Date.now() - t0;
  const trasSubir = await page.evaluate(SONDA);
  const lineaLeida = (trasSubir.texto.match(/^.*códigos en la\s*$/m) || trasSubir.texto.match(/^.*columna B.*$/m) || [""])[0].trim();
  console.log(`\nLEÍDO       ${msLeer} ms · ${lineaLeida.replace(/\s+/g, " ")}`);
  const nCod = Number((trasSubir.texto.match(/(\d+)\s*códigos en la/) || [])[1] ?? 0);
  if (nCod !== codigos.length) throw new Error(`la pantalla leyó ${nCod} códigos y el archivo tiene ${codigos.length}`);

  // ── 2. lo que la pantalla DICE antes de descargar ─────────────────────────
  const debeDecir = [
    /Solo cambia la columna A/,
    /NO IMAGEN/,
    /Si ordenas la hoja, las fotos no se mueven/,
    /filtras/,
    /tiene macros y se conservan/,
    /no se suben a ningún lado/,
    /ya tiene fotos pegadas/, // este archivo YA pasó por el macro
  ];
  for (const re of debeDecir) {
    if (!re.test(trasSubir.texto)) throw new Error(`la pantalla no dice: ${re}`);
  }
  console.log(`AVISOS      ${debeDecir.length} de ${debeDecir.length} en pantalla ✓`);

  // ── 3. carpeta de fotos ───────────────────────────────────────────────────
  const t1 = Date.now();
  await page.setInputFiles('input[aria-label="Carpeta de fotos de mi Excel"]', CARPETA);
  await page.waitForSelector("text=en la carpeta", { timeout: 120000 });
  const msCarpeta = Date.now() - t1;
  const conCarpeta = await page.evaluate(SONDA);
  const linea = (conCarpeta.texto.match(/^.*códigos? con foto.*$/m) || [""])[0].trim();
  console.log(`EMPAREJADO  ${linea}   (leer la carpeta tardó ${msCarpeta} ms)`);
  const m = /(\d+) de (\d+) códigos? con foto/.exec(linea);
  if (!m) throw new Error(`no encontré el emparejado: ${linea}`);
  if (m[1] !== m[2]) throw new Error(`faltan fotos: ${linea}`);
  if (Number(m[2]) !== codigos.length) throw new Error(`emparejó ${m[2]} y el archivo tiene ${codigos.length}`);

  // ── 4. descargar ──────────────────────────────────────────────────────────
  const tDesc = Date.now();
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 600000 }),
    page.getByRole("button", { name: /Descargar con las fotos pegadas/ }).click(),
  ]);
  const nombre = descarga.suggestedFilename();
  const destino = path.join(TMP, nombre);
  await descarga.saveAs(destino);
  const msTotal = Date.now() - tDesc;
  const resumen = (await page.evaluate(SONDA)).texto.match(/^Listo · .*$/m)?.[0] ?? "";
  const bytes = statSync(destino).size;
  console.log(`\nDESCARGA    "${nombre}" · ${msTotal} ms · ${(bytes / 1048576).toFixed(2)} MB`);
  console.log(`EN PANTALLA ${resumen}`);
  if (!nombre.endsWith(".xlsm")) throw new Error(`el archivo bajó como ${nombre}: el macro se perdió`);

  // ── 5. el archivo se abre y es el MISMO salvo la columna A ────────────────
  const buf = readFileSync(destino);
  const orig = await celdasDeLaHoja(readFileSync(LIBRO));
  const sal = await celdasDeLaHoja(buf);

  const vbaA = await orig.zip.file("xl/vbaProject.bin")?.async("uint8array");
  const vbaB = await sal.zip.file("xl/vbaProject.bin")?.async("uint8array");
  if (!vbaB) throw new Error("el macro (vbaProject.bin) NO viajó");
  if (Buffer.compare(Buffer.from(vbaA), Buffer.from(vbaB)) !== 0) throw new Error("el macro CAMBIÓ");
  console.log(`MACRO       vbaProject.bin ${vbaB.byteLength.toLocaleString()} bytes, byte por byte idéntico ✓`);

  const ordenA = [...orig.filas.keys()].join(",");
  const ordenB = [...sal.filas.keys()].join(",");
  if (ordenA !== ordenB) throw new Error("el orden de las filas cambió");
  let iguales = 0, distintas = 0;
  for (const [fila, cs] of orig.filas) {
    const otras = sal.filas.get(fila);
    for (const [col, xml] of cs) {
      if (col === "A") continue;
      if (otras.get(col) !== xml) { distintas++; if (distintas <= 3) console.log(`  🔴 celda ${col}${fila}`); }
      else iguales++;
    }
  }
  if (distintas > 0) throw new Error(`${distintas} celdas fuera de la columna A cambiaron`);
  console.log(`IDÉNTICO    ${iguales.toLocaleString()} celdas fuera de la columna A · ${orig.filas.size} filas en el mismo orden ✓`);

  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const noImagen = aoa.slice(1).filter((r) => r[0] === "NO IMAGEN").length;
  const medias = Object.keys(sal.zip.files).filter((f) => f.startsWith("xl/media/") && f.endsWith(".jpeg"));
  const dib = await sal.zip.file("xl/drawings/drawing1.xml")?.async("string");
  const anclas = dib ? [...dib.matchAll(/<xdr:oneCellAnchor>/g)].length : 0;
  console.log(`ABRE        hoja "${wb.SheetNames[0]}" · ${aoa.length - 1} filas · ${medias.length} imágenes · ${anclas} anclas (oneCellAnchor) · ${noImagen} celdas NO IMAGEN`);
  if (wb.SheetNames.length !== wbEntrada.SheetNames.length) throw new Error("cambió el número de hojas");
  if (aoa.length - 1 !== aoaEntrada.length - 1) throw new Error("cambió el número de filas");
  if (anclas !== codigos.length - noImagen) throw new Error(`anclas ${anclas} ≠ filas con foto ${codigos.length - noImagen}`);
  if (dib && /twoCellAnchor/.test(dib)) throw new Error("quedó el dibujo viejo del macro");
  if (String(ws["B2"]?.v) !== String(aoaEntrada[1][1])) throw new Error("el código de la fila 2 cambió");
  console.log(`            B2 = ${JSON.stringify(ws["B2"]?.v)} (t="${ws["B2"]?.t}") · C2 = ${JSON.stringify(ws["C2"]?.v)} · D2 = ${JSON.stringify(ws["D2"]?.v)}`);

  // una miniatura es un JPEG de verdad
  const mini = await sal.zip.file(medias[0]).async("uint8array");
  if (!(mini[0] === 0xff && mini[1] === 0xd8)) throw new Error("la miniatura no es un JPEG");
  console.log(`            miniatura ${medias[0]} · ${(mini.byteLength / 1024).toFixed(1)} KB · JPEG ✓ (originales ${(bytesOriginales / 1048576).toFixed(1)} MB → ${(bytes / 1048576).toFixed(2)} MB)`);

  // ── 6. los 3 anchos (+ el iPad acostado) ──────────────────────────────────
  console.log("");
  for (const w of ANCHOS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(300);
    const r = await page.evaluate(SONDA);
    resultados.push({ w, ...r });
    if (!/Descargar con las fotos pegadas/.test(r.texto)) throw new Error(`a ${w} px no encuentro el botón de descargar`);
    if (!/Solo cambia la columna A/.test(r.texto)) throw new Error(`a ${w} px no encuentro los avisos`);
    console.log(`  ${String(w).padStart(4)} px  arrastre ${r.arrastre} · recorte ${r.recorteMax} (${r.recortePeor?.q ?? "—"}) · táctiles<44 ${r.tactiles.length}${r.tactiles.length ? " → " + r.tactiles.map((t) => `${t.t} "${t.txt}" ${t.w}×${t.h}`).join(" | ") : ""} · textos<12px ${r.chicos.length}${r.chicos.length ? " → " + r.chicos.map((c) => `"${c.txt}" ${c.px}px`).join(" | ") : ""}`);
  }

  writeFileSync(path.join(TMP, "medicion.json"), JSON.stringify({ msLeer, msCarpeta, msTotal, bytes, medias: medias.length, anclas, resultados }, null, 2));
  await browser.close();
  console.log(`\n🟢 OK · detalle en ${TMP}/medicion.json`);
}

main().catch((e) => { console.error("🔴", e.message); process.exit(1); });
