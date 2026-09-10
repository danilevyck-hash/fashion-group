/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 COMISIONES: EL PAPEL DEL MES Y EL DEL AÑO TAMBIÉN SON PDF (9-sep-2026)
 *
 * Daniel, textual: *«¿no podemos hacer un botón de PDF, ya que de PDF en la
 * compu paso a imprimir?»* y, al preguntarle si pasaba también los dos botones
 * de arriba: *«Los paso a PDF también, para que todo el módulo se comporte
 * igual»*.
 *
 * 🩸 LA MATRIZ NO ERA UN ARCHIVO. Se dibujaba en HTML dentro de un portal a
 * `<body>` y se llamaba a `window.print()`: salía el DIÁLOGO del navegador y
 * «Guardar como PDF» quedaba escondido adentro de un menú. Y «Descargar el año»
 * ni siquiera tenía papel: era Excel y nada más.
 *
 * ⚠️ LO QUE NO SE PUEDE PERDER — se vigila acá:
 *
 *   1. 🔴 **Ningún número se mueve.** El papel se arma de las MISMAS filas que
 *      están en pantalla y con el MISMO pie (`sumarPagable`). La prueba contra
 *      producción: `scripts/_medir-comisiones-papel-mes-anio.mjs`.
 *   2. **El nombre del archivo lo pone el código**, y es el MISMO que ya usa el
 *      Excel del mismo período. Con `window.print()` lo ponía Chrome desde el
 *      `document.title`, que en toda la app es «Fashion Group».
 *   3. 🩸 **Un papel no se lleva otro pegado atrás.** Con las hojas en HTML, la
 *      del detalle abierto también vivía en `<body>` y entraba al mismo trabajo
 *      de impresión.
 *   4. **Los que no se pagan** (Oficina y Daniel Levy) siguen escondidos en
 *      pantalla y siguen SALIENDO en el archivo, con su «(no se paga)».
 *   5. **El Excel no se tocó**: los dos son exactamente los de hoy.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  MAX_COLUMNAS_PARADO,
  TITULO_PAPEL_GRUPO,
  orientacionPapel,
  tituloPapelEmpresa,
  type TablaPapel,
} from "@/lib/comisiones/tabla-papel";
import { construirPdfTablaComisiones } from "@/lib/comisiones/pdf-tabla-comisiones";
import { rotuloDescargarExcel, rotuloDescargarPdf, conDescargaPorVendedor } from "@/lib/comisiones/descarga";
import { MES_TODO_EL_ANIO, etiquetaPeriodo, rotuloDescargarPeriodo } from "@/lib/comisiones/periodo";
import {
  nombreArchivoComisionesEmpresa,
  nombreArchivoComisionesMes,
} from "@/lib/comisiones/nombre-archivo";
import { ROTULO_NO_SE_PAGA, sumarPagable } from "@/lib/comisiones/sin-pago";
import { MENOS_EN_PDF, textoDePdf } from "@/lib/comisiones/pdf-chrome";
import { construirPdfComision } from "@/lib/comisiones/pdf-comision";
import { fmtMoney } from "@/lib/ventas/format";
import type { ComisionDetalle } from "@/lib/ventas/comisionExcel";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");
/** El código sin comentarios: las historias nombran a propósito lo retirado. */
const plano = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const MATRIZ = "src/components/ventas/ComisionesConsolidadoView.tsx";
const EMPRESA = "src/components/ventas/ComisionesPorEmpresaView.tsx";
const SHELL = "src/components/ventas/ComisionesView.tsx";
const GENERADOR = "src/lib/comisiones/pdf-tabla-comisiones.ts";

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

