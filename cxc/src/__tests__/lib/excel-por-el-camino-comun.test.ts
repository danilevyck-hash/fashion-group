// ─────────────────────────────────────────────────────────────────────────────
// TODO EXCEL SALE POR EL CAMINO COMÚN (17-sep-2026)
//
// `cxc/CLAUDE.md` ya lo decía: «Los Excel de todo el sistema empiezan en la fila
// 1, con filtro desde A1 y la fila de encabezados fija. Todo export sale por
// `workbookBytes` / `workbookBuffer` / `workbookBlob`.» No era un gusto: estaba
// decidido y escrito.
//
// 🩸 Y ONCE ARCHIVOS SE HABÍAN ESCAPADO. Daniel abrió el
// `Pedido_ActiveShoes_2026-09.xlsx` —la preforma de Reebok con fotos— y
// preguntó por qué ese Excel «se ve sin el menú de arriba normal»: le faltaban
// el filtro y la fila fija. La causa era que ese archivo se armaba y se bajaba
// por su cuenta (`XLSX.writeFile`, y `saveAs(new Blob(...))` en la rama con
// fotos) en vez de pasar por el envoltorio común, que es donde vive
// `src/lib/excel-panel-fijo.ts`. Lo mismo pasaba en la plantilla Switch de las
// dos pantallas, en Facturas Tienda, en Asistencia › Reporte, en Curvas, en el
// bulk de fórmulas, en los dos Excel de Reclamos y en los cuatro de Marketing.
//
// Una regla escrita que nadie verifica no es una regla: es una nota. Este
// barrido la verifica.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx-js-style";
import JSZip from "jszip";
import { workbookBytes, filtroDesdeA1 } from "@/lib/excel-export";
import { incrustarFotosEnXlsx } from "@/lib/depurador/fotos-xlsx";

const RAIZ = path.join(process.cwd(), "src");

/** 🔴 EL ÚNICO ARCHIVO QUE PUEDE ESCRIBIR UN .xlsx. Es el camino común: es el
 *  que le agrega el `<pane>` al ZIP después de que SheetJS escribe el libro. */
const LA_PUERTA = "lib/excel-export.ts";

/**
 * 🔑 LOS EXENTOS DE `saveAs`, CADA UNO CON SU PORQUÉ.
 *
 * `saveAs` no es el problema —es solo «baja este blob»—: el problema es de
 * dónde salió el blob. Estos archivos llaman a `saveAs` y NO están armando un
 * libro por su cuenta, así que no tienen nada que pasar por el camino común.
 */
const SAVEAS_EXENTOS: Record<string, string> = {
  "app/productos/cargar/MiExcelFotosClient.tsx":
    "🔴 Baja el Excel DEL USUARIO, no uno del sistema: se le pegan las fotos al archivo que él subió y se le devuelve. " +
    "Puede ser .xlsm (con macros), que `xlsx-js-style` no sabe reescribir sin romperle el VBA. Acá no se arma ningún libro.",
  "app/marketing/components/useDescargasPeriodo.ts":
    "Baja un blob que YA armó el servidor (que sí sale por `workbookBuffer`) o un .zip. No arma nada.",
  "lib/marketing/generar-zip.ts":
    "Ese `saveAs` es de un .zip. El .xlsx que va adentro sale por `workbookBlob`.",
};

/** Los que sí arman un libro y bajan un .xlsx: tienen que usar el camino común. */
const BAJAN_UN_LIBRO = [
  "app/productos/cargar/ReebokClient.tsx",
  "app/productos/cargar/DepuradorClient.tsx",
  "app/productos/cargar/FacturasTiendaClient.tsx",
];

function archivosDeCodigo(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      archivosDeCodigo(p, out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push(path.relative(RAIZ, p));
    }
  }
  return out;
}

const TODOS = archivosDeCodigo(RAIZ);
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Las líneas de código de verdad: sin comentarios de línea ni de bloque. Un
 *  barrido que se dispara con un comentario deja de ser un barrido. */
