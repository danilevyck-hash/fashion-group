/**
 * 🔴 LOS ENCABEZADOS ABREN EL ARCHIVO, SE PUEDE FILTRAR Y NO SE PIERDEN AL BAJAR
 *
 * Daniel, textual, sobre `ventas-referencia-2026-08-27.xlsx`: *"la tercera fila
 * esta como escondido, no me deja filtrar desde los nombres importantes, y
 * mucha informacion inecesaria… si asi se ve el modulo, asi mismo se debe de
 * descargar y sin tantas palabras de info, se debe de suponer como funciona el
 * excel"*. Y su regla permanente: *"un erp profesional no tiene explicaciones,
 * es intuitivo como apple"*.
 *
 * 🔑 ESTE CANDADO ESCRIBE EL .xlsx Y LO VUELVE A ABRIR — dos veces, con dos
 * lectores que no comparten una línea: `xlsx-js-style` (el que escribe) y el
 * XML CRUDO del zip vía `jszip`. Mirar el objeto EN MEMORIA no prueba nada de
 * lo que este cambio promete: entre el objeto y el archivo hay un `XLSX.write`
 * y un re-empaquetado del ZIP, y el `<pane>` lo pone JUSTO ese re-empaquetado
 * (`congelarEncabezadosXlsx`), porque la librería no sabe escribir paneles.
 */

import { describe, it, expect } from "vitest";
import XLSX from "xlsx-js-style";
import JSZip from "jszip";
import fs from "fs";
import path from "path";

import {
  buildReportSheet,
  workbookFromSheets,
  workbookBytes,
  MONEY_FMT,
  type ReportSheetOpts,
} from "@/lib/excel-export";
import { congelarEncabezadosXlsx } from "@/lib/excel-panel-fijo";
import { construirExcelPlanilla, type DatosPlanillaExport } from "@/lib/asistencia/planilla-exportar";
import { TOTALES_CERO, type Quincena, type Periodo } from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";

// ── helpers ─────────────────────────────────────────────────────────────────

function hojaDe(opts: ReportSheetOpts) {
  return buildReportSheet(opts);
}

function librito(opts: ReportSheetOpts = HOJA_BASE) {
  return workbookFromSheets([{ name: "Prueba", ws: hojaDe(opts) }]);
}

const HOJA_BASE: ReportSheetOpts = {
  columns: [
    { header: "Cliente", wch: 30 },
    { header: "Empresa", wch: 20 },
    { header: "Saldo", wch: 14, align: "right", fmt: MONEY_FMT },
  ],
  rows: [
    ["ALADDIN", "Vistana", 1247],
    ["LA FRONTERA DUTY FREE", "Fashion Wear", 380732.79],
  ],
  totals: ["TOTAL", null, 381979.79],
};

/** Abre los bytes con el XML CRUDO del zip — el segundo lector. */
async function xmlDeLaHoja(bytes: Uint8Array, n = 1): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const f = zip.file(`xl/worksheets/sheet${n}.xml`);
  if (!f) throw new Error(`no hay sheet${n}.xml`);
  return f.async("string");
}

// ── 1. los encabezados abren el archivo ─────────────────────────────────────

describe("1 · los ENCABEZADOS van en la fila 1 y no hay nada arriba", () => {
  it("A1 es el primer encabezado, no un título", () => {
    const ws = hojaDe(HOJA_BASE);
    expect(ws["A1"]?.v).toBe("Cliente");
    expect(ws["B1"]?.v).toBe("Empresa");
    expect(ws["C1"]?.v).toBe("Saldo");
  });

  it("los datos empiezan en la fila 2 — no hay separador escondido", () => {
    const ws = hojaDe(HOJA_BASE);
    expect(ws["A2"]?.v).toBe("ALADDIN");
    expect(ws["C2"]?.t).toBe("n");
    expect(ws["C2"]?.v).toBe(1247);
  });

  it("no queda ninguna fila de 4 puntos de alto (la que se veía escondida)", () => {
    const ws = hojaDe(HOJA_BASE);
    const altos = (ws["!rows"] ?? []).map((r) => (r as { hpt?: number }).hpt);
    // El único alto chico que queda es el ESPACIADOR de 6 antes de los totales,
    // que no lleva contenido ni fondo. Los 4 puntos eran la franja de color.
    expect(altos).not.toContain(4);
  });

  it("🔴 el tipo NO acepta `title` ni `subtitle`: no se pueden volver a poner", () => {
    const opts = { ...HOJA_BASE } as Record<string, unknown>;
    expect("title" in opts).toBe(false);
    expect("subtitle" in opts).toBe(false);
    // Y el archivo del helper no los nombra (sin comentarios: en este repo un
    // barrido ya se cumplió CUATRO veces con su propia explicación).
    const src = sinComentarios(leer("src/lib/excel-export.ts"));
    expect(src).not.toMatch(/\btitle\b/);
    expect(src).not.toMatch(/\bsubtitle\b/);
  });

  it("con la lista vacía los encabezados igual están", () => {
    const ws = hojaDe({ ...HOJA_BASE, rows: [], totals: undefined });
    expect(ws["A1"]?.v).toBe("Cliente");
    expect(ws["!autofilter"]).toEqual({ ref: "A1:C1" });
  });
});

