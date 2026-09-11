/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — EL PAPEL DEL RECLAMO: PDF Y EXCEL CON EL ORDEN DE LA PANTALLA
 * (11-sep-2026, mockup aprobado por Daniel).
 *
 * Lo que protege:
 *   1. Las columnas son las de la pantalla, en su orden, y las VACÍAS no se
 *      dibujan. Medido contra producción el 11-sep-2026: de los 33 reclamos
 *      vivos, CERO traen «Factura» o «PO» por renglón y solo 8 traen «Género»,
 *      así que el papel normal es de SIETE columnas. Dibujarlas igual es
 *      regalarle a tres columnas de guiones el ancho que necesita la
 *      descripción.
 *   2. El pie de totales va a la derecha, uno debajo del otro, con el Total en
 *      negrita: Subtotal · Importación N% · ITBMS N% · Total. Se fueron las
 *      cuatro cajas que abrían el papel antes de decir de qué reclamo hablaba.
 *   3. Los números del papel son los de la pantalla AL CENTAVO. REC-2026-0026
 *      (Vistana, 10 renglones, medido contra producción):
 *        Subtotal 376,65 · Importación 37,67 · ITBMS 29,00 · Total 443,32.
 *   4. El Excel del correo sigue sin un solo `http` (encargo A).
 *   5. El PDF y el Excel salen del MISMO módulo: separarlos otra vez es volver
 *      a tener tres listas de columnas diciendo cosas distintas.
 *
 * Los barridos BORRAN LOS COMENTARIOS PRIMERO.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import XLSX from "xlsx-js-style";

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: false,
  supabaseServer: {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((p) => ({ path: p, signedUrl: `https://signed.example/${p}` })),
          error: null,
        }),
        download: async () => ({ data: null, error: { message: "sin fotos en el test" } }),
      }),
    },
  },
}));

import {
  columnasDelPapel,
  datosDelPapel,
  fechaDeLaCabecera,
  itemsDelPapel,
  PIE_PAPEL,
  subtotalDelPapel,
  totalesDelPapel,
  valorDeCelda,
} from "@/lib/reclamos/papel";
import { buildReclamoSheet } from "@/lib/excel-reclamo";
import { buildBulkReclamosPdf } from "@/lib/reclamos/pdf-bulk";
import { buildBulkReclamosExcel } from "@/lib/reclamos/excel-bulk";
import { fmt } from "@/lib/format";

const RAIZ = join(__dirname, "..", "..", "..");
const sinComentarios = (ruta: string): string =>
  readFileSync(join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

let HAY_PDFTOTEXT = false;
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-papel";
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    HAY_PDFTOTEXT = true;
  } catch {
    HAY_PDFTOTEXT = false;
  }
});

// REC-2026-0026 tal como vive en producción (medido el 11-sep-2026 con
// scripts/_medir-reclamos-papel.mjs): 10 renglones, subtotal 376,65, y NINGUNA
// fila con género, factura ni PO propios.
const RENGLONES_0026 = [
  { referencia: "QF8518433", descripcion: "PANTI PARA DAMA", talla: "S", cantidad: 1, precio_unitario: 7.0, motivo: "sobrante" },
  { referencia: "4D5081G001", descripcion: "GORRA PARA HOMBRE", talla: "OS", cantidad: 2, precio_unitario: 12.8, motivo: "sobrante" },
  { referencia: "4RF216G410", descripcion: "POLO PARA HOMBRE M/C", talla: "M", cantidad: 8, precio_unitario: 19.2, motivo: "SOBRANTE" },
  { referencia: "RESTO", descripcion: "El resto de los renglones", talla: "U", cantidad: 1, precio_unitario: 190.45, motivo: "sobrante" },
];
const REC_0026 = {
  id: "11111111-2222-3333-4444-555555555555",
  nro_reclamo: "REC-2026-0026",
  empresa: "Vistana International",
  proveedor: "American Designer Fashion",
  marca: "Calvin Klein",
  nro_factura: "3000014229",
  nro_orden_compra: "",
  fecha_factura: "2026-06-19",
  fecha_reclamo: "2026-06-24",
  estado: "Creado",
  reclamo_items: RENGLONES_0026,
  reclamo_fotos: [],
};
const CONTACTO = { nombre_contacto: "Isaac Amar" };

