/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 COMISIONES: UN SOLO BOTÓN, Y ES PDF (9-sep-2026)
 *
 * Daniel, textual: *«¿no podemos hacer un botón de PDF, ya que de PDF en la
 * compu paso a imprimir?»*. Desde un PDF ya se imprime, así que dos botones
 * para lo mismo sobran.
 *
 * 🩸 Y EL REPORTE NO ERA UN ARCHIVO. Se dibujaba en HTML dentro de un portal a
 * `<body>` y se llamaba a `window.print()`: lo que aparecía era el DIÁLOGO del
 * navegador y «Guardar como PDF» quedaba escondido adentro. Por eso «sale
 * impresión directa».
 *
 * ⚠️ LO QUE YA ESTABA RESUELTO Y NO SE PUEDE PERDER — se vigila acá:
 *
 *   1. **El nombre del archivo** (`Comisión-Edwin-Vistana-2026-08`). Con
 *      `window.print()` lo ponía Chrome desde el `document.title`, que en toda
 *      la app es «Fashion Group»: los doce reportes de un cierre bajaban con el
 *      mismo nombre. Ahora lo pone este código, y es el MISMO que usa el Excel.
 *   2. 🩸 **El PDF de una empresa NO se lleva el reporte de otra pegado atrás.**
 *      Con el papel en HTML, la hoja del detalle abierto también vivía en
 *      `<body>` y entraba al mismo trabajo de impresión.
 *   3. **Sale igual desde el modal y desde el detalle de abajo** — antes lo
 *      garantizaba el portal; ahora, que las dos formas llaman al mismo
 *      generador.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  COLUMNAS_COBROS,
  COLUMNAS_VENTAS,
  encabezadoReporte,
  filasVentas,
  lineasDelCierre,
  totalAPagarComision,
  type HojaReporte,
} from "@/lib/comisiones/reporte-comision";
import { construirPdfComision } from "@/lib/comisiones/pdf-comision";
import { nombreArchivoComision } from "@/lib/comisiones/nombre-archivo";
import type { ComisionDetalle } from "@/lib/ventas/comisionExcel";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
/** El código sin comentarios: las historias nombran a propósito lo retirado. */
const plano = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

async function textoDelPdf(doc: { output: (t: "arraybuffer") => ArrayBuffer }): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(doc.output("arraybuffer")),
    useSystemFonts: true,
  }).promise;
  let texto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    texto += ((await page.getTextContent()).items as any[]).map((it) => it.str).join(" ") + "\n";
  }
  return texto.replace(/\s+/g, " ");
}

const EDWIN: ComisionDetalle = {
  empresa_key: "vistana",
  year: 2026,
  mes: 8,
  vendedor: "EDWIN",
  tasa_venta: 0.005,
  tasa_cobro: 0.005,
  ventas: [
    { fecha: "2026-08-03", cliente: "City Mall", secuencial: "11-000003022", tipo: "Factura", subtotal: 1000, pct_utilidad: 30 },
    { fecha: "2026-08-11", cliente: "City Mall", secuencial: "11-000003044", tipo: "Nota de Crédito", subtotal: -250, pct_utilidad: null },
  ],
  cobros: [{ fecha: "2026-08-20", cliente: "City Mall", monto: 800 }],
  ventas_base: 750,
  cobros_base: 800,
  comision_venta: 3.75,
  comision_cobro: 4,
  comision_total: 7.75,
};

const REYNALDO: ComisionDetalle = {
  ...EDWIN,
  empresa_key: "fashion_shoes",
  vendedor: "REYNALDO ESPINOSA",
  ventas: [
    { fecha: "2026-08-05", cliente: "Sporting Shoes", secuencial: "12-000000777", tipo: "Factura", subtotal: 4000, pct_utilidad: 41 },
  ],
  cobros: [],
  ventas_base: 4000,
  cobros_base: 0,
  comision_venta: 20,
  comision_cobro: 0,
  comision_total: 20,
};

const hoja = (data: ComisionDetalle, empresaNombre: string, descuentos: HojaReporte["descuentos"] = []): HojaReporte => ({
  data,
  descuentos,
  empresaNombre,
  vendedor: data.vendedor,
  year: data.year,
  mes: data.mes,
});