// ── 2. el filtro ────────────────────────────────────────────────────────────

describe("2 · el FILTRO sale desde los nombres de columna", () => {
  it("el rango cubre encabezados + datos y deja el TOTAL afuera", () => {
    const ws = hojaDe(HOJA_BASE);
    // 2 filas de datos → A1:C3. La fila de totales (5) queda fuera a propósito:
    // filtrar no puede esconder el total.
    expect(ws["!autofilter"]).toEqual({ ref: "A1:C3" });
    expect(ws["A5"]?.v).toBe("TOTAL");
  });

  it("🔴 EN EL ARCHIVO: `<autoFilter>` y el `_FilterDatabase` que Excel espera", async () => {
    const bytes = workbookBytes(librito());
    const xml = await xmlDeLaHoja(bytes);
    expect(xml).toContain('<autoFilter ref="A1:C3"/>');

    const zip = await JSZip.loadAsync(bytes);
    const wbxml = await zip.file("xl/workbook.xml")!.async("string");
    expect(wbxml).toContain("_xlnm._FilterDatabase");
    expect(wbxml).toContain("A1:C3");
  });

  it("el segundo lector (xlsx-js-style releyendo el archivo) ve lo mismo", () => {
    const bytes = workbookBytes(librito());
    const rb = XLSX.read(bytes, { type: "array" });
    const s = rb.Sheets["Prueba"];
    expect(s["A1"].v).toBe("Cliente");
    expect(s["A2"].v).toBe("ALADDIN");
  });
});

// ── 3. el panel fijo ────────────────────────────────────────────────────────

describe("3 · los ENCABEZADOS QUEDAN FIJOS al bajar", () => {
  it("🔴 EN EL ARCHIVO: `<pane>` congelado en la fila 1", async () => {
    const xml = await xmlDeLaHoja(workbookBytes(librito()));
    expect(xml).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(xml).toContain('<selection pane="bottomLeft"');
    // 🩸 Y va DENTRO de un <sheetView> que se ABRE, no pegado a uno
    // auto-cerrado: `<sheetView …/><pane/>` deja el panel colgando fuera del
    // elemento y Excel lo IGNORA en silencio — el archivo abre igual y la fila
    // no se queda fija. `/<sheetView[^>]*>/` no distingue los dos casos porque
    // el `[^>]*` se traga la barra del auto-cierre.
    expect(xml).not.toMatch(/<sheetView[^>]*\/>\s*<pane /);
    expect(xml).toMatch(/<sheetView(?![^>]*\/>)[^>]*>\s*<pane /);
  });

  it("🩸 la librería sola NO lo escribe — por eso existe el re-empaquetado", async () => {
    // Prueba de la premisa: si algún día `xlsx-js-style` aprendiera a escribir
    // paneles, este caso se cae y el patcher se puede retirar.
    const ws = hojaDe(HOJA_BASE);
    ws["!freeze"] = "A2";
    (ws as Record<string, unknown>)["!panes"] = [{ pane: "bottomLeft", ySplit: 1, state: "frozen" }];
    const crudo = new Uint8Array(
      XLSX.write(workbookFromSheets([{ name: "Prueba", ws }]), { bookType: "xlsx", type: "array" }) as ArrayBuffer,
    );
    expect(await xmlDeLaHoja(crudo)).not.toContain("<pane ");
  });

  it("todas las hojas del libro quedan congeladas, no solo la primera", async () => {
    const wb = workbookFromSheets([
      { name: "Uno", ws: hojaDe(HOJA_BASE) },
      { name: "Dos", ws: hojaDe(HOJA_BASE) },
    ]);
    const bytes = workbookBytes(wb);
    expect(await xmlDeLaHoja(bytes, 1)).toContain("<pane ");
    expect(await xmlDeLaHoja(bytes, 2)).toContain("<pane ");
  });

  it("🔴 una hoja con layout PROPIO (sin filtro) NO se congela", async () => {
    // Las fichas de Reclamos y el detalle de Comisiones apilan secciones: ahí la
    // fila 1 no son encabezados, y congelarla escondería media pantalla.
    const propia = XLSX.utils.aoa_to_sheet([["Comisión — Ana Pérez"], ["Fashion Wear · Junio 2026"], ["VENTAS"]]);
    const bytes = workbookBytes(workbookFromSheets([{ name: "Propia", ws: propia }]));
    const xml = await xmlDeLaHoja(bytes);
    expect(xml).not.toContain("<pane ");
  });
});