function textoDelLibro(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  const trozos: string[] = [];
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre];
    for (const k of Object.keys(ws)) {
      if (k.startsWith("!")) continue;
      const celda = ws[k] as { v?: unknown; l?: { Target?: string } };
      if (celda.v !== undefined) trozos.push(String(celda.v));
      if (celda.l?.Target) trozos.push(celda.l.Target);
    }
  }
  return trozos.join("\n");
}

async function textoDelPdf(rec: Record<string, unknown>): Promise<string> {
  const doc = await buildBulkReclamosPdf([rec as never], String(rec.empresa), CONTACTO);
  const dir = mkdtempSync(path.join(tmpdir(), "reclamos-papel-"));
  const pdfPath = path.join(dir, "r.pdf");
  writeFileSync(pdfPath, Buffer.from(doc.output("arraybuffer")));
  execFileSync("pdftotext", ["-layout", pdfPath, path.join(dir, "r.txt")]);
  return readFileSync(path.join(dir, "r.txt"), "utf8");
}

describe("(1) las columnas son las de la pantalla, y las vacías no se dibujan", () => {
  it("sin género, sin factura y sin PO por renglón: SIETE columnas", () => {
    const cols = columnasDelPapel(RENGLONES_0026).map((c) => c.rotulo);
    expect(cols).toEqual(["Estilo", "Descripción", "Talla", "Cant.", "Precio", "Subtotal", "Motivo"]);
  });

  it("con género en UNA sola fila, la columna Género aparece", () => {
    const cols = columnasDelPapel([...RENGLONES_0026, { ...RENGLONES_0026[0], genero: "Men" }]).map((c) => c.rotulo);
    expect(cols).toEqual(["Estilo", "Descripción", "Talla", "Género", "Cant.", "Precio", "Subtotal", "Motivo"]);
  });

  it("con factura y PO por renglón salen las diez, en el orden de la pantalla", () => {
    const cols = columnasDelPapel([
      { ...RENGLONES_0026[0], genero: "Men", nro_factura: "F-1", nro_orden_compra: "PO-9" },
    ]).map((c) => c.rotulo);
    expect(cols).toEqual([
      "Estilo", "Descripción", "Talla", "Género", "Cant.", "Precio", "Subtotal", "Motivo", "Factura", "PO",
    ]);
  });

  it("una columna llena de espacios NO cuenta como llena", () => {
    const cols = columnasDelPapel([{ ...RENGLONES_0026[0], genero: "   " }]).map((c) => c.rotulo);
    expect(cols).not.toContain("Género");
  });

  it("los renglones borrados no se dibujan ni se suman", () => {
    const items = itemsDelPapel({ reclamo_items: [...RENGLONES_0026, { ...RENGLONES_0026[0], deleted: true }] });
    expect(items).toHaveLength(RENGLONES_0026.length);
    expect(subtotalDelPapel(items)).toBeCloseTo(376.65, 6);
  });

  it("el motivo se capitaliza con la MISMA función de la pantalla", () => {
    expect(valorDeCelda({ motivo: "sobrante" }, "motivo")).toBe("Sobrante");
    expect(valorDeCelda({ motivo: "SOBRANTE" }, "motivo")).toBe("Sobrante");
  });

  it("la cantidad y el precio salen como NÚMERO, no como texto", () => {
    expect(valorDeCelda(RENGLONES_0026[1], "cantidad")).toBe(2);
    expect(valorDeCelda(RENGLONES_0026[1], "precio_unitario")).toBe(12.8);
    expect(valorDeCelda(RENGLONES_0026[1], "subtotal")).toBeCloseTo(25.6, 6);
  });
});

