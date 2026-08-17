/**
 * Verifica el camino "subo MI Excel y le pegan las fotos" contra los archivos
 * REALES de Daniel, sin tocar nada de producción.
 *
 *   npx tsx scripts/_verif-excel-propio.ts \
 *     "~/Library/CloudStorage/OneDrive-FashionGroup/Reebok/Fotos/1000 fiver excel.xlsm" \
 *     "~/Library/CloudStorage/OneDrive-FashionGroup/Reebok/Fotos"
 *
 * Lo que prueba, que es lo único que importa acá:
 *   1. el `vbaProject.bin` (el MACRO) sale byte por byte igual que entró
 *   2. TODA entrada del zip que no sea la hoja, el dibujo, las imágenes o el
 *      [Content_Types] sale byte por byte igual
 *   3. en la hoja, TODA celda que no sea de la columna A sale carácter por
 *      carácter igual — mismas filas, mismo orden, mismos valores
 *   4. cada foto quedó anclada a la fila de SU código
 *
 * ⚠️ El achicado acá lo hace `sharp` porque `compressImage` es de navegador
 * (canvas). Eso NO es una segunda regla: el emparejado, la geometría y el
 * armado del zip son los MISMOS módulos que corre la pantalla. Lo que este
 * script no puede probar es el compresor, y eso se mide en el navegador.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { indexarFotos, parearFotos, encajar, textoEmparejado } from "../src/lib/depurador/fotos-excel";
import {
  leerSharedStrings,
  resolverHojas,
  leerHoja,
  medirCeldaFoto,
  cajaDeFila,
  escribirColumnaFoto,
  hojaTieneDibujo,
  columnaDeRef,
  type PlanCeldaFoto,
} from "../src/lib/depurador/excel-propio";
import { incrustarFotosEnXlsx, type FotoParaExcel } from "../src/lib/depurador/fotos-xlsx";

const LADO_PX = 300;
const CALIDAD = 0.72;

const expandir = (p: string) => (p.startsWith("~") ? p.replace(/^~/, process.env.HOME ?? "") : p);

function celdasPorFila(sheetXml: string): Map<number, Map<number, string>> {
  const out = new Map<number, Map<number, string>>();
  const data = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(sheetXml)?.[1] ?? "";
  for (const m of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const n = Number(/\br="(\d+)"/.exec(m[1])?.[1] ?? "0");
    if (!n) continue;
    const celdas = new Map<number, string>();
    for (const c of (m[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
      if (!ref) continue;
      celdas.set(columnaDeRef(ref), c[0]);
    }
    out.set(n, celdas);
  }
  return out;
}

async function main() {
  const rutaLibro = expandir(process.argv[2] ?? "");
  const rutaFotos = expandir(process.argv[3] ?? "");
  if (!rutaLibro || !rutaFotos) {
    console.error("Uso: _verif-excel-propio.ts <archivo.xlsm> <carpeta de fotos>");
    process.exit(1);
  }

  const t0 = Date.now();
  const bytesEntrada = readFileSync(rutaLibro);
  const zipEntrada = await JSZip.loadAsync(bytesEntrada);

  const wbXml = await zipEntrada.file("xl/workbook.xml")!.async("string");
  const wbRels = await zipEntrada.file("xl/_rels/workbook.xml.rels")!.async("string");
  const hojas = resolverHojas(wbXml, wbRels);
  const hoja = hojas[0];
  const sheetXml = await zipEntrada.file(hoja.ruta)!.async("string");
  const sst = leerSharedStrings(await zipEntrada.file("xl/sharedStrings.xml")?.async("string"));
  const lectura = leerHoja(sheetXml, sst);
  const geo = medirCeldaFoto(sheetXml);
  const tieneMacro = !!zipEntrada.file("xl/vbaProject.bin");

  console.log(`\n📄 ${basename(rutaLibro)}`);
  console.log(`   hojas: ${hojas.length} → se usa «${hoja.nombre}» (${hoja.ruta})`);
  console.log(`   encabezado columna B: «${lectura.encabezadoCodigo}» · columna A: «${lectura.encabezadoFoto}»`);
  console.log(`   códigos en B: ${lectura.filas.length} · filas sin código: ${lectura.filasSinCodigo.length}`);
  console.log(`   celdas A ya escritas: ${lectura.filasConAOcupada.length}`);
  console.log(`   celda de la foto: ${geo.anchoPx}×${geo.altoPorFila.get(2) ?? geo.altoDefectoPx} px`);
  console.log(`   ¿ya tenía fotos pegadas?: ${hojaTieneDibujo(sheetXml) ? "SÍ (se reemplazan)" : "no"}`);
  console.log(`   ¿tiene macro?: ${tieneMacro ? "SÍ (vbaProject.bin)" : "no"}`);

  // ── emparejado: los MISMOS módulos que la pantalla ───────────────────────
  const tIdx = Date.now();
  const archivos = readdirSync(rutaFotos).map((name) => ({ name }));
  const { indice, ignorados } = indexarFotos(archivos);
  const emparejado = parearFotos(lectura.filas.map((f) => f.codigo), indice);
  const msIndice = Date.now() - tIdx;
  console.log(`\n🖼  carpeta: ${archivos.length.toLocaleString()} archivos · ${indice.size.toLocaleString()} fotos · ${ignorados} ignorados (${msIndice} ms)`);
  console.log(`   ${textoEmparejado(emparejado.conFoto, emparejado.pares.length)}`);

  // ── achicado (acá con sharp; en la app, compressImage) ────────────────────
  const tComp = Date.now();
  const yaHecha = new Map<string, { bytes: Uint8Array; w: number; h: number }>();
  const fotos: FotoParaExcel[] = [];
  const anclaEsperada = new Map<number, string>(); // fila 0-based → código
  let bytesFotos = 0;
  for (let i = 0; i < emparejado.pares.length; i++) {
    const par = emparejado.pares[i];
    if (!par.foto) continue;
    let listo = yaHecha.get(par.foto.name);
    if (!listo) {
      const buf = await sharp(join(rutaFotos, par.foto.name))
        .resize({ width: LADO_PX, height: LADO_PX, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: Math.round(CALIDAD * 100) })
        .toBuffer();
      const meta = await sharp(buf).metadata();
      listo = { bytes: new Uint8Array(buf), w: meta.width ?? LADO_PX, h: meta.height ?? LADO_PX };
      yaHecha.set(par.foto.name, listo);
      bytesFotos += listo.bytes.byteLength;
    }
    const filaExcel = lectura.filas[i].fila;
    const c = cajaDeFila(geo, filaExcel);
    const enc = encajar(listo.w, listo.h, c.caja, c.ancho, c.alto);
    fotos.push({
      fila: filaExcel - 1, // OOXML ancla por fila 0-based
      bytes: listo.bytes,
      anchoPx: enc.ancho,
      altoPx: enc.alto,
      offsetXPx: enc.offsetX,
      offsetYPx: enc.offsetY,
    });
    anclaEsperada.set(filaExcel - 1, par.codigo);
  }
  const msComp = Date.now() - tComp;

  // ── escritura ─────────────────────────────────────────────────────────────
  const plan = new Map<number, PlanCeldaFoto>();
  for (const par of emparejado.pares) void par;
  for (let i = 0; i < emparejado.pares.length; i++) {
    plan.set(lectura.filas[i].fila, emparejado.pares[i].foto ? "vacia" : "sin-foto");
  }
  const sheetNuevo = escribirColumnaFoto(sheetXml, plan);
  zipEntrada.file(hoja.ruta, sheetNuevo);
  const intermedio = await zipEntrada.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const salida = await incrustarFotosEnXlsx(intermedio, fotos, {
    hoja: hoja.ruta,
    columna: 0,
    reemplazarDibujo: true,
  });
  const msTotal = Date.now() - t0;

  const destino = join("/tmp", `verif-${basename(rutaLibro)}`);
  writeFileSync(destino, salida);
  console.log(`\n⏱  achicado ${msComp} ms · total ${msTotal} ms`);
  console.log(`📦 ${(bytesEntrada.byteLength / 1048576).toFixed(2)} MB → ${(salida.byteLength / 1048576).toFixed(2)} MB · miniaturas ${(bytesFotos / 1048576).toFixed(2)} MB · ${destino}`);

  // ── VERIFICACIÓN ──────────────────────────────────────────────────────────
  const zipOriginal = await JSZip.loadAsync(readFileSync(rutaLibro));
  const zipSalida = await JSZip.loadAsync(salida);
  const fallas: string[] = [];

  // 1. el macro
  const vbaA = await zipOriginal.file("xl/vbaProject.bin")?.async("uint8array");
  const vbaB = await zipSalida.file("xl/vbaProject.bin")?.async("uint8array");
  if (tieneMacro) {
    if (!vbaB) fallas.push("🔴 el macro (vbaProject.bin) NO está en la salida");
    else if (Buffer.compare(Buffer.from(vbaA!), Buffer.from(vbaB)) !== 0) fallas.push("🔴 el macro cambió");
    else console.log(`\n✅ MACRO intacto — vbaProject.bin ${vbaB.byteLength.toLocaleString()} bytes, idéntico`);
  }

  // 2. todas las demás entradas
  const tocadas = new Set([hoja.ruta, "[Content_Types].xml"]);
  const nombresOrig: string[] = [];
  zipOriginal.forEach((p, e) => { if (!e.dir) nombresOrig.push(p); });
  const nombresSal: string[] = [];
  zipSalida.forEach((p, e) => { if (!e.dir) nombresSal.push(p); });
  let iguales = 0;
  for (const p of nombresOrig) {
    if (tocadas.has(p) || p.startsWith("xl/media/") || p.startsWith("xl/drawings/")) continue;
    const a = await zipOriginal.file(p)!.async("uint8array");
    const b = await zipSalida.file(p)?.async("uint8array");
    if (!b) { fallas.push(`🔴 falta en la salida: ${p}`); continue; }
    if (Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0) fallas.push(`🔴 cambió: ${p}`);
    else iguales++;
  }
  console.log(`✅ ${iguales} partes del archivo salen byte por byte iguales (de ${nombresOrig.length} entradas)`);

  // 3. la hoja, celda por celda, salvo la columna A
  const antes = celdasPorFila(sheetXml);
  const despues = celdasPorFila(await zipSalida.file(hoja.ruta)!.async("string"));
  if (antes.size !== despues.size) fallas.push(`🔴 el número de filas cambió: ${antes.size} → ${despues.size}`);
  const ordenAntes = [...antes.keys()];
  const ordenDespues = [...despues.keys()];
  if (ordenAntes.join(",") !== ordenDespues.join(",")) fallas.push("🔴 el ORDEN de las filas cambió");
  let celdasIguales = 0;
  let celdasDistintas = 0;
  for (const [fila, cs] of antes) {
    const otras = despues.get(fila);
    if (!otras) { fallas.push(`🔴 desapareció la fila ${fila}`); continue; }
    for (const [col, xml] of cs) {
      if (col === 0) continue;
      if (otras.get(col) !== xml) { celdasDistintas++; if (celdasDistintas <= 3) fallas.push(`🔴 celda cambiada fila ${fila} col ${col}`); }
      else celdasIguales++;
    }
    for (const col of otras.keys()) {
      if (col !== 0 && !cs.has(col)) fallas.push(`🔴 celda NUEVA fila ${fila} col ${col}`);
    }
  }
  console.log(`✅ ${celdasIguales.toLocaleString()} celdas fuera de la columna A idénticas · ${celdasDistintas} distintas · ${ordenAntes.length} filas en el mismo orden`);

  // 4. la columna A dice lo que tiene que decir
  let conFoto = 0;
  let sinFoto = 0;
  for (let i = 0; i < emparejado.pares.length; i++) {
    const fila = lectura.filas[i].fila;
    const cel = despues.get(fila)?.get(0) ?? "";
    if (emparejado.pares[i].foto) {
      if (/NO IMAGEN/.test(cel)) fallas.push(`🔴 fila ${fila} tiene foto y dice NO IMAGEN`);
      else conFoto++;
    } else {
      if (!/NO IMAGEN/.test(cel)) fallas.push(`🔴 fila ${fila} NO tiene foto y no dice NO IMAGEN`);
      else sinFoto++;
    }
  }
  console.log(`✅ columna A: ${conFoto} celdas con foto · ${sinFoto} dicen NO IMAGEN`);

  // 5. las anclas caen en la fila de su código
  const dib = await zipSalida.file("xl/drawings/drawing1.xml")?.async("string");
  const filasAncladas = dib ? [...dib.matchAll(/<xdr:row>(\d+)<\/xdr:row>/g)].map((m) => Number(m[1])) : [];
  const anclasOk = filasAncladas.every((f) => anclaEsperada.has(f));
  const mediaSalida = nombresSal.filter((p) => p.startsWith("xl/media/"));
  console.log(`✅ ${filasAncladas.length} anclas (oneCellAnchor: ${(dib?.match(/oneCellAnchor/g)?.length ?? 0) / 2}) · ${mediaSalida.length} imágenes en el zip · cada ancla en la fila de su código: ${anclasOk ? "sí" : "NO"}`);
  if (!anclasOk) fallas.push("🔴 hay anclas en filas que no corresponden");
  if (filasAncladas.length !== fotos.length) fallas.push(`🔴 anclas ${filasAncladas.length} ≠ fotos ${fotos.length}`);
  if (dib && /twoCellAnchor/.test(dib)) fallas.push("🔴 quedó un twoCellAnchor del dibujo viejo");

  console.log(fallas.length === 0 ? "\n🟢 TODO OK\n" : `\n🔴 ${fallas.length} FALLAS:\n${fallas.slice(0, 20).join("\n")}\n`);
  process.exit(fallas.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