/** Septiembre 2026 medido: Reynaldo con su descuento adentro y la oficina aparte. */
const PAPEL_GRUPO: TablaPapel = {
  titulo: TITULO_PAPEL_GRUPO,
  subtitulo: etiquetaPeriodo(2026, 9),
  columnas: [
    { header: "Vendedor" },
    { header: "Vistana", numerica: true },
    { header: "Fashion Shoes", numerica: true },
    { header: "Total", numerica: true },
  ],
  filas: [
    { celdas: ["Reynaldo Espinosa", "$41.77", "−$1,513.08", "−$1,471.31"] },
    { celdas: ["Edwin", "$70.69", "$0.00", "$70.69"] },
    { celdas: [`Oficina (DEFAULT) (${ROTULO_NO_SE_PAGA})`, "$12.00", "$0.00", "$12.00"], apagada: true },
  ],
  totales: ["Total a pagar", "$112.46", "−$1,513.08", "−$1,400.62"],
};

// ═════════════════════════════════════════════════════════════════════════════
// 1 · UN SOLO BOTÓN POR FORMATO, Y EL PAPEL ES UN ARCHIVO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 1. el papel del período se BAJA, no se manda al diálogo del navegador", () => {
  it("el generador arma un PDF y lo guarda con extensión", () => {
    const gen = plano(leer(GENERADOR));
    expect(gen).toContain("new jsPDF(");
    expect(gen).toContain(".save(`${nombreSinExtension}.pdf`)");
  });

  it("🩸 y ninguna de las dos vistas llama a `window.print()`", () => {
    for (const vista of [MATRIZ, EMPRESA]) {
      const v = plano(leer(vista));
      expect(v, vista).not.toContain("window.print");
      expect(v, vista).not.toContain("imprimirComo(");
      expect(v, vista).not.toContain("afterprint");
      expect(v, vista).toContain("descargarPdfTablaComisiones(");
    }
  });

  it("⚠️ y la hoja HTML NO se borró: queda con su nota fechada", () => {
    const hoja = leer("src/components/ventas/comisiones-detalle/ImpresionTablaComisiones.tsx");
    expect(hoja).toContain("RETIRADO EL 9-SEP-2026");
    // Nadie la monta ya.
    for (const vista of [MATRIZ, EMPRESA]) {
      expect(plano(leer(vista)), vista).not.toContain("ImpresionTablaComisiones");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · EL AÑO SE COMPORTA IGUAL QUE EL MES
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 2. «Descargar el año» tiene los DOS formatos, igual que el mes", () => {
  it("los dos rótulos dicen el período y el formato", () => {
    expect(rotuloDescargarPdf(8)).toBe("Descargar el mes en PDF");
    expect(rotuloDescargarPdf(MES_TODO_EL_ANIO)).toBe("Descargar el año en PDF");
    expect(rotuloDescargarExcel(8)).toBe("Descargar el mes en Excel");
    expect(rotuloDescargarExcel(MES_TODO_EL_ANIO)).toBe("Descargar el año en Excel");
  });

  it("🔴 y el «el mes» / «el año» sigue saliendo de UN solo lugar", () => {
    for (const mes of [1, 8, 12, MES_TODO_EL_ANIO]) {
      expect(rotuloDescargarPdf(mes)).toBe(`${rotuloDescargarPeriodo(mes)} en PDF`);
      expect(rotuloDescargarExcel(mes)).toBe(`${rotuloDescargarPeriodo(mes)} en Excel`);
    }
    // La barra no escribe ninguno de los dos a mano.
    const shell = plano(leer(SHELL));
    expect(shell).toContain("rotuloDescargarPdf(mes)");
    expect(shell).toContain("rotuloDescargarExcel(mes)");
    expect(shell).not.toContain('"Descargar el mes');
    expect(shell).not.toContain('"Descargar el año');
  });

  it("⚠️ CONTROL: el reporte por VENDEDOR sigue siendo de un mes", () => {
    // La flechita de la celda es otra cosa: `comision_b2b_detalle` recibe year +
    // mes, así que con «Todo el año» no se dibuja. Que el papel de arriba sí
    // exista para el año no cambia eso.
    expect(conDescargaPorVendedor(8)).toBe(true);
    expect(conDescargaPorVendedor(MES_TODO_EL_ANIO)).toBe(false);
    expect(plano(leer(MATRIZ))).toContain("conDescargaPorVendedor(mes)");
  });

  it("el papel dice de qué período es, con la etiqueta de siempre", () => {
    expect(etiquetaPeriodo(2026, 9)).toBe("Septiembre 2026");
    expect(etiquetaPeriodo(2026, MES_TODO_EL_ANIO)).toBe("Todo 2026");
    for (const vista of [MATRIZ, EMPRESA]) {
      expect(plano(leer(vista)), vista).toContain("subtitulo: etiquetaPeriodo(year, mes)");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · EL NOMBRE DEL ARCHIVO NO SE PIERDE
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 3. el archivo NO se llama «Fashion Group.pdf»", () => {
  it("es el MISMO nombre que ya usa el Excel del mismo período", () => {
    expect(nombreArchivoComisionesMes(2026, 8)).toBe("comisiones-consolidado-2026-08");
    expect(nombreArchivoComisionesMes(2026, MES_TODO_EL_ANIO)).toBe("comisiones-consolidado-2026");
    expect(nombreArchivoComisionesEmpresa("vistana", 2026, 8)).toBe("comisiones-vistana-2026-08");
    expect(nombreArchivoComisionesEmpresa("vistana", 2026, MES_TODO_EL_ANIO)).toBe("comisiones-vistana-2026");
  });

  it("🔴 y lo pone el código, no el `document.title` del navegador", () => {
    expect(plano(leer(GENERADOR))).not.toContain("document.title");
    // Las dos vistas se lo pasan al generador.
    expect(plano(leer(MATRIZ))).toContain("nombreArchivoComisionesMes(year, mes)");
    expect(plano(leer(EMPRESA))).toContain("nombreArchivoComisionesEmpresa(empresa, year, mes)");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · 🩸 UN PAPEL NO ARRASTRA OTRO
// ═════════════════════════════════════════════════════════════════════════════

describe("🩸 4. el PDF del período no se lleva el reporte de un vendedor pegado atrás", () => {
  it("el documento se arma SOLO con la tabla que se le pasa: no lee el DOM", () => {
    const gen = plano(leer(GENERADOR));
    for (const prohibido of [
      "document.querySelector", "document.body", "createPortal", "innerHTML", "window.print",
    ]) {
      expect(gen, prohibido).not.toContain(prohibido);
    }
  });

  it("con la matriz del grupo, en el papel no aparece nada de otro reporte", async () => {
    const texto = await textoDelPdf(construirPdfTablaComisiones(PAPEL_GRUPO));
    expect(texto).toContain("Comisiones");
    expect(texto).toContain("Fashion Group");
    expect(texto).toContain("Reynaldo Espinosa");
    // Lo que llevaría el reporte de un vendedor y acá no tiene nada que hacer.
    expect(texto, "se coló el reporte de un vendedor").not.toContain("CIERRE");
    expect(texto).not.toContain("11-000003022");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · NINGÚN NÚMERO SE MUEVE
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 5. el papel dice lo MISMO que la pantalla: mismas filas, mismo pie", () => {
  it("los números de la pantalla llegan intactos al PDF", async () => {
    const texto = await textoDelPdf(construirPdfTablaComisiones(PAPEL_GRUPO));
    for (const n of ["$41.77", "$70.69", "$112.46", "1,513.08", "1,400.62"]) {
      expect(texto, n).toContain(n);
    }
    expect(texto).toContain("Total a pagar");
  });

  it("🔴 el generador NO suma: ni una operación aritmética", () => {
    const gen = plano(leer(GENERADOR));
    const puro = plano(leer("src/lib/comisiones/tabla-papel.ts"));
    for (const archivo of [gen, puro]) {
      expect(archivo).not.toContain("reduce(");
      expect(archivo).not.toContain("fmtMoney");
      expect(archivo).not.toContain("sumarPagable");
    }
  });

  it("🔴 y el pie de los dos papeles sale de `sumarPagable`, como el de la pantalla", () => {
    // La matriz: el pie del papel usa las mismas funciones de columna.
    const matriz = plano(leer(MATRIZ));
    expect(matriz).toContain("sumarPagable");
    expect(matriz).toContain("const colTotal = (key: string) => sumarPagable(");
    expect(matriz).toContain("const grandTotal = sumarPagable(");
    expect(matriz).toMatch(/totales: \[[\s\S]{0,200}colTotal\(k\)/);
    expect(matriz).toMatch(/totales: \[[\s\S]{0,240}grandTotal/);
    // Una empresa: sus cinco totales salen de la misma función.
    const empresa = plano(leer(EMPRESA));
    expect((empresa.match(/sumarPagable\(vendedores/g) ?? []).length).toBe(5);
    expect(empresa).toMatch(/totales: \[[\s\S]{0,300}totalGeneral/);
    // Y el rótulo del pie es el MISMO que el de la tabla en pantalla.
    for (const vista of [matriz, empresa]) {
      expect(vista).toContain('haySinPago ? "Total a pagar" : "Total"');
    }
    // La función suma solo lo pagable — la regla original, intacta.
    expect(sumarPagable(
      [{ se_paga: true, m: 10 }, { se_paga: false, m: 99 }, { m: 5 }],
      (f) => f.m,
    )).toBe(15);
  });

  it("🔴 las filas del papel son las MISMAS de la pantalla", () => {
    const matriz = plano(leer(MATRIZ));
    // `conActividad` + la oficina: lo que se dibuja y lo que baja al Excel.
    expect(matriz).toContain("const todas = [...conActividad, ...(sinAsignar ? [sinAsignar] : [])];");
    expect(matriz).toContain("filas: filasImpresas()");
    expect(plano(leer(EMPRESA))).toContain("conActividad.map((v) => ({");
    expect(plano(leer(EMPRESA))).toContain("filas: filasImpresas()");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 · LOS QUE NO SE PAGAN SIGUEN EN EL ARCHIVO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 6. Oficina y Daniel Levy: escondidos en pantalla, presentes en el papel", () => {
  it("salen con su marca «no se paga»", async () => {
    const texto = await textoDelPdf(construirPdfTablaComisiones(PAPEL_GRUPO));
    expect(texto).toContain("Oficina (DEFAULT)");
    expect(texto).toContain(ROTULO_NO_SE_PAGA);
  });

  it("y las dos vistas marcan esa fila en el papel", () => {
    for (const vista of [MATRIZ, EMPRESA]) {
      const v = plano(leer(vista));
      expect(v, vista).toContain("apagada: ");
      expect(v, vista).toMatch(/ROTULO_NO_SE_PAGA|MARCA_NO_SE_PAGA/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7 · EL EXCEL NO SE TOCÓ
// ═════════════════════════════════════════════════════════════════════════════

describe("⚠️ 7. el Excel de los dos botones es exactamente el de hoy", () => {
  it("las dos vistas siguen llamando a su exportador de siempre", () => {
    expect(plano(leer(MATRIZ))).toContain("exportComisionesConsolidado({");
    expect(plano(leer(EMPRESA))).toContain("exportComisionesResumen({");
  });

  it("y con el mismo nombre de archivo de siempre", () => {
    const excel = plano(leer("src/lib/ventas/comisionExcel.ts"));
    expect(excel).toContain("comisiones-consolidado-${sufijoArchivoPeriodo(c.year, c.mes)}");
    expect(excel).toContain("comisiones-${r.empresaKey}-${sufijoArchivoPeriodo(r.year, r.mes)}");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8 · LA FORMA DEL PAPEL SE DERIVA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 8. parado o acostado se DERIVA de las columnas, no se escribe a mano", () => {
  it("la matriz del grupo (8 columnas) se acuesta; la de una empresa (6) va parada", () => {
    expect(orientacionPapel(8)).toBe("landscape");
    expect(orientacionPapel(6)).toBe("portrait");
    expect(orientacionPapel(MAX_COLUMNAS_PARADO)).toBe("portrait");
    expect(orientacionPapel(MAX_COLUMNAS_PARADO + 1)).toBe("landscape");
    expect(plano(leer(GENERADOR))).toContain("orientacionPapel(tabla.columnas.length)");
  });

  it("el título del papel sale del módulo puro, no de un texto suelto en la vista", () => {
    expect(TITULO_PAPEL_GRUPO).toBe("Comisiones — Fashion Group");
    expect(tituloPapelEmpresa("Vistana")).toBe("Comisiones — Vistana");
    expect(plano(leer(MATRIZ))).toContain("titulo: TITULO_PAPEL_GRUPO");
    expect(plano(leer(EMPRESA))).toContain("titulo: tituloPapelEmpresa(nombreEmpresa)");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9 · 🩸 EL MENOS DE LA PLATA NEGATIVA SE LEE
// ═════════════════════════════════════════════════════════════════════════════

describe("🩸 9. un número negativo se lee en el papel, no sale mangado", () => {
  it("el «−» de la casa no existe en la fuente del PDF: se cambia AL DIBUJAR", () => {
    // La regla, en una línea: entra el signo de la casa, sale un guion.
    expect(textoDePdf("−$1,513.08")).toBe(`${MENOS_EN_PDF}$1,513.08`);
    expect(textoDePdf("$41.77")).toBe("$41.77");
    // 🔴 Y NO SE TOCA EL DATO: `fmtMoney` sigue dando el «−» de siempre para la
    // pantalla y el Excel.
    expect(fmtMoney(-1513.08)).toBe("−$1,513.08");
  });

  it("🩸 en el papel del período: los dígitos salen juntos y sin comilla", async () => {
    const texto = await textoDelPdf(construirPdfTablaComisiones(PAPEL_GRUPO));
    // Medido antes del arreglo: `−$1,513.08` salía como `" $ 1 , 5 1 3 . 0 8`.
    expect(texto, "el renglón salió mangado").not.toContain("1 , 5 1 3");
    expect(texto).not.toContain("\u2212");
    expect(texto).toContain("-$1,513.08");
  });

  it("🩸 y en el reporte de un vendedor, que tenía el MISMO defecto", async () => {
    // El defecto salió a la luz el 9-sep-2026 midiendo el PDF de verdad: una
    // nota de crédito imprimía `" $ 2 5 0 . 0 0` y arrastraba la línea entera
    // (`V e n t a s " $ 2 5 0 . 0 0 × 0 . 5 0 %`).
    const data = {
      empresa_key: "vistana", year: 2026, mes: 8, vendedor: "EDWIN",
      tasa_venta: 0.005, tasa_cobro: 0.005,
      ventas: [{
        fecha: "2026-08-11", cliente: "City Mall", secuencial: "11-000003044",
        tipo: "Nota de Crédito", subtotal: -250, pct_utilidad: null,
      }],
      cobros: [], ventas_base: -250, cobros_base: 0,
      comision_venta: -1.25, comision_cobro: 0, comision_total: -1.25,
    } as unknown as ComisionDetalle;
    const texto = await textoDelPdf(construirPdfComision([{
      data, descuentos: [], empresaNombre: "Vistana", vendedor: "EDWIN", year: 2026, mes: 8,
    }]));
    expect(texto, "el renglón salió mangado").not.toContain("2 5 0 . 0 0");
    expect(texto).toContain("-$250.00");
    // Y la línea del cierre se lee entera, con su «×» y su porcentaje.
    expect(texto).toContain("× 0.50%");
  });
});
