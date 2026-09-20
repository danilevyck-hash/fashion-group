/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — EL PAPEL QUE SALE DE LA CASA NO LLEVA NUESTRAS PALABRAS DE ADENTRO
 * NI TRES FECHAS DISTINTAS (20-sep-2026).
 *
 * Medido sobre los DOS archivos reales de Fashion Wear bajados de producción el
 * 20-sep-2026 (11 reclamos por cobrar, de los 33 que ya salieron así):
 *
 *   1. 🩸 LA COLUMNA «ESTADO». El Excel y la portada del PDF imprimían el
 *      estado interno: «Creado» en 19 de los 33 reclamos vivos y «Pagado» en
 *      14. A un proveedor extranjero «Creado» no le dice nada, y **«Pagado» se
 *      le lee al revés**: acá significa que ÉL ya acreditó la nota de crédito,
 *      y él puede entender que se le pagó a él. Adentro del sistema el estado
 *      se sigue viendo igual — lo que cambia es el archivo que SALE.
 *
 *   2. 🩸 DOS FECHAS EN EL MISMO ARCHIVO. La hoja «Resumen» fechaba por
 *      `fecha_reclamo` y cada hoja de detalle por `fecha_factura`. Manda la de
 *      la FACTURA, que es la que mide los días desde el rediseño del
 *      10-sep-2026, y sale por `fechaDeLaCabecera` — el módulo del papel — así
 *      que las dos hojas no se pueden volver a separar.
 *      ⚠️ Los 33 reclamos vivos tienen HOY las dos fechas iguales, así que
 *      ningún número visible cambió: lo que se fue es la segunda regla.
 *
 *   3. 🩸 TRES GRAFÍAS DE LA MISMA FECHA. El Excel escribía «26/08/2026», la
 *      portada del PDF «09/20/2026» —`toLocaleDateString("es-PA")` en el
 *      servidor pone el MES ADELANTE, como en inglés: ese «Generado el» decía
 *      el 20 de septiembre y se lee «9 de veinte»— y la cabecera de cada hoja
 *      «26 ago 2026». Ahora es una sola: el `fmtDate` de la casa.
 *
 * El barrido de código BORRA LOS COMENTARIOS PRIMERO: un candado no se cumple
 * con una palabra que está dentro de la explicación de la regla.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import XLSX from "xlsx-js-style";

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: false,
  supabaseServer: {
    storage: {
      from: () => ({
        download: async () => ({ data: null, error: { message: "sin fotos en el test" } }),
      }),
    },
  },
}));

import { buildBulkReclamosExcel } from "@/lib/reclamos/excel-bulk";
import { buildBulkReclamosPdf } from "@/lib/reclamos/pdf-bulk";
import { fechaDeLaCabecera } from "@/lib/reclamos/papel";
import { fmtDate } from "@/lib/format";

const RAIZ = join(__dirname, "..", "..", "..");
const sinComentarios = (ruta: string): string =>
  readFileSync(join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── Dos reclamos de Fashion Wear, con los datos de FW-2026-0007 y FW-2026-0006
//    (producción, 20-sep-2026). Al segundo se le separa a propósito la fecha
//    del reclamo de la de la factura: es la única forma de ver cuál de las dos
//    llega al papel.
const REC_A = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  nro_reclamo: "FW-2026-0007",
  empresa: "Fashion Wear",
  proveedor: "American Fashion Wear",
  marca: "Tommy Hilfiger",
  nro_factura: "200004329",
  nro_orden_compra: "80174924",
  fecha_factura: "2026-08-26",
  fecha_reclamo: "2026-08-26",
  estado: "Creado",
  reclamo_items: [
    { referencia: "76J4869YCI", descripcion: "CAMISETA PARA DAMA", talla: " TODAS", genero: "Women", cantidad: 120, precio_unitario: 9.6, motivo: "Mercancía manchada" },
    { referencia: "76J4818YCI", descripcion: "CAMISETA PARA DAMA", talla: " TODAS", genero: "Women", cantidad: 120, precio_unitario: 9.6, motivo: "Mercancía manchada" },
  ],
  reclamo_fotos: [],
  reclamo_settlements: [],
};

const REC_B = {
  id: "aaaaaaaa-0000-0000-0000-000000000002",
  nro_reclamo: "FW-2026-0006",
  empresa: "Fashion Wear",
  proveedor: "American Fashion Wear",
  marca: "Tommy Hilfiger",
  nro_factura: "2000013478",
  nro_orden_compra: "",
  // 🔑 La factura es de mayo y el reclamo se levantó en julio: el papel tiene
  //    que decir MAYO por los dos lados.
  fecha_factura: "2026-05-13",
  fecha_reclamo: "2026-07-21",
  estado: "Pagado",
  reclamo_items: [
    { referencia: "78J1234YCI", descripcion: "PANTALON PARA DAMA", talla: "M", cantidad: 10, precio_unitario: 13, motivo: "Mercancía manchada" },
  ],
  reclamo_fotos: [],
  reclamo_settlements: [],
};

