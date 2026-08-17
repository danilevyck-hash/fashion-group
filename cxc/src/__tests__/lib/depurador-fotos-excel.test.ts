import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import XLSX from "xlsx-js-style";
import {
  claveFoto,
  claveCodigo,
  indexarFotos,
  parearFotos,
  encajar,
  pxAEmu,
  textoEmparejado,
  TEXTO_SIN_FOTO,
  COL_FOTO,
  CAJA_FOTO_PX,
  ANCHO_CELDA_PX,
  ALTO_CELDA_PX,
} from "@/lib/depurador/fotos-excel";
import { incrustarFotosEnXlsx, type FotoParaExcel } from "@/lib/depurador/fotos-xlsx";
import { buildCatalogo, buildCatalogoAoa, REEBOK_FORMULA_A_DEFAULT, REEBOK_FORMULA_B_DEFAULT } from "@/lib/depurador/reebok";
import type { ReebokItem } from "@/lib/depurador/reebok";

const f = (name: string) => ({ name });

// ── EL EMPAREJADO ES EXACTO ─────────────────────────────────────────────────
// El riesgo caro de este módulo NO es que falte una foto (eso se ve: dice
// "NO IMAGEN"): es que le pegue al pedido la foto del artículo de al lado.
describe("fotos · el nombre se compara EXACTO", () => {
  it("clave = nombre sin extensión, en minúsculas", () => {
    expect(claveFoto("100262385.jpg")).toBe("100262385");
    expect(claveFoto("100262385.JPG")).toBe("100262385");
    expect(claveFoto("ACCB124.jpeg")).toBe("accb124");
  });

  it("tolera la carpeta adelante (webkitdirectory)", () => {
    expect(claveFoto("Fotos/100262385.jpg")).toBe("100262385");
    expect(claveFoto("Reebok\\Fotos\\100262385.jpg")).toBe("100262385");
  });

  it("no es foto: otros formatos, sin extensión y archivos ocultos", () => {
    expect(claveFoto("_LOG_catalogo_limpio.csv")).toBeNull();
    expect(claveFoto("1000 fiver excel.xlsm")).toBeNull();
    expect(claveFoto("100262385.png")).toBeNull();
    expect(claveFoto("100262385")).toBeNull();
    expect(claveFoto(".DS_Store")).toBeNull();
  });

  it("mayúsculas/minúsculas SÍ dan lo mismo", () => {
    const { indice } = indexarFotos([f("ACCB124.JPG")]);
    expect(parearFotos(["accb124"], indice).conFoto).toBe(1);
    expect(parearFotos(["ACCB124"], indice).conFoto).toBe(1);
  });

  it("🔴 NADA de parecidos: guiones, sufijos, ceros y recortes NO emparejan", () => {
    const { indice } = indexarFotos([
      f("100073063_black.jpg"),          // el sufijo NO se ignora
      f("T1A8-32600-313.jpg"),           // el guión NO se quita
      f("00100262385.jpg"),              // el cero a la izquierda NO se quita
      f("100272592.jpg"),
    ]);
    const r = parearFotos(
      ["100073063", "T1A832600313", "100262385", "10027259", "100272592"],
      indice,
    );
    // Solo el último es igualito.
    expect(r.conFoto).toBe(1);
    expect(r.pares.map((p) => p.foto?.name ?? null)).toEqual([
      null, null, null, null, "100272592.jpg",
    ]);
  });

  it("no descarta filas: un código sin foto viaja igual con foto=null", () => {
    const { indice } = indexarFotos([f("A.jpg")]);
    const r = parearFotos(["A", "B", "C"], indice);
    expect(r.pares).toHaveLength(3);
    expect(r.conFoto).toBe(1);
    expect(r.sinFoto).toBe(2);
  });

  it("indexar ignora lo que no es foto y anota los duplicados (gana el primero)", () => {
    const idx = indexarFotos([f("A.jpg"), f("a.JPG"), f("notas.txt"), f("B.jpeg")]);
    expect(idx.indice.size).toBe(2);
    expect(idx.ignorados).toBe(1);
    expect(idx.duplicados).toEqual(["a"]);
    expect(idx.indice.get("a")!.name).toBe("A.jpg");
  });

  it("claveCodigo recorta espacios (un código pegado del Excel viene con ellos)", () => {
    expect(claveCodigo("  100262385 ")).toBe("100262385");
  });
});