describe("(2) el pie de totales, a la derecha y uno debajo del otro", () => {
  it("son cuatro renglones y el Total es el fuerte", () => {
    const t = totalesDelPapel("Vistana International", 376.65);
    expect(t.map((x) => x.rotulo)).toEqual(["Subtotal", "Importación 10%", "ITBMS 7%", "Total"]);
    expect(t.filter((x) => x.fuerte).map((x) => x.rotulo)).toEqual(["Total"]);
  });

  it("Active Shoes no lleva ITBMS y su importación es 15%", () => {
    const t = totalesDelPapel("Active Shoes", 1000);
    expect(t.map((x) => x.rotulo)).toEqual(["Subtotal", "Importación 15%", "Total"]);
    expect(t[2].valor).toBeCloseTo(1150, 6);
  });

  it("el porcentaje NO está escrito a mano: sale de la tasa que hace la cuenta", () => {
    const puro = sinComentarios("src/lib/reclamos/papel.ts");
    expect(puro).toContain("impLabel");
    expect(puro).toContain("itbmsLabel");
    expect(puro).not.toMatch(/"(?:Importación|ITBMS) \d/);
  });
});

describe("(3) los números del papel son los de la pantalla AL CENTAVO", () => {
  it("REC-2026-0026: 376,65 · 37,67 · 29,00 · 443,32", () => {
    const sub = subtotalDelPapel(RENGLONES_0026);
    expect(sub).toBeCloseTo(376.65, 6);
    const t = totalesDelPapel("Vistana International", sub);
    // 🔑 Se compara con el MISMO formateador que usa la pantalla (`fmt`), no
    // con `toFixed`: la importación es 37,665 exactos y las dos formas de
    // redondear no dan lo mismo — `toFixed` baja a 37,66 y la pantalla muestra
    // 37,67. Medir el papel con otro redondeo es cómo nace un candado verde
    // sobre un papel que dice un centavo distinto que la pantalla.
    expect(t.map((x) => fmt(x.valor))).toEqual(["376.65", "37.67", "29.00", "443.32"]);
  });

  it("el Excel escribe esos mismos cuatro números, como NÚMERO", () => {
    const ws = buildReclamoSheet(REC_0026, RENGLONES_0026 as unknown as Record<string, unknown>[], [], { contacto: CONTACTO });
    // 🔴 El Excel guarda el valor CRUDO (para que Excel lo pueda sumar) con
    // formato de moneda: lo que se compara es cómo se VE, con `fmt`.
    const vistos = Object.keys(ws)
      .filter((k) => !k.startsWith("!") && (ws[k] as { t?: string }).t === "n")
      .map((k) => fmt((ws[k] as { v: number }).v));
    for (const esperado of ["376.65", "37.67", "29.00", "443.32"]) expect(vistos).toContain(esperado);
  });

  it("el PDF imprime esos mismos cuatro números", async () => {
    if (!HAY_PDFTOTEXT) return;
    const texto = await textoDelPdf(REC_0026);
    for (const esperado of ["$376.65", "$37.67", "$29.00", "$443.32"]) expect(texto).toContain(esperado);
  });
});

describe("(4) el papel dice lo que el mockup pide, y en ese orden", () => {
  it("la cabecera lleva FASHION GROUP, la empresa, el reclamo y la fecha de la factura", async () => {
    if (!HAY_PDFTOTEXT) return;
    const texto = await textoDelPdf(REC_0026);
    expect(texto).toContain("FASHION GROUP");
    expect(texto).toContain("Vistana International");
    expect(texto).toContain("Reclamo REC-2026-0026");
    expect(texto).toContain("19 jun 2026");
  });

  it("la línea de datos dice proveedor, marca, factura y contacto", async () => {
    if (!HAY_PDFTOTEXT) return;
    const texto = await textoDelPdf(REC_0026);
    expect(texto).toContain("American Designer Fashion");
    expect(texto).toContain("Calvin Klein");
    expect(texto).toContain("3000014229");
    expect(texto).toContain("Isaac Amar");
  });

  it("el pie es el de la casa", async () => {
    if (!HAY_PDFTOTEXT) return;
    expect(PIE_PAPEL).toBe("Confidencial · fashiongr.com");
    const texto = await textoDelPdf(REC_0026);
    expect(texto).toContain(PIE_PAPEL);
  });

  it("se fueron las CUATRO cajas de totales de arriba", async () => {
    if (!HAY_PDFTOTEXT) return;
    const texto = await textoDelPdf(REC_0026);
    // La caja ponía el rótulo en versal; el pie nuevo lo escribe normal.
    expect(texto).not.toContain("TOTAL A ACREDITAR");
    expect(texto).not.toContain("IMPORTACIÓN");
    // Y el total va DESPUÉS de los renglones, no antes.
    expect(texto.indexOf("QF8518433")).toBeGreaterThan(-1);
    expect(texto.indexOf("$443.32")).toBeGreaterThan(texto.indexOf("QF8518433"));
  });

  it("la columna «Género» no se dibuja en el PDF de este reclamo", async () => {
    if (!HAY_PDFTOTEXT) return;
    const texto = await textoDelPdf(REC_0026);
    expect(texto).not.toContain("Género");
    expect(texto).not.toMatch(/\bPO\b/);
  });

  it("lo que no existe NO se escribe en la línea de datos", () => {
    const datos = datosDelPapel({ ...REC_0026, marca: "", proveedor: "" }, null).map((d) => d.rotulo);
    expect(datos).not.toContain("Marca");
    expect(datos).not.toContain("Proveedor");
    expect(datos).not.toContain("Contacto");
    expect(datos).toContain("Factura");
  });

  it("Active Shoes no ofrece PO en la línea de datos", () => {
    const datos = datosDelPapel({ ...REC_0026, empresa: "Active Shoes", nro_orden_compra: "PO-1" }, null).map((d) => d.rotulo);
    expect(datos).not.toContain("PO");
  });

  it("sin fecha de factura la cabecera cae a la del reclamo, NUNCA a «hoy»", () => {
    expect(fechaDeLaCabecera({ ...REC_0026, fecha_factura: null })).toBe("2026-06-24");
    expect(fechaDeLaCabecera({ fecha_factura: null, fecha_reclamo: null })).toBeNull();
  });
});

describe("(5) el Excel del correo sigue sin un solo link", () => {
  it("sin conLinks, el libro entero no contiene `http`", async () => {
    const buf = await buildBulkReclamosExcel(
      [{ ...REC_0026, factura_pdf_path: "r/f.pdf", reclamo_fotos: [{ storage_path: "r/1.jpg" }] }] as never,
      "Vistana International",
      CONTACTO,
      { conLinks: false },
    );
    expect(textoDelLibro(buf)).not.toMatch(/http/i);
  });

  it("el Excel lleva la ficha y el pie del papel", () => {
    const ws = buildReclamoSheet(REC_0026, RENGLONES_0026 as unknown as Record<string, unknown>[], [], { contacto: CONTACTO });
    const texto = Object.keys(ws)
      .filter((k) => !k.startsWith("!"))
      .map((k) => String((ws[k] as { v?: unknown }).v ?? ""))
      .join("\n");
    expect(texto).toContain("FASHION GROUP");
    expect(texto).toContain("Vistana International");
    expect(texto).toContain("Fecha de factura");
    expect(texto).toContain("Isaac Amar");
    expect(texto).toContain("Total:");
    expect(texto).not.toContain("TOTAL A ACREDITAR");
  });
});

describe("(6) el PDF y el Excel salen del MISMO módulo", () => {
  it("las dos superficies leen `papel.ts` y ninguna escribe su propia lista de columnas", () => {
    for (const ruta of ["src/lib/excel-reclamo.ts", "src/lib/reclamos/pdf-bulk.ts"]) {
      const src = sinComentarios(ruta);
      expect(src).toContain("columnasDelPapel");
      expect(src).toContain("totalesDelPapel");
      // La lista vieja, escrita a mano, no puede volver.
      expect(src).not.toContain('"Código"');
      expect(src).not.toContain('"Precio Unit."');
    }
  });

  it("la pantalla, el PDF y el Excel usan la MISMA regla de columnas condicionales", () => {
    // La pantalla la escribe con `conGenero` / `conFactura` / `conPO`; el papel
    // con `columnasDelPapel`. Lo que se exige es que las tres claves sean las
    // mismas y que el papel no invente una cuarta condicional.
    const cols = columnasDelPapel([{ genero: "Men", nro_factura: "F", nro_orden_compra: "P" }]);
    const sinNada = columnasDelPapel([{}]);
    const perdidas = cols.filter((c) => !sinNada.some((s) => s.clave === c.clave)).map((c) => c.clave);
    expect(perdidas).toEqual(["genero", "nro_factura", "nro_orden_compra"]);
  });
});