const LOTE = [REC_A, REC_B] as unknown as Parameters<typeof buildBulkReclamosExcel>[0];

// ── Lo que el Excel de verdad dice ───────────────────────────────────────────

interface Celda { v?: unknown }

async function libroDelCorreo(): Promise<XLSX.WorkBook> {
  const buf = await buildBulkReclamosExcel(LOTE, "Fashion Wear", null);
  return XLSX.read(buf, { type: "buffer" });
}

function textosDelLibro(wb: XLSX.WorkBook): string[] {
  const out: string[] = [];
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre];
    for (const k of Object.keys(ws)) {
      if (k.startsWith("!")) continue;
      const v = (ws[k] as Celda).v;
      if (v !== undefined && v !== null) out.push(String(v));
    }
  }
  return out;
}

// ── Lo que el PDF de verdad dibuja (del content stream, no del código) ───────

/** Deshace el escapado de un string literal de PDF: `\(`, `\\` y octales. */
function desescapar(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "\\") { out += s[i]; continue; }
    const sig = s[i + 1];
    if (sig >= "0" && sig <= "7") {
      out += String.fromCharCode(parseInt(s.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      out += sig;
      i += 1;
    }
  }
  return out;
}

async function cadenasDelPdf(): Promise<string[]> {
  const doc = await buildBulkReclamosPdf(LOTE as never, "Fashion Wear", { nombre_contacto: "Isaac Amar" });
  const raw = Buffer.from(doc.output("arraybuffer")).toString("latin1");
  const out: string[] = [];
  for (const stream of raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    const cuerpo = stream[1];
    if (!cuerpo.includes("BT")) continue;
    for (const t of cuerpo.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) out.push(desescapar(t[1]));
  }
  return out;
}

/** «26/08/2026», «09/20/2026», «2026-08-26»: cualquier fecha que no sea la de la casa. */
const FECHA_CON_BARRAS = /\b\d{1,4}[/-]\d{1,2}[/-]\d{2,4}\b/;
/** La única forma admitida: la de `fmtDate` — «26 ago 2026». */
const FECHA_DE_LA_CASA = /^\d{1,2} [a-zñáéíóú]{3,4} \d{4}$/;