// ── 4. el re-empaquetado no toca nada más ───────────────────────────────────

describe("4 · el re-empaquetado del ZIP es FIEL", () => {
  it("🔴 solo cambia el XML de la hoja: todo lo demás sale byte por byte igual", async () => {
    const wb = librito();
    const crudo = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
    const parcheado = congelarEncabezadosXlsx(crudo);

    const a = await JSZip.loadAsync(crudo);
    const b = await JSZip.loadAsync(parcheado);
    expect(Object.keys(b.files)).toEqual(Object.keys(a.files)); // mismas y en orden

    const distintas: string[] = [];
    for (const n of Object.keys(a.files)) {
      const x = await a.file(n)!.async("uint8array");
      const y = await b.file(n)!.async("uint8array");
      if (x.length !== y.length || !x.every((v, i) => v === y[i])) distintas.push(n);
    }
    expect(distintas).toEqual(["xl/worksheets/sheet1.xml"]);
  });

  it("no rompe el zip: se puede releer con los dos lectores", async () => {
    const bytes = workbookBytes(librito());
    expect(XLSX.read(bytes, { type: "array" }).SheetNames).toEqual(["Prueba"]);
    await expect(JSZip.loadAsync(bytes)).resolves.toBeTruthy();
  });

  it("🩸 los CRC quedan bien — es lo que Excel lee como «archivo dañado»", async () => {
    // Ni jszip ni xlsx-js-style verifican el CRC al leer (es opt-in), así que un
    // CRC viejo pasa los dos lectores y revienta recién en Excel: hay que
    // PEDIRLE la verificación.
    const bytes = workbookBytes(librito());
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    for (const n of Object.keys(zip.files)) {
      await expect(zip.file(n)!.async("uint8array")).resolves.toBeTruthy();
    }
  });

  it("bytes que no son un zip salen TAL CUAL, sin reventar", () => {
    const basura = new Uint8Array([1, 2, 3, 4, 5]);
    expect(congelarEncabezadosXlsx(basura)).toBe(basura);
  });
});

// ── 5. la NOTA de la planilla ───────────────────────────────────────────────