// ── LA CELDA VACÍA / NO IMAGEN ──────────────────────────────────────────────
const item = (art: string, po = "VIC"): ReebokItem => ({
  po, newArticle: art, sku: `${art}-7`, name: "CLUB C 85", department: "FOOTWEAR",
  category: "SHOES", ageGroup: "Adult", colorName: "", gender: "Female", sellIn: "",
  wholesale: 42.9, wholesaleOff: null, talla: "7", piezas: 2,
});
const CFG = { formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT };

describe("Excel del pedido · la columna de foto", () => {
  const rows = buildCatalogo([item("100262385"), item("999")], CFG);

  it("🔴 SIN carpeta de fotos el Excel es EXACTAMENTE el de siempre", () => {
    const aoa = buildCatalogoAoa(rows, "JULIO");
    expect(aoa[0]).toEqual([
      "PO NAME", "New Article", "Name", "Department", "CATEGORY", "AGE GROUP", "GENDER",
      "Precio A", "Precio B", "Piezas JULIO",
    ]);
    expect(aoa[0][0]).not.toBe(COL_FOTO);
    expect(aoa[1]).toHaveLength(10);
  });

  it("con fotos: 'Foto' es la PRIMERA columna, a la izquierda del código", () => {
    const aoa = buildCatalogoAoa(rows, "JULIO", () => true);
    expect(aoa[0][0]).toBe(COL_FOTO);
    expect(aoa[0][2]).toBe("New Article");
    expect(aoa[0]).toHaveLength(11);
  });

  it("sin foto la celda dice NO IMAGEN; con foto va vacía (la imagen se pega encima)", () => {
    const conFoto = new Set(["100262385"]);
    const aoa = buildCatalogoAoa(rows, "JULIO", (c) => conFoto.has(c));
    const porCodigo = new Map(aoa.slice(1).map((r) => [String(r[2]), r[0]]));
    expect(porCodigo.get("100262385")).toBe("");
    expect(porCodigo.get("999")).toBe(TEXTO_SIN_FOTO);
  });

  it("no se salta ninguna fila aunque no haya ninguna foto", () => {
    const aoa = buildCatalogoAoa(rows, "JULIO", () => false);
    expect(aoa).toHaveLength(3); // encabezado + 2 artículos
    expect(aoa.slice(1).every((r) => r[0] === TEXTO_SIN_FOTO)).toBe(true);
  });
});

// ── GEOMETRÍA ───────────────────────────────────────────────────────────────
describe("fotos · encaje en la celda", () => {
  it("una foto cuadrada llena la caja y queda centrada", () => {
    const e = encajar(600, 600);
    expect(e.ancho).toBe(CAJA_FOTO_PX);
    expect(e.alto).toBe(CAJA_FOTO_PX);
    expect(e.offsetX).toBe(Math.round((ANCHO_CELDA_PX - CAJA_FOTO_PX) / 2));
    expect(e.offsetY).toBe(Math.round((ALTO_CELDA_PX - CAJA_FOTO_PX) / 2));
  });

  it("🔴 UNA SOLA ESCALA para los dos ejes: la foto no se deforma", () => {
    const e = encajar(600, 300);
    expect(e.ancho / e.alto).toBeCloseTo(2, 5);
    expect(Math.max(e.ancho, e.alto)).toBe(CAJA_FOTO_PX);
    const v = encajar(300, 600);
    expect(v.alto / v.ancho).toBeCloseTo(2, 5);
  });

  it("nunca agranda una foto más chica que la caja", () => {
    const e = encajar(40, 20);
    expect(e.ancho).toBe(40);
    expect(e.alto).toBe(20);
  });

  it("píxeles a EMU (96 px por pulgada)", () => {
    expect(pxAEmu(96)).toBe(914400);
    expect(pxAEmu(1)).toBe(9525);
  });

  it("el texto del resumen dice cuántas encontró y cuántas faltaron", () => {
    expect(textoEmparejado(203, 203)).toContain("203 de 203");
    expect(textoEmparejado(203, 203)).toContain("no falta ninguna");
    expect(textoEmparejado(183, 203)).toContain("20 sin foto");
    expect(textoEmparejado(183, 203)).toContain(TEXTO_SIN_FOTO);
  });
});

