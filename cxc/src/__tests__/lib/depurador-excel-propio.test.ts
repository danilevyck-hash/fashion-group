// Candado del camino "subo MI Excel y le pegan las fotos".
//
// 🔴 NO BUSCA TEXTO EN ARCHIVOS: arma libros de verdad, los pasa por los mismos
// módulos que corre la pantalla, los vuelve a abrir con JSZip y con la librería
// de Excel, y lee las celdas y las anclas. La promesa de este camino —"tu
// archivo vuelve igual salvo la columna A"— no se puede probar leyendo código.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import XLSX from "xlsx-js-style";
import {
  COL_CODIGO_INDICE,
  COL_FOTO_INDICE,
  anchoColumnaAPx,
  altoPuntosAPx,
  cajaDeFila,
  columnaDeRef,
  escribirColumnaFoto,
  extensionAceptada,
  filaAnclaDe,
  hojaTieneDibujo,
  planColumnaFoto,
  leerHoja,
  leerSharedStrings,
  letraDeColumna,
  medirCeldaFoto,
  nombreDeSalida,
  resolverHojas,
  type PlanCeldaFoto,
} from "@/lib/depurador/excel-propio";
import { incrustarFotosEnXlsx, type FotoParaExcel } from "@/lib/depurador/fotos-xlsx";
import { indexarFotos, parearFotos, encajar, TEXTO_SIN_FOTO } from "@/lib/depurador/fotos-excel";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

/** Una hoja mínima, escrita a mano para poder poner los casos que engañan. */
function hoja(filas: string, extra = ""): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:F10"/>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols><col min="1" max="1" width="14" customWidth="1"/></cols>` +
    `<sheetData>${filas}</sheetData>${extra}</worksheet>`
  );
}