// ═════════════════════════════════════════════════════════════════════════════
// 1 · UN SOLO BOTÓN, Y DICE «PDF»
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 1. el detalle tiene UN botón de papel y dice «PDF»", () => {
  const modal = plano(leer("src/components/ventas/ComisionesDetalleModal.tsx"));

  it("el botón dice PDF", () => {
    expect(modal).toContain("> PDF");
  });

  it("🔴 y NO quedó un «Imprimir» al lado: dos botones para lo mismo sobran", () => {
    expect(modal).not.toContain("Imprimir");
    expect(modal).not.toContain("Printer");
  });

  it("🩸 el detalle ya NO manda el reporte por el diálogo del navegador", () => {
    expect(modal).not.toContain("window.print");
    expect(modal).not.toContain("imprimirComo(");
    const motor = plano(leer("src/components/ventas/comisiones-detalle/useDescargaComision.tsx"));
    expect(motor).not.toContain("window.print");
    expect(motor).not.toContain("imprimirComo(");
  });

  it("y baja un PDF de verdad: el generador guarda un archivo `.pdf`", () => {
    const gen = plano(leer("src/lib/comisiones/pdf-comision.ts"));
    expect(gen).toContain("new jsPDF(");
    expect(gen).toContain(".save(`${nombreSinExtension}.pdf`)");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · EL NOMBRE DEL ARCHIVO NO SE PIERDE
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 2. el archivo NO se llama «Fashion Group.pdf»", () => {
  it("el nombre sale de la misma función que usa el Excel", () => {
    expect(nombreArchivoComision("EDWIN", "vistana", 2026, 8)).toBe("Comisión-Edwin-Vistana-2026-08");
  });

  it("🔴 y lo pone el código, no el `document.title` del navegador", () => {
    const gen = plano(leer("src/lib/comisiones/pdf-comision.ts"));
    expect(gen).not.toContain("document.title");
    // Los dos caminos (el botón del detalle y la flechita) le pasan el nombre.
    expect(plano(leer("src/components/ventas/ComisionesDetalleModal.tsx")))
      .toContain("nombreArchivo,");
    expect(plano(leer("src/components/ventas/comisiones-detalle/useDescargaComision.tsx")))
      .toContain("nombreDe(empresas, vendedor)");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · 🩸 UN REPORTE NO ARRASTRA OTRO
// ═════════════════════════════════════════════════════════════════════════════

describe("🩸 3. el PDF de una empresa no se lleva el de otra pegado atrás", () => {
  it("con UNA hoja, solo esa empresa aparece en el documento", async () => {
    const texto = await textoDelPdf(construirPdfComision([hoja(EDWIN, "Vistana")]));
    expect(texto).toContain("Vistana");
    expect(texto, "se coló otro reporte").not.toContain("Fashion Shoes");
    expect(texto).not.toContain("Reynaldo");
  });

  it("con DOS hojas salen las dos, cada una con su encabezado", async () => {
    const doc = construirPdfComision([hoja(EDWIN, "Vistana"), hoja(REYNALDO, "Fashion Shoes")]);
    const texto = await textoDelPdf(doc);
    expect(texto).toContain("Vistana");
    expect(texto).toContain("Fashion Shoes");
    // Un reporte por hoja: nunca se pegan a media página.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });

  it("🔴 el documento se arma SOLO con lo que se le pasa: no lee el DOM", () => {
    const gen = plano(leer("src/lib/comisiones/pdf-comision.ts"));
    for (const prohibido of ["document.querySelector", "document.body", "createPortal", "innerHTML"]) {
      expect(gen, prohibido).not.toContain(prohibido);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · SALE IGUAL DESDE EL MODAL Y DESDE EL DETALLE DE ABAJO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 4. las dos formas del detalle bajan el MISMO archivo", () => {
  it("hay UN solo generador y las dos superficies lo llaman", () => {
    for (const f of [
      "src/components/ventas/ComisionesDetalleModal.tsx",
      "src/components/ventas/comisiones-detalle/useDescargaComision.tsx",
    ]) {
      expect(plano(leer(f)), f).toContain("descargarPdfComision");
      // Nadie se escribe su propio jsPDF.
      expect(plano(leer(f)), f).not.toContain("new jsPDF");
    }
  });

  it("el modal y el detalle inline son el MISMO componente", () => {
    const modal = plano(leer("src/components/ventas/ComisionesDetalleModal.tsx"));
    expect(modal).toContain('data-comision-detalle="inline"');
    expect(modal).toContain('data-comision-detalle="modal"');
  });

  it("🔄 y ya no hay hoja HTML montada en <body> (el portal se retiró)", () => {
    const modal = plano(leer("src/components/ventas/ComisionesDetalleModal.tsx"));
    expect(modal).not.toContain("ImpresionComision");
    expect(modal).not.toContain("createPortal");
    // ⚠️ El archivo NO se borra: queda con su nota fechada y su calibración.
    expect(leer("src/components/ventas/comisiones-detalle/ImpresionComision.tsx"))
      .toContain("RETIRADO EL 9-SEP-2026");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · EL PAPEL SIGUE DICIENDO LO MISMO
// ═════════════════════════════════════════════════════════════════════════════

describe("⚠️ 5. lo que el papel dice no cambió", () => {
  it("🔴 la factura va LARGA y la columna «Tipo» se queda", async () => {
    expect([...COLUMNAS_VENTAS]).toEqual(["Fecha", "Cliente", "Factura", "Tipo", "Subtotal"]);
    expect([...COLUMNAS_COBROS]).toEqual(["Fecha", "Cliente", "Monto"]);
    const celdas = filasVentas(EDWIN).map((f) => f.celdas);
    expect(celdas[0]).toContain("11-000003022");
    expect(celdas[0]).toContain("FA");
    expect(celdas[1]).toContain("NC");
    const texto = await textoDelPdf(construirPdfComision([hoja(EDWIN, "Vistana")]));
    expect(texto).toContain("11-000003022");
  });

  it("la nota de crédito se marca para pintarse en rojo", () => {
    expect(filasVentas(EDWIN)[1].negativo).toBe(true);
    expect(filasVentas(EDWIN)[0].negativo).toBe(false);
  });

  it("el encabezado dice de quién, de qué empresa y de qué período", () => {
    expect(encabezadoReporte(hoja(EDWIN, "Vistana")))
      .toBe("Comisión — Edwin · Vistana · Agosto 2026");
  });

  it("⚠️ los totales salen del RPC: acá no se recalcula ninguno", async () => {
    const texto = await textoDelPdf(construirPdfComision([hoja(EDWIN, "Vistana")]));
    expect(texto).toContain("TOTAL VENTAS");
    expect(texto).toContain("TOTAL COBROS");
    expect(texto).toContain("CIERRE");
    // 750 + 800, el número del RPC — no la suma de las líneas redondeadas.
    expect(texto).toContain("$1,550.00");
  });

  it("🔴 el descuento se resta UNA vez y se ve en el cierre", () => {
    const con = hoja(EDWIN, "Vistana", [
      { id: "d1", concepto: "Descuento", monto: 1.75, activo: true },
      { id: "d2", concepto: "Apagado este mes", monto: 100, activo: false },
    ]);
    expect(totalAPagarComision(con.data, con.descuentos)).toBe(6);
    const rotulos = lineasDelCierre(con.data, con.descuentos).map((l) => l.rotulo);
    expect(rotulos).toContain("Subtotal comisión");
    expect(rotulos).toContain("Descuento");
    expect(rotulos).toContain("Total a pagar");
    // El apagado no se imprime: no es la deducción de este mes.
    expect(rotulos).not.toContain("Apagado este mes");
  });

  it("sin descuentos la última línea dice «Comisión total» (CONTROL)", () => {
    const rotulos = lineasDelCierre(EDWIN, []).map((l) => l.rotulo);
    expect(rotulos).toContain("Comisión total");
    expect(rotulos).not.toContain("Total a pagar");
    expect(totalAPagarComision(EDWIN, [])).toBe(7.75);
  });
});