describe("5 · 🔴 EL AVISO DE LA PLANILLA SE QUEDA — es orden de Daniel", () => {
  const NOTA = "NO es una quincena: sueldo base al 43.8 % y SIN los montos escritos a mano";

  it("va al PIE, fuera del rango del filtro: filtrar no la esconde", () => {
    const ws = hojaDe({ ...HOJA_BASE, nota: NOTA });
    // 2 datos → filtro A1:C3 · espaciador 4 · totales 5 · espaciador 6 · nota 7.
    expect(ws["!autofilter"]).toEqual({ ref: "A1:C3" });
    expect(ws["A7"]?.v).toBe(NOTA);
  });

  it("sin nota no se dibuja una fila vacía", () => {
    const ws = hojaDe(HOJA_BASE);
    const celdas = Object.keys(ws).filter((k) => !k.startsWith("!"));
    const ultima = Math.max(...celdas.map((k) => XLSX.utils.decode_cell(k).r));
    expect(ultima).toBe(4); // la fila de totales (0-based)
  });

  it("🔴 sobrevive el viaje al archivo, texto EXACTO", async () => {
    const bytes = workbookBytes(librito({ ...HOJA_BASE, nota: NOTA }));
    const s = XLSX.read(bytes, { type: "array" }).Sheets["Prueba"];
    expect(s["A7"].v).toBe(NOTA);
  });

  /**
   * 🔴 DE CONDUCTA: se arma el libro REAL de la planilla y se LEE la celda.
   *
   * 🩸 Un barrido de texto sobre `planilla-exportar.ts` no sirve acá, y se
   * midió: (a) `nota: avisoRangoLibre(d)` aparece en DOS hojas, así que
   * quitarla de una lo seguía cumpliendo; (b) la frase «NO es una quincena»
   * también vive en la fila «Período» de la hoja «Cómo se calcula», así que
   * vaciar el aviso tampoco lo rompía; y (c) un `if (false)` que lo hiciera
   * salir SIEMPRE es invisible para cualquier grep.
   */
  it("🔴 la planilla de un RANGO LIBRE lleva el aviso — en Planilla y en Horas", () => {
    const wb = construirExcelPlanilla(datosPlanilla({ rangoLibre: true }));
    for (const hoja of ["Planilla", "Horas"]) {
      const textos = celdasDe(wb.Sheets[hoja]);
      const aviso = textos.filter((t) => t.includes("NO es una quincena"));
      expect(aviso, `la hoja «${hoja}» perdió el aviso`).toHaveLength(1);
      // ⚠️ La EMPRESA no va en el aviso: la dice el nombre del archivo
      // (`planilla-todas-2026-07-25_2026-08-10.xlsx`). Lo que va acá es lo
      // único que Daniel mandó conservar — que el archivo no sirve para pagar.
      expect(aviso[0]).toContain("del 25 jul al 10 ago 2026");
      expect(aviso[0]).toContain("sueldo base al 110.4 %");
      expect(aviso[0]).toContain("SIN los montos escritos a mano");
    }
  });

  it("🔴 la de una QUINCENA no lo lleva: no habría nada que avisar", () => {
    const wb = construirExcelPlanilla(datosPlanilla({ rangoLibre: false }));
    for (const hoja of ["Planilla", "Horas"]) {
      expect(celdasDe(wb.Sheets[hoja]).filter((t) => t.includes("NO es una quincena"))).toHaveLength(0);
    }
  });

  it("el aviso del rango libre queda FUERA del filtro también en la planilla real", () => {
    const ws = construirExcelPlanilla(datosPlanilla({ rangoLibre: true })).Sheets["Planilla"];
    const finFiltro = Number(/A1:[A-Z]+(\d+)/.exec((ws["!autofilter"] as { ref: string }).ref)![1]);
    const fila = Object.keys(ws)
      .filter((k) => !k.startsWith("!"))
      .filter((k) => String((ws[k] as { v?: unknown }).v ?? "").includes("NO es una quincena"))
      .map((k) => XLSX.utils.decode_cell(k).r + 1)[0];
    expect(fila).toBeGreaterThan(finFiltro);
  });
});

// ── 6. barrido: nadie más se pone a explicar el Excel ───────────────────────