// ── EL ZIP: se abre, tiene las partes y las imágenes son las de verdad ──────
// JPEG mínimo válido (no importa el dibujo: importa que los bytes lleguen intactos).
const JPEG_A = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const JPEG_B = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 4, 0, 0, 0xff, 0xd9]);

function libroDePrueba(filas: number): Uint8Array {
  const aoa: (string | number)[][] = [[COL_FOTO, "PO NAME", "New Article"]];
  for (let i = 0; i < filas; i++) aoa.push(["", "VIC", `10000000${i}`]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pedido");
  return new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
}

const foto = (fila: number, bytes: Uint8Array): FotoParaExcel => ({
  fila, bytes, anchoPx: 90, altoPx: 90, offsetXPx: 7, offsetYPx: 3,
});

describe("xlsx · incrustar las fotos en el archivo ya generado", () => {
  it("🔴 sin fotos devuelve los MISMOS bytes, sin reabrir el ZIP", async () => {
    const base = libroDePrueba(2);
    const salida = await incrustarFotosEnXlsx(base, []);
    expect(salida).toBe(base);
  });

  it("el archivo sigue siendo un .xlsx que se abre y conserva las celdas", async () => {
    const salida = await incrustarFotosEnXlsx(libroDePrueba(2), [foto(1, JPEG_A), foto(2, JPEG_B)]);
    const wb = XLSX.read(salida, { type: "array" });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets["Pedido"], { header: 1 }) as unknown[][];
    expect(aoa[0]).toEqual([COL_FOTO, "PO NAME", "New Article"]);
    expect(aoa[2][2]).toBe("100000001");
  });

  it("agrega las 4 partes de OOXML y los bytes de la imagen llegan intactos", async () => {
    const salida = await incrustarFotosEnXlsx(libroDePrueba(2), [foto(1, JPEG_A), foto(2, JPEG_B)]);
    const zip = await JSZip.loadAsync(salida);
    expect(zip.file("xl/media/imagen1.jpeg")).not.toBeNull();
    expect(zip.file("xl/media/imagen2.jpeg")).not.toBeNull();
    expect(zip.file("xl/drawings/drawing1.xml")).not.toBeNull();
    expect(zip.file("xl/drawings/_rels/drawing1.xml.rels")).not.toBeNull();
    expect(zip.file("xl/worksheets/_rels/sheet1.xml.rels")).not.toBeNull();

    const bytes = await zip.file("xl/media/imagen1.jpeg")!.async("uint8array");
    expect(Array.from(bytes)).toEqual(Array.from(JPEG_A));
  });

  it("la hoja apunta al dibujo y el <drawing> va al final del <worksheet>", async () => {
    const zip = await JSZip.loadAsync(await incrustarFotosEnXlsx(libroDePrueba(1), [foto(1, JPEG_A)]));
    const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    const rels = await zip.file("xl/worksheets/_rels/sheet1.xml.rels")!.async("string");
    const rid = /<drawing r:id="([^"]+)"\/><\/worksheet>/.exec(hoja)?.[1];
    expect(rid).toBeTruthy();
    expect(rels).toContain(`Id="${rid}"`);
    expect(rels).toContain("../drawings/drawing1.xml");
  });

  it("[Content_Types] declara el dibujo y el jpeg (si no, Excel lo abre dañado)", async () => {
    const zip = await JSZip.loadAsync(await incrustarFotosEnXlsx(libroDePrueba(1), [foto(1, JPEG_A)]));
    const ct = await zip.file("[Content_Types].xml")!.async("string");
    expect(ct).toContain("/xl/drawings/drawing1.xml");
    expect(ct).toContain("drawing+xml");
    expect(ct).toMatch(/Extension="jpeg"/i);
  });

  it("cada foto queda anclada a SU fila y a la primera columna, con su tamaño", async () => {
    const zip = await JSZip.loadAsync(
      await incrustarFotosEnXlsx(libroDePrueba(3), [foto(1, JPEG_A), foto(3, JPEG_B)]),
    );
    const dib = await zip.file("xl/drawings/drawing1.xml")!.async("string");
    const filas = [...dib.matchAll(/<xdr:row>(\d+)<\/xdr:row>/g)].map((m) => m[1]);
    const cols = [...dib.matchAll(/<xdr:col>(\d+)<\/xdr:col>/g)].map((m) => m[1]);
    expect(filas).toEqual(["1", "3"]);
    expect(cols).toEqual(["0", "0"]);
    // 90 px = 857250 EMU, y `noChangeAspect` impide que Excel la deforme al moverla.
    expect(dib).toContain(`<xdr:ext cx="${pxAEmu(90)}" cy="${pxAEmu(90)}"/>`);
    expect(dib).toContain('noChangeAspect="1"');
  });

  it("dos filas con la MISMA foto comparten un solo archivo dentro del ZIP", async () => {
    const compartida = JPEG_A;
    const zip = await JSZip.loadAsync(
      await incrustarFotosEnXlsx(libroDePrueba(2), [foto(1, compartida), foto(2, compartida)]),
    );
    expect(zip.file("xl/media/imagen1.jpeg")).not.toBeNull();
    expect(zip.file("xl/media/imagen2.jpeg")).toBeNull();
    const dib = await zip.file("xl/drawings/drawing1.xml")!.async("string");
    expect([...dib.matchAll(/r:embed="rId1"/g)]).toHaveLength(2);
  });

  it("no pisa un dibujo ajeno: si la hoja ya tenía uno, corta con mensaje", async () => {
    const base = libroDePrueba(1);
    const conDibujo = await incrustarFotosEnXlsx(base, [foto(1, JPEG_A)]);
    await expect(incrustarFotosEnXlsx(conDibujo, [foto(1, JPEG_B)])).rejects.toThrow(/dibujo/i);
  });
});