describe("excel propio · el código sale de la columna B y de ninguna otra", () => {
  const sst = ["New Article", "AAA-1", "BBB-2", "no soy un codigo"];

  it("lee la B, ignora la A y las demás columnas", () => {
    const xml = hoja(
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>0</v></c></row>` +
        `<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>1</v></c><c r="C2" t="s"><v>2</v></c></row>` +
        `<row r="3"><c r="B3" t="s"><v>2</v></c></row>`,
    );
    const l = leerHoja(xml, sst);
    expect(l.filas).toEqual([
      { fila: 2, codigo: "AAA-1" },
      { fila: 3, codigo: "BBB-2" },
    ]);
    expect(COL_CODIGO_INDICE).toBe(1); // B
    expect(COL_FOTO_INDICE).toBe(0); // A
  });

  it("🔴 la fila 1 es encabezado y NO se lee como código", () => {
    const l = leerHoja(hoja(`<row r="1"><c r="B1" t="s"><v>0</v></c></row>`), sst);
    expect(l.filas).toHaveLength(0);
    expect(l.encabezadoCodigo).toBe("New Article");
  });

  it("un código numérico sale con el texto EXACTO del archivo (nada de notación científica)", () => {
    const l = leerHoja(hoja(`<row r="2"><c r="B2"><v>100272098</v></c></row>`), sst);
    expect(l.filas[0].codigo).toBe("100272098");
  });

  it("lee texto en línea y resultado de fórmula", () => {
    const l = leerHoja(
      hoja(
        `<row r="2"><c r="B2" t="inlineStr"><is><t>T1A8-32600-313</t></is></c></row>` +
          `<row r="3"><c r="B3" t="str"><v>ABC1</v></c></row>`,
      ),
      sst,
    );
    expect(l.filas.map((f) => f.codigo)).toEqual(["T1A8-32600-313", "ABC1"]);
  });

  it("una fila sin código en B se anota aparte y no se toca", () => {
    const l = leerHoja(
      hoja(`<row r="2"><c r="C2" t="s"><v>2</v></c></row><row r="3"><c r="B3" t="s"><v>1</v></c></row>`),
      sst,
    );
    expect(l.filasSinCodigo).toEqual([2]);
    expect(l.filas).toEqual([{ fila: 3, codigo: "AAA-1" }]);
  });

  it("avisa qué celdas de la columna A ya tienen algo escrito", () => {
    const l = leerHoja(
      hoja(`<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>1</v></c></row>`),
      sst,
    );
    expect(l.filasConAOcupada).toEqual([2]);
  });

  it("letras y números de columna van y vuelven", () => {
    expect(columnaDeRef("A1")).toBe(0);
    expect(columnaDeRef("B12")).toBe(1);
    expect(columnaDeRef("AA3")).toBe(26);
    expect(letraDeColumna(0)).toBe("A");
    expect(letraDeColumna(26)).toBe("AA");
  });
});

describe("excel propio · lo ÚNICO que cambia es la columna A", () => {
  const plan = new Map<number, PlanCeldaFoto>([
    [2, "vacia"],
    [3, "sin-foto"],
  ]);

  it("escribe NO IMAGEN cuando no hay foto y deja vacía la celda cuando sí", () => {
    const xml = hoja(
      `<row r="2" spans="2:3"><c r="B2" t="s"><v>1</v></c></row>` +
        `<row r="3" spans="2:3"><c r="B3" t="s"><v>2</v></c></row>`,
    );
    const out = escribirColumnaFoto(xml, plan);
    expect(out).toContain(`<c r="A2"/>`);
    expect(out).toContain(`<c r="A3" t="inlineStr"><is><t>${TEXTO_SIN_FOTO}</t></is></c>`);
    // la celda A va PRIMERA en su fila (las celdas van en orden de columna)
    expect(out).toMatch(/<row r="2"[^>]*><c r="A2"\/><c r="B2"/);
    // y `spans` se corrió a la columna 1
    expect(out).toContain(`spans="1:3"`);
  });

  it("🔴 no toca ninguna otra celda ni el orden de las filas", () => {
    const xml = hoja(
      `<row r="1"><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>3</v></c></row>` +
        `<row r="2"><c r="B2" t="s"><v>1</v></c><c r="C2"><v>40</v></c><c r="F2" t="s"><v>2</v></c></row>` +
        `<row r="3"><c r="B3" t="s"><v>2</v></c><c r="D3"><v>7.5</v></c></row>`,
    );
    const out = escribirColumnaFoto(xml, plan);
    for (const celda of [
      `<c r="B1" t="s"><v>0</v></c>`,
      `<c r="C1" t="s"><v>3</v></c>`,
      `<c r="B2" t="s"><v>1</v></c>`,
      `<c r="C2"><v>40</v></c>`,
      `<c r="F2" t="s"><v>2</v></c>`,
      `<c r="B3" t="s"><v>2</v></c>`,
      `<c r="D3"><v>7.5</v></c>`,
    ]) {
      expect(out).toContain(celda);
    }
    const filas = [...out.matchAll(/<row r="(\d+)"/g)].map((m) => m[1]);
    expect(filas).toEqual(["1", "2", "3"]);
  });

  it("conserva el estilo de la celda A que ya existía", () => {
    const xml = hoja(`<row r="3"><c r="A3" s="7" t="s"><v>3</v></c><c r="B3" t="s"><v>2</v></c></row>`);
    const out = escribirColumnaFoto(xml, plan);
    expect(out).toContain(`<c r="A3" s="7" t="inlineStr">`);
  });

  it("una fila que no está en el plan queda intacta", () => {
    const xml = hoja(`<row r="9"><c r="B9" t="s"><v>1</v></c></row>`);
    expect(escribirColumnaFoto(xml, plan)).toContain(`<row r="9"><c r="B9" t="s"><v>1</v></c></row>`);
  });

  it("el encabezado (fila 1) NUNCA entra en el plan que arma la pantalla", () => {
    // La pantalla arma el plan desde `lectura.filas`, que ya excluye la fila 1.
    const l = leerHoja(hoja(`<row r="1"><c r="B1" t="s"><v>0</v></c></row><row r="2"><c r="B2" t="s"><v>1</v></c></row>`), [
      "New Article",
      "AAA-1",
    ]);
    expect(l.filas.map((f) => f.fila)).not.toContain(1);
  });

  it("un plan vacío devuelve el MISMO xml, sin reescribirlo", () => {
    const xml = hoja(`<row r="2"><c r="B2" t="s"><v>1</v></c></row>`);
    expect(escribirColumnaFoto(xml, new Map())).toBe(xml);
  });

  it("corre el `dimension` a la columna A si empezaba en la B", () => {
    const xml = hoja(`<row r="2"><c r="B2" t="s"><v>1</v></c></row>`).replace('ref="A1:F10"', 'ref="B1:F10"');
    expect(escribirColumnaFoto(xml, plan)).toContain('ref="A1:F10"');
  });
});

describe("excel propio · el plan de la columna A y la fila del ancla", () => {
  // Filas con HUECOS a propósito: es el caso que rompe el `i + 1` del Reebok.
  const filas = [
    { fila: 2, codigo: "AAA" },
    { fila: 5, codigo: "BBB" },
    { fila: 6, codigo: "AAA" },
  ];

  it("🔴 el ancla es la fila REAL del archivo, no el índice del par", () => {
    expect(filaAnclaDe(filas, 0)).toBe(1);
    expect(filaAnclaDe(filas, 1)).toBe(4);
    expect(filaAnclaDe(filas, 2)).toBe(5);
    // si fuera `i + 1` daría 1, 2, 3 → la foto de BBB caería en la fila 3
    expect(filas.map((_f, i) => filaAnclaDe(filas, i))).not.toEqual([1, 2, 3]);
  });

  it("🔴 ninguna fila se salta: sin foto la celda dice NO IMAGEN", () => {
    const plan = planColumnaFoto(filas, (c) => c === "AAA");
    expect(plan.size).toBe(3);
    expect(plan.get(2)).toBe("vacia");
    expect(plan.get(5)).toBe("sin-foto");
    // el mismo código repetido en dos filas recibe el mismo trato
    expect(plan.get(6)).toBe("vacia");
  });

  it("con la carpeta vacía TODAS dicen NO IMAGEN, y ninguna desaparece", () => {
    const plan = planColumnaFoto(filas, () => false);
    expect([...plan.values()]).toEqual(["sin-foto", "sin-foto", "sin-foto"]);
    expect([...plan.keys()]).toEqual([2, 5, 6]);
  });
});

describe("excel propio · la celda la mide el ARCHIVO, no una constante", () => {
  it("lee el ancho de la columna A y el alto de cada fila", () => {
    const xml = hoja(
      `<row r="2" ht="76" customHeight="1"><c r="B2"><v>1</v></c></row>` +
        `<row r="3"><c r="B3"><v>2</v></c></row>`,
    );
    const geo = medirCeldaFoto(xml);
    expect(geo.anchoPx).toBe(anchoColumnaAPx(14));
    expect(geo.altoPorFila.get(2)).toBe(altoPuntosAPx(76));
    expect(geo.altoPorFila.has(3)).toBe(false);
    expect(geo.altoDefectoPx).toBe(altoPuntosAPx(15));

    // la caja es la celda real menos un margen, y nunca negativa
    expect(cajaDeFila(geo, 2).caja).toBeGreaterThan(0);
    expect(cajaDeFila(geo, 2).caja).toBeLessThanOrEqual(Math.min(geo.anchoPx, altoPuntosAPx(76)));
    expect(cajaDeFila(geo, 3).caja).toBeGreaterThanOrEqual(8);
  });

  it("sin `<cols>` cae en el ancho por defecto de la hoja", () => {
    const xml = hoja(`<row r="2"><c r="B2"><v>1</v></c></row>`)
      .replace(/<cols>.*?<\/cols>/, "")
      .replace('defaultRowHeight="15"', 'defaultColWidth="10" defaultRowHeight="20"');
    const geo = medirCeldaFoto(xml);
    expect(geo.anchoPx).toBe(anchoColumnaAPx(10));
    expect(geo.altoDefectoPx).toBe(altoPuntosAPx(20));
  });
});

describe("excel propio · hojas, dibujos y nombre de salida", () => {
  const wb =
    `<workbook><sheets>` +
    `<sheet name="Main Sheet" sheetId="1" r:id="rId1"/>` +
    `<sheet name="Otra" sheetId="2" r:id="rId3"/>` +
    `</sheets></workbook>`;
  const rels =
    `<Relationships>` +
    `<Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet2.xml"/>` +
    `<Relationship Id="rId3" Type="x/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`;

  it("🔴 la hoja se resuelve por el índice del archivo, no adivinando sheet1.xml", () => {
    const hojas = resolverHojas(wb, rels);
    expect(hojas).toEqual([
      { ruta: "xl/worksheets/sheet2.xml", nombre: "Main Sheet" },
      { ruta: "xl/worksheets/sheet1.xml", nombre: "Otra" },
    ]);
  });

  it("detecta si la hoja ya tiene fotos pegadas", () => {
    expect(hojaTieneDibujo(hoja("", `<drawing r:id="rId1"/>`))).toBe(true);
    expect(hojaTieneDibujo(hoja(""))).toBe(false);
  });

  it("acepta .xlsx y .xlsm, y nada más", () => {
    expect(extensionAceptada("a.xlsm")).toBe(true);
    expect(extensionAceptada("A.XLSX")).toBe(true);
    expect(extensionAceptada("a.xls")).toBe(false);
    expect(extensionAceptada("a.csv")).toBe(false);
  });

  it("el .xlsm sigue siendo .xlsm cuando el macro se conserva, y baja a .xlsx si no", () => {
    expect(nombreDeSalida("1000 fiver excel.xlsm", true)).toBe("1000 fiver excel con fotos.xlsm");
    expect(nombreDeSalida("1000 fiver excel.xlsm", false)).toBe("1000 fiver excel con fotos.xlsx");
    expect(nombreDeSalida("pedido.xlsx", true)).toBe("pedido con fotos.xlsx");
  });
});

// ── DE PUNTA A PUNTA, con un libro de verdad ───────────────────────────────
describe("excel propio · el libro sale igual salvo la columna A", () => {
  async function libroDePrueba(): Promise<Uint8Array> {
    const aoa = [
      ["NO IMAGEN", "New Article", "Name", "Precio", "Piezas", "PO NAME"],
      [null, "100272098", "NFX TRAINER 2", 40, 60, "ALEX"],
      [null, "100263419", "CLUB C 85", 36, 24, "VIC"],
      [null, "T1A8-32600-313", "TOMMY", 55.5, 12, "ALEX"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Main Sheet");
    return new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
  }

  it("pega las fotos, escribe NO IMAGEN y no mueve ninguna otra celda", async () => {
    const original = await libroDePrueba();
    const zip = await JSZip.loadAsync(original);
    const hojas = resolverHojas(
      await zip.file("xl/workbook.xml")!.async("string"),
      await zip.file("xl/_rels/workbook.xml.rels")!.async("string"),
    );
    const rutaHoja = hojas[0].ruta;
    const sheetXml = await zip.file(rutaHoja)!.async("string");
    const sst = leerSharedStrings(await zip.file("xl/sharedStrings.xml")?.async("string"));
    const lectura = leerHoja(sheetXml, sst);
    expect(lectura.filas.map((f) => f.codigo)).toEqual(["100272098", "100263419", "T1A8-32600-313"]);

    // solo el primer código tiene foto
    const { indice } = indexarFotos([{ name: "100272098.jpg" }]);
    const emparejado = parearFotos(lectura.filas.map((f) => f.codigo), indice);
    expect(emparejado.conFoto).toBe(1);

    const geo = medirCeldaFoto(sheetXml);
    const plan = new Map<number, PlanCeldaFoto>();
    const fotos: FotoParaExcel[] = [];
    lectura.filas.forEach((f, i) => {
      const hay = !!emparejado.pares[i].foto;
      plan.set(f.fila, hay ? "vacia" : "sin-foto");
      if (!hay) return;
      const c = cajaDeFila(geo, f.fila);
      const e = encajar(300, 200, c.caja, c.ancho, c.alto);
      fotos.push({ fila: f.fila - 1, bytes: JPEG, anchoPx: e.ancho, altoPx: e.alto, offsetXPx: e.offsetX, offsetYPx: e.offsetY });
    });

    zip.file(rutaHoja, escribirColumnaFoto(sheetXml, plan));
    const intermedio = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const salida = await incrustarFotosEnXlsx(intermedio, fotos, { hoja: rutaHoja, columna: 0, reemplazarDibujo: true });

    // ── se relee con la librería de Excel, que es otro parser ──────────────
    const wb2 = XLSX.read(salida, { type: "array" });
    const ws2 = wb2.Sheets["Main Sheet"];
    expect(wb2.SheetNames).toEqual(["Main Sheet"]);
    expect(ws2["B2"].v).toBe("100272098");
    expect(ws2["C2"].v).toBe("NFX TRAINER 2");
    expect(ws2["D2"].v).toBe(40);
    expect(ws2["E2"].v).toBe(60);
    expect(ws2["F2"].v).toBe("ALEX");
    expect(ws2["D4"].v).toBe(55.5);
    // la fila CON foto queda vacía; las otras dos dicen NO IMAGEN
    expect(ws2["A2"]?.v ?? "").toBe("");
    expect(ws2["A3"].v).toBe(TEXTO_SIN_FOTO);
    expect(ws2["A4"].v).toBe(TEXTO_SIN_FOTO);
    // y el encabezado no se tocó
    expect(ws2["A1"].v).toBe("NO IMAGEN");

    // ── y con JSZip, que ve el ancla ───────────────────────────────────────
    const zip2 = await JSZip.loadAsync(salida);
    const dib = await zip2.file("xl/drawings/drawing1.xml")!.async("string");
    expect(dib).toContain("<xdr:oneCellAnchor>");
    expect(dib).not.toContain("twoCellAnchor");
    expect([...dib.matchAll(/<xdr:row>(\d+)<\/xdr:row>/g)].map((m) => m[1])).toEqual(["1"]); // fila 2 = índice 1
  });

  it("🔴 ninguna fila se salta: con la carpeta vacía TODAS dicen NO IMAGEN", async () => {
    const original = await libroDePrueba();
    const zip = await JSZip.loadAsync(original);
    const ruta = "xl/worksheets/sheet1.xml";
    const sheetXml = await zip.file(ruta)!.async("string");
    const sst = leerSharedStrings(await zip.file("xl/sharedStrings.xml")?.async("string"));
    const lectura = leerHoja(sheetXml, sst);
    const emparejado = parearFotos(lectura.filas.map((f) => f.codigo), new Map());
    expect(emparejado.conFoto).toBe(0);
    const plan = new Map<number, PlanCeldaFoto>(lectura.filas.map((f) => [f.fila, "sin-foto" as PlanCeldaFoto]));
    zip.file(ruta, escribirColumnaFoto(sheetXml, plan));
    const salida = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const ws = XLSX.read(salida, { type: "array" }).Sheets["Main Sheet"];
    expect([ws["A2"].v, ws["A3"].v, ws["A4"].v]).toEqual([TEXTO_SIN_FOTO, TEXTO_SIN_FOTO, TEXTO_SIN_FOTO]);
    expect([ws["B2"].v, ws["B3"].v, ws["B4"].v]).toEqual(["100272098", "100263419", "T1A8-32600-313"]);
  });
});

describe("excel propio · el camino de Reebok NO se aflojó", () => {
  it("🔴 sin `reemplazarDibujo`, un dibujo preexistente sigue cortando con error", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["Foto", "New Article"], [null, "1"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedido");
    const bytes = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
    const zip = await JSZip.loadAsync(bytes);
    const ruta = "xl/worksheets/sheet1.xml";
    const xml = await zip.file(ruta)!.async("string");
    zip.file(ruta, xml.replace("</worksheet>", `<drawing r:id="rId9"/></worksheet>`));
    const conDibujo = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const foto: FotoParaExcel = { fila: 1, bytes: JPEG, anchoPx: 50, altoPx: 50 };
    await expect(incrustarFotosEnXlsx(conDibujo, [foto])).rejects.toThrow(/ya tenía un dibujo/);
  });

  it("sin fotos devuelve los MISMOS bytes, sin abrir el zip", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await incrustarFotosEnXlsx(bytes, [])).toBe(bytes);
  });
});

// ── UN SOLO EMPAREJADOR Y UN SOLO COMPRESOR ────────────────────────────────
// Si esta pantalla escribiera los suyos, dos pantallas pegarían fotos distintas
// para el mismo código y nadie se enteraría hasta que un cliente reclame.
//
// ⚠️ El barrido BORRA LOS COMENTARIOS PRIMERO: en este repo ya falló cuatro
// veces un candado que se cumplía con su propia explicación.
describe("excel propio · no hay una segunda copia de nada", () => {
  const sinComentarios = (ruta: string) =>
    readFileSync(join(process.cwd(), ruta), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const PANTALLA = "src/app/productos/cargar/MiExcelFotosClient.tsx";
  const ARCHIVO = "src/app/productos/cargar/excel-propio-archivo.ts";

  it("🔴 no pasa por `xlsx-js-style`: el archivo de Daniel no se vuelve a escribir", () => {
    for (const ruta of [PANTALLA, ARCHIVO]) {
      expect(sinComentarios(ruta)).not.toContain("xlsx-js-style");
    }
  });

  it("reusa el emparejador, el compresor y el plan; no escribe los suyos", () => {
    const src = sinComentarios(PANTALLA);
    for (const simbolo of ["parearFotos", "indexarFotos", "prepararFotos", "planColumnaFoto", "filaAnclaDe"]) {
      expect(src).toContain(simbolo);
    }
    // 🔴 el texto sale de la constante compartida y NUNCA de un literal: si la
    // pantalla lo escribe a mano, cambiar la constante deja la pantalla
    // diciendo una cosa y el archivo otra.
    expect(src).not.toMatch(/NO IMAGEN/);
    expect(src).toContain("TEXTO_SIN_FOTO");
    // el achicado va por `prepararFotos`, nunca llamando al compresor de a uno
    expect(src).not.toContain("compressImage");
    // y no hay un segundo criterio de "esto es una foto"
    expect(src).not.toContain(".jpg\"");
    expect(src).not.toContain("toLowerCase()");
  });

  it("🔴 las fotos no se suben a ningún lado: acá no hay un solo `fetch`", () => {
    for (const ruta of [PANTALLA, ARCHIVO]) {
      const src = sinComentarios(ruta);
      expect(src).not.toContain("fetch(");
      expect(src).not.toContain("XMLHttpRequest");
    }
  });
});

// ── EL ARCHIVO REAL DE DANIEL ──────────────────────────────────────────────
// Corre solo si la carpeta de OneDrive está en la máquina; en CI se saltea en
// vez de dar verde por nada.
const CARPETA = join(process.env.HOME ?? "", "Library/CloudStorage/OneDrive-FashionGroup/Reebok/Fotos");
const LIBRO = join(CARPETA, "1000 fiver excel.xlsm");
const hayArchivo = existsSync(LIBRO);

describe.skipIf(!hayArchivo)("excel propio · el .xlsm REAL de Daniel", () => {
  it("lee sus 203 códigos de la columna B y conserva el macro", async () => {
    const bytes = new Uint8Array(readFileSync(LIBRO));
    const zip = await JSZip.loadAsync(bytes);
    const hojas = resolverHojas(
      await zip.file("xl/workbook.xml")!.async("string"),
      await zip.file("xl/_rels/workbook.xml.rels")!.async("string"),
    );
    expect(hojas).toHaveLength(1);
    const ruta = hojas[0].ruta;
    const sheetXml = await zip.file(ruta)!.async("string");
    const sst = leerSharedStrings(await zip.file("xl/sharedStrings.xml")?.async("string"));
    const lectura = leerHoja(sheetXml, sst);

    expect(lectura.encabezadoCodigo).toBe("New Article");
    expect(lectura.filas).toHaveLength(203);
    expect(lectura.filasSinCodigo).toHaveLength(0);
    // el archivo YA trae las fotos del macro y el macro mismo
    expect(hojaTieneDibujo(sheetXml)).toBe(true);
    const vbaAntes = await zip.file("xl/vbaProject.bin")!.async("uint8array");

    // una foto en la primera fila con código, el resto NO IMAGEN
    const geo = medirCeldaFoto(sheetXml);
    const c = cajaDeFila(geo, lectura.filas[0].fila);
    const e = encajar(300, 300, c.caja, c.ancho, c.alto);
    const plan = new Map<number, PlanCeldaFoto>(
      lectura.filas.map((f, i) => [f.fila, (i === 0 ? "vacia" : "sin-foto") as PlanCeldaFoto]),
    );
    zip.file(ruta, escribirColumnaFoto(sheetXml, plan));
    const intermedio = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const salida = await incrustarFotosEnXlsx(
      intermedio,
      [{ fila: lectura.filas[0].fila - 1, bytes: JPEG, anchoPx: e.ancho, altoPx: e.alto, offsetXPx: e.offsetX, offsetYPx: e.offsetY }],
      { hoja: ruta, columna: 0, reemplazarDibujo: true },
    );

    const zip2 = await JSZip.loadAsync(salida);
    // 🔴 el macro sale byte por byte igual
    const vbaDespues = await zip2.file("xl/vbaProject.bin")!.async("uint8array");
    expect(Buffer.compare(Buffer.from(vbaAntes), Buffer.from(vbaDespues))).toBe(0);
    // el dibujo viejo (twoCellAnchor del macro) se reemplazó por el nuevo
    const dib = await zip2.file("xl/drawings/drawing1.xml")!.async("string");
    expect(dib).toContain("oneCellAnchor");
    expect(dib).not.toContain("twoCellAnchor");
    // y las imágenes viejas ya no están
    const media: string[] = [];
    zip2.forEach((p) => { if (p.startsWith("xl/media/") && p.endsWith(".jpeg")) media.push(p); });
    expect(media).toEqual(["xl/media/imagen1.jpeg"]);
  });

  it("los códigos emparejan EXACTO contra la carpeta real (4.744 fotos)", async () => {
    const bytes = new Uint8Array(readFileSync(LIBRO));
    const zip = await JSZip.loadAsync(bytes);
    const ruta = "xl/worksheets/sheet1.xml";
    const sheetXml = await zip.file(ruta)!.async("string");
    const sst = leerSharedStrings(await zip.file("xl/sharedStrings.xml")?.async("string"));
    const lectura = leerHoja(sheetXml, sst);
    const { indice } = indexarFotos(readdirSync(CARPETA).map((name) => ({ name })));
    const emparejado = parearFotos(lectura.filas.map((f) => f.codigo), indice);
    expect(emparejado.pares).toHaveLength(203);
    expect(emparejado.conFoto).toBe(203);
    expect(emparejado.sinFoto).toBe(0);
  });
});