describe("6 · la `nota` es la EXCEPCIÓN, no la puerta de atrás", () => {
  it("🔴 solo DOS exports la usan, y las dos notas se ganaron el lugar", () => {
    // Daniel las aprobó una por una:
    //  · planilla — «NO es una quincena»: avisa que ese archivo no sirve para
    //    pagar. Frena un error.
    //  · referencia — de qué llegada son Compré/Vendí y que Stock es el total.
    //    Sin eso, un «Compré 36» al lado de un «Stock 12» parece mal sumado.
    // Una tercera pide su permiso: acá vuelve a estar la puerta, no abierta.
    const usos = archivosQueLlaman()
      .filter((f) => sinComentarios(leer(f)).includes("nota:"));
    expect(usos.sort()).toEqual([
      "src/lib/asistencia/planilla-exportar.ts",
      "src/lib/ventas/referencia-excel.ts",
    ]);
  });

  it("🔴 la de Referencia dice lo único que no se deduce mirando la tabla", async () => {
    const { buildReferenciaSheet } = await import("@/lib/ventas/referencia-excel");
    const ws = await buildReferenciaSheet([], true, "2026-08");
    const nota = celdasDe(ws).filter((t) => t.includes("ÚLTIMA llegada"));
    expect(nota, "la hoja Referencia perdió la aclaración").toHaveLength(1);
    expect(nota[0]).toContain("Stock es siempre la existencia total");
    // ⚠️ Y NO vuelve el manual de 900 caracteres que Daniel mandó sacar.
    expect(nota[0].length).toBeLessThan(220);
  });

  it("los 24 lugares que arman una hoja siguen ahí (nada se perdió de camino)", () => {
    const total = archivosQueLlaman().reduce(
      (n, f) => n + (sinComentarios(leer(f)).match(/buildReportSheet\(\{/g) ?? []).length,
      0,
    );
    // 25 desde el 31-ago-2026: entró el Excel de Aprobaciones, el único que
    // dice si la hora extra estaba autorizada.
    //
    // 🩸 24 desde el 5-sep-2026: **el Excel de Cheques SE RETIRÓ.** Daniel, al
    // rediseñar el módulo Recordatorios: *«se va»*. Se borró
    // `app/cheques/excel-cheques.ts` con su botón; los datos siguen en la base,
    // lo que se fue es la descarga. Este número baja A PROPÓSITO: es el candado
    // que avisa si alguien pierde un Excel sin querer, y bajarlo sin nota sería
    // exactamente el descuido que vino a cazar.
    expect(total).toBe(24);
  });
});

// ── utilidades del barrido ──────────────────────────────────────────────────

const RAIZ = process.cwd();

function leer(rel: string): string {
  return fs.readFileSync(path.join(RAIZ, rel), "utf8");
}

/**
 * 🩸 LOS COMENTARIOS SE BORRAN PRIMERO. En este repo un barrido de texto ya
 * pasó CUATRO veces estando el código mutado, porque el comentario que explica
 * el cambio contiene justo lo que el barrido busca — y estos archivos citan
 * `title` y `subtitle` para contar que se fueron.
 */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Los archivos que arman una hoja estándar, buscados en el árbol (sin lista
 *  escrita a mano: una lista se queda vieja y deja de vigilar lo nuevo). */
function archivosQueLlaman(): string[] {
  const out: string[] = [];
  const anda = (dir: string) => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "__tests__" || e.name === "node_modules") continue;
        anda(rel);
      } else if (/\.tsx?$/.test(e.name) && sinComentarios(leer(rel)).includes("buildReportSheet({")) {
        out.push(rel);
      }
    }
  };
  anda("src");
  return out.sort();
}

// ── fixture de la planilla ──────────────────────────────────────────────────

const QUINCENA: Quincena = {
  anio: 2026, mes: 8, n: 1,
  desde: "2026-08-01", hasta: "2026-08-15",
  etiqueta: "1 al 15 de agosto de 2026", clave: "2026-08-1",
};

/**
 * El caso REAL del rango libre: del 25-jul al 10-ago = 7/16 + 10/15 = 1,104167
 * de quincena, o sea el 110,4 % que el aviso nombra.
 */
const RANGO_LIBRE: Periodo = {
  desde: "2026-07-25", hasta: "2026-08-10",
  etiqueta: "25 jul al 10 ago 2026",
  esQuincena: false, quincena: null, claveManuales: null,
  diasCalendario: 17, factorBase: 1.104167,
};

function datosPlanilla({ rangoLibre }: { rangoLibre: boolean }): DatosPlanillaExport {
  return {
    lineas: [],
    totales: { ...TOTALES_CERO },
    quincena: QUINCENA,
    periodo: rangoLibre ? RANGO_LIBRE : undefined,
    empresaEtiqueta: null, // → "Todas las empresas"
    reglas: REGLAS_DEFAULT,
  };
}

function celdasDe(ws: XLSX.WorkSheet): string[] {
  return Object.keys(ws)
    .filter((k) => !k.startsWith("!"))
    .map((k) => String((ws[k] as { v?: unknown }).v ?? ""));
}