// ── LA CARPETA REAL (si está disponible en esta máquina) ────────────────────
// El pareo se mide contra los NOMBRES reales de la carpeta de Reebok. Si la
// carpeta no está (CI), el bloque se salta en vez de dar verde por nada.
const CARPETA = "/Users/daniellevy/Library/CloudStorage/OneDrive-FashionGroup/Reebok/Fotos";
const hayCarpeta = (() => {
  try { readFileSync(`${CARPETA}/_LOG_catalogo_limpio.csv`); return true; } catch { return false; }
})();

describe.runIf(hayCarpeta)("carpeta real de Reebok", () => {
  it("los 203 códigos del Excel de Daniel emparejan por nombre exacto", async () => {
    const { readdirSync } = await import("node:fs");
    const archivos = readdirSync(CARPETA).map((name) => ({ name }));
    const { indice, ignorados } = indexarFotos(archivos);
    expect(indice.size).toBeGreaterThan(4000);
    expect(ignorados).toBeGreaterThan(0); // el .csv y el .xlsm de la carpeta

    const wb = XLSX.read(readFileSync(`${CARPETA}/1000 fiver excel.xlsm`), { type: "buffer" });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets["Main Sheet"], { header: 1, defval: null }) as unknown[][];
    expect(aoa[0]).toEqual(["NO IMAGEN", "New Article", "Name", "Precio ", "Piezas ", "PO NAME"]);
    const codigos = aoa.slice(1).map((r) => String(r[1] ?? "").trim()).filter(Boolean);

    const r = parearFotos(codigos, indice);
    expect(r.pares).toHaveLength(203);
    expect(r.conFoto).toBe(203);
    expect(r.sinFoto).toBe(0);
  });
});