function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("🔴 nadie escribe un .xlsx fuera del camino común", () => {
  it("solo `lib/excel-export.ts` llama a `XLSX.write` o `XLSX.writeFile`", () => {
    const culpables = TODOS.filter((rel) => {
      if (rel === LA_PUERTA) return false;
      return /XLSX\.write(File)?\s*\(/.test(sinComentarios(leer(rel)));
    });
    expect(
      culpables,
      "Estos archivos escriben un Excel a mano y se saltan el filtro y la fila fija. " +
      "Usa `workbookBytes` / `workbookBuffer` / `workbookBlob` / `downloadWorkbook` de @/lib/excel-export.",
    ).toEqual([]);
  });

  it("el camino común sigue existiendo y sigue congelando la fila", () => {
    const puerta = leer(LA_PUERTA);
    expect(puerta).toContain("congelarEncabezadosXlsx");
    expect(puerta).toMatch(/export function workbookBytes/);
    expect(puerta).toMatch(/export function workbookBuffer/);
    expect(puerta).toMatch(/export function workbookBlob/);
    expect(puerta).toMatch(/export function downloadWorkbook/);
  });
});

describe("🔴 todo `saveAs` de un .xlsx está en la lista, y con su porqué", () => {
  const conSaveAs = TODOS.filter((rel) => /\bsaveAs\s*\(/.test(sinComentarios(leer(rel))));

  it("hay archivos que bajan con `saveAs` (si no, el barrido no mide nada)", () => {
    expect(conSaveAs.length).toBeGreaterThan(0);
  });

  it("cada uno o baja por el camino común, o está exento por escrito", () => {
    const sinExplicacion = conSaveAs.filter((rel) => {
      if (SAVEAS_EXENTOS[rel]) return false;
      const s = sinComentarios(leer(rel));
      return !/workbook(Blob|Bytes)\s*\(/.test(s);
    });
    expect(
      sinExplicacion,
      "Bajan un archivo con `saveAs` sin armarlo por el camino común y sin estar en SAVEAS_EXENTOS. " +
      "Enchúfalos a `workbookBlob`, o agrégalos a la lista con el motivo escrito.",
    ).toEqual([]);
  });

  it("⚠️ la lista de exentos no puede tener un exento de mentira", () => {
    for (const [rel, motivo] of Object.entries(SAVEAS_EXENTOS)) {
      expect(TODOS, `${rel} está exento pero ese archivo ya no existe`).toContain(rel);
      expect(motivo.length, `${rel} está exento sin motivo escrito`).toBeGreaterThan(40);
    }
  });

  it("las tres pantallas que arman una plantilla usan el camino común", () => {
    for (const rel of BAJAN_UN_LIBRO) {
      const s = sinComentarios(leer(rel));
      expect(s, rel).toMatch(/workbook(Blob|Bytes)\s*\(/);
    }
  });
});

describe("🔴 el filtro desde A1 es lo que enciende la fila fija", () => {
  it("🔴 TODA hoja armada de un AOA en esas pantallas lleva su filtro", () => {
    // Se cuenta, no se busca una vez: `ReebokClient` arma TRES hojas (la
    // preforma sin fotos, la preforma con fotos y la plantilla Switch) y
    // encontrar una sola no prueba que las otras dos lo tengan.
    for (const rel of BAJAN_UN_LIBRO) {
      const s = sinComentarios(leer(rel));
      const hojas = (s.match(/XLSX\.utils\.aoa_to_sheet\(/g) ?? []).length;
      const filtros = (s.match(/\["!autofilter"\]\s*=\s*\{\s*ref:\s*filtroDesdeA1\(/g) ?? []).length;
      expect(hojas, `${rel}: no arma ninguna hoja de un AOA`).toBeGreaterThan(0);
      expect(filtros, `${rel}: ${hojas} hoja(s) armadas y solo ${filtros} con filtro`).toBe(hojas);
    }
  });

  it("⚠️ Curvas NO lleva filtro a propósito, y se dice por qué", () => {
    const fuente = leer("app/productos/cargar/CurvasView.tsx");
    expect(sinComentarios(fuente)).not.toContain("!autofilter");
    expect(fuente).toContain("SIN FILTRO A PROPÓSITO");
    // Pero igual pasa por el camino común.
    expect(sinComentarios(fuente)).toContain("downloadWorkbook(");
  });
});

describe("🔴 el orden de los dos parches del ZIP está escrito y probado", () => {
  // `congelarEncabezadosXlsx` solo sabe tocar entradas SIN COMPRIMIR (así las
  // escribe SheetJS) y `incrustarFotosEnXlsx` regenera el ZIP con JSZip en
  // DEFLATE. Primero el panel, después las fotos: al revés el panel fallaría
  // ABIERTO y el archivo saldría sin fila fija sin que nadie se entere.
  const fuente = leer("app/productos/cargar/ReebokClient.tsx");

  it("en la rama con fotos, `workbookBytes` va ANTES de incrustar", () => {
    const codigo = sinComentarios(fuente);
    const panel = codigo.indexOf("const bytes = workbookBytes(wb)");
    const fotos = codigo.indexOf("incrustarFotosEnXlsx(bytes");
    expect(panel).toBeGreaterThan(-1);
    expect(fotos).toBeGreaterThan(-1);
    expect(panel).toBeLessThan(fotos);
  });

  it("y el porqué está escrito al lado", () => {
    expect(fuente).toContain("PRIMERO EL PANEL");
    expect(fuente).toContain("DESPUÉS LAS FOTOS");
  });

  it("⚠️ el panel falla ABIERTO: una entrada comprimida se devuelve tal cual", () => {
    const panelFijo = fs.readFileSync(path.join(RAIZ, "lib/excel-panel-fijo.ts"), "utf8");
    expect(panelFijo).toContain("if (e.metodo !== 0) continue");
    expect(panelFijo).toMatch(/return xlsx;/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * LA PRUEBA DE QUE EL ORDEN FUNCIONA, NO SOLO DE QUE ESTÁ ESCRITO
 * ═══════════════════════════════════════════════════════════════════════════
 * Se arma la preforma como la arma la pantalla, se le congela la fila y recién
 * después se le pegan las fotos — y se abre el resultado para ver que el
 * `<pane>` sigue ahí y que el ZIP se puede leer.
 */
describe("🔴 el panel fijo SOBREVIVE a las fotos", () => {
  const AOA = [
    ["Foto", "PO NAME", "New Article", "Name"],
    ["", "VIC", "100262679", "ZIGNITION"],
    ["", "VIC", "100272244", "REEBOK MUNDO"],
  ];
  // Un JPEG mínimo de verdad (SOI + APP0 + EOI). No hace falta que se vea:
  // lo que se prueba es el ZIP, no la imagen.
  const JPEG = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);

  const libro = () => {
    const ws = XLSX.utils.aoa_to_sheet(AOA);
    ws["!autofilter"] = { ref: filtroDesdeA1(AOA) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedido");
    return wb;
  };

  it("primero el panel, después las fotos: el `<pane>` queda", async () => {
    const conPanel = workbookBytes(libro());
    expect(new TextDecoder().decode(conPanel)).toContain("<pane ySplit=\"1\"");

    const conFotos = await incrustarFotosEnXlsx(conPanel, [
      { fila: 1, bytes: JPEG, anchoPx: 60, altoPx: 60 },
    ]);
    const zip = await JSZip.loadAsync(conFotos);
    const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(hoja).toContain("<pane ySplit=\"1\"");
    expect(hoja).toContain("<autoFilter ref=\"A1:D3\"");
    expect(hoja).toContain("<drawing r:id=");
    expect(zip.file("xl/media/imagen1.jpeg") ?? zip.file("xl/media/foto1.jpeg")).toBeTruthy();
  });

  it("🔴 cada foto lleva su texto alternativo (`descr`), o Excel se queja", async () => {
    /* 🩸 Sin esto, el `Pedido_ActiveShoes_*.xlsx` abría diciendo
     * «Accesibilidad: es necesario investigar» y el MISMO archivo sin fotos
     * decía «todo correcto»: las imágenes iban con `name="Foto N"` y nada más.
     * Es un archivo que Daniel le manda a clientes. */
    const conFotos = await incrustarFotosEnXlsx(workbookBytes(libro()), [
      { fila: 1, bytes: JPEG, anchoPx: 60, altoPx: 60, descripcion: 'ZIGNITION 6 "PRO" & CO' },
      { fila: 2, bytes: JPEG, anchoPx: 60, altoPx: 60 },
    ]);
    const zip = await JSZip.loadAsync(conFotos);
    const dibujo = await zip.file("xl/drawings/drawing1.xml")!.async("string");
    // El texto va ESCAPADO: viene del archivo del proveedor y trae `&` y comillas.
    expect(dibujo).toContain('descr="ZIGNITION 6 &quot;PRO&quot; &amp; CO"');
    // ⚠️ Y es OPCIONAL: sin descripción, el dibujo sale como salía.
    expect(dibujo).toContain('name="Foto 2"/>');
  });

  it("🩸 al revés NO funciona, y por eso el orden importa", async () => {
    // JSZip reescribe el ZIP en DEFLATE; el panel solo sabe tocar entradas sin
    // comprimir, así que falla ABIERTO y devuelve los bytes tal cual.
    const sinPanel = new Uint8Array(
      XLSX.write(libro(), { bookType: "xlsx", type: "array" }) as ArrayBuffer,
    );
    const primeroFotos = await incrustarFotosEnXlsx(sinPanel, [
      { fila: 1, bytes: JPEG, anchoPx: 60, altoPx: 60 },
    ]);
    const { congelarEncabezadosXlsx } = await import("@/lib/excel-panel-fijo");
    const despues = congelarEncabezadosXlsx(primeroFotos);
    expect(despues).toBe(primeroFotos); // mismos bytes: no pudo, y no rompió
    const zip = await JSZip.loadAsync(despues);
    const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(hoja).not.toContain("<pane ");
  });
});