// ─────────────────────────────────────────────────────────────────────────────
describe("A. «ESTADO» NO SALE DE LA CASA", () => {
  it("el Excel que viaja al proveedor no tiene la columna «Estado»", async () => {
    const wb = await libroDelCorreo();
    const resumen = wb.Sheets["Resumen"];
    const encabezados = Object.keys(resumen)
      .filter((k) => /^[A-Z]+1$/.test(k))
      .map((k) => String((resumen[k] as Celda).v ?? ""));
    expect(encabezados).toEqual([
      "N° Reclamo", "Factura", "Fecha", "Subtotal", "Importación", "ITBMS", "Total", "# Fotos",
    ]);
    expect(encabezados).not.toContain("Estado");
  });

  it("ni una sola celda del Excel dice «Creado» ni «Pagado» — son palabras de adentro", async () => {
    const textos = textosDelLibro(await libroDelCorreo());
    // El fixture SÍ los trae: si el papel los escribiera, acá estarían.
    expect(REC_A.estado).toBe("Creado");
    expect(REC_B.estado).toBe("Pagado");
    expect(textos).not.toContain("Creado");
    expect(textos).not.toContain("Pagado");
  });

  it("la portada del PDF tampoco los dibuja, ni el rótulo ni los valores", async () => {
    const cadenas = await cadenasDelPdf();
    expect(cadenas).toContain("N° Reclamo");
    expect(cadenas).not.toContain("Estado");
    expect(cadenas).not.toContain("Creado");
    expect(cadenas).not.toContain("Pagado");
  });

  it("nadie vuelve a meterla: ni `rec.estado` ni `r.estado` llegan a una celda del papel", () => {
    for (const ruta of ["src/lib/reclamos/excel-bulk.ts", "src/lib/reclamos/pdf-bulk.ts"]) {
      const src = sinComentarios(ruta);
      expect(src).not.toMatch(/["']Estado["']/);
      expect(src).not.toMatch(/\brec\.estado\s*\|\|/);
      expect(src).not.toMatch(/\br\.estado\s*\|\|/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. UNA SOLA FECHA EN TODO EL ARCHIVO: LA DE LA FACTURA", () => {
  it("el Resumen fecha por la FACTURA, no por el reclamo", async () => {
    const wb = await libroDelCorreo();
    const resumen = wb.Sheets["Resumen"];
    // Fila 2 = FW-2026-0007, fila 3 = FW-2026-0006 (el del desfase).
    expect(String((resumen["A3"] as Celda).v)).toBe("FW-2026-0006");
    expect(String((resumen["C3"] as Celda).v)).toBe(fmtDate("2026-05-13"));
    expect(String((resumen["C3"] as Celda).v)).not.toBe(fmtDate("2026-07-21"));
  });

  it("el Resumen y la hoja de detalle del MISMO reclamo dicen la misma fecha", async () => {
    const wb = await libroDelCorreo();
    const enResumen = String((wb.Sheets["Resumen"]["C3"] as Celda).v);
    const detalle = wb.Sheets["FW-2026-0006"];
    const filaFecha = Object.keys(detalle).find(
      (k) => /^A\d+$/.test(k) && String((detalle[k] as Celda).v) === "Fecha de factura",
    );
    expect(filaFecha).toBeTruthy();
    const enDetalle = String((detalle[filaFecha!.replace("A", "B")] as Celda).v);
    expect(enDetalle).toBe(enResumen);
  });

  it("la fecha del reclamo (21 jul) NO se dibuja en ninguna parte del papel", async () => {
    const delReclamo = fmtDate("2026-07-21");
    const deLaFactura = fmtDate("2026-05-13");
    expect(delReclamo).not.toBe(deLaFactura);
    // Excel: ni en el Resumen ni en la hoja de detalle.
    expect(textosDelLibro(await libroDelCorreo())).not.toContain(delReclamo);
    // PDF: ni en la portada ni en la cabecera de la hoja.
    const cadenas = await cadenasDelPdf();
    expect(cadenas).not.toContain(delReclamo);
    // Y la de la factura sí aparece DOS veces: la portada y la hoja de detalle.
    expect(cadenas.filter((t) => t === deLaFactura)).toHaveLength(2);
  });

  it("la fecha sale de `fechaDeLaCabecera`, el módulo del papel, en las dos superficies", () => {
    for (const ruta of ["src/lib/reclamos/excel-bulk.ts", "src/lib/reclamos/pdf-bulk.ts"]) {
      expect(sinComentarios(ruta)).toMatch(/fechaDeLaCabecera\(/);
    }
    // Y el Resumen ya no sabe nada de `fecha_reclamo`.
    expect(sinComentarios("src/lib/reclamos/excel-bulk.ts")).not.toMatch(/fecha_reclamo\)/);
    expect(fechaDeLaCabecera(REC_B)).toBe("2026-05-13");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. UNA SOLA GRAFÍA DE FECHA: LA DE `fmtDate`", () => {
  it("el Excel no escribe ni una fecha con barras", async () => {
    const malas = textosDelLibro(await libroDelCorreo()).filter((t) => FECHA_CON_BARRAS.test(t));
    expect(malas).toEqual([]);
  });

  it("el PDF tampoco — ni en la tabla, ni en el «Generado el» de la portada", async () => {
    const cadenas = await cadenasDelPdf();
    const malas = cadenas.filter((t) => FECHA_CON_BARRAS.test(t));
    expect(malas).toEqual([]);
    const generado = cadenas.find((t) => t.startsWith("Generado el "));
    expect(generado).toBeTruthy();
    expect(generado!.replace("Generado el ", "")).toMatch(FECHA_DE_LA_CASA);
  });

  it("las fechas que sí se escriben tienen la forma de la casa («26 ago 2026»)", async () => {
    const wb = await libroDelCorreo();
    expect(String((wb.Sheets["Resumen"]["C2"] as Celda).v)).toMatch(FECHA_DE_LA_CASA);
    expect(String((wb.Sheets["Resumen"]["C3"] as Celda).v)).toMatch(FECHA_DE_LA_CASA);
    const cadenas = await cadenasDelPdf();
    expect(cadenas).toContain(fmtDate("2026-08-26"));
    expect(cadenas).toContain(fmtDate("2026-05-13"));
  });

  it("no quedan formateadores de fecha propios en los dos papeles", () => {
    for (const ruta of ["src/lib/reclamos/excel-bulk.ts", "src/lib/reclamos/pdf-bulk.ts"]) {
      const src = sinComentarios(ruta);
      expect(src).not.toMatch(/toLocaleDateString/);
      expect(src).not.toMatch(/fmtFechaExcel/);
      expect(src).not.toMatch(/\$\{day\}\/\$\{m\}\/\$\{y\}/);
    }
  });
});
