/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL TÍTULO DEL PDF DE COMISIONES VA SOLO EN LA PRIMERA HOJA
 *
 * Daniel, 7-sep-2026, textual: *«no quiero ver en cada pagina lo mismo… solo en
 * la primera»*.
 *
 * 🩸 QUÉ SE REPETÍA. `cabecera()` dibujaba el logo y el renglón «Comisión —
 * Vendedor · Empresa · agosto 2026» en TODAS las hojas: lo llamaba el
 * `didDrawPage` de las dos tablas y otra vez `asegurarEspacio` cada vez que
 * abría hoja. En un reporte de cuatro hojas eran cuatro logos y cuatro veces el
 * mismo renglón, ocupando 32 mm de cada página para decir lo que ya se leyó.
 *
 * ⚠️ EL PEDIDO SE LEYÓ COMPLETO, NO AL PIE DE LA LETRA:
 *
 *   · **Los NOMBRES DE COLUMNA sí se repiten en cada hoja.** Sin ellos, la
 *     tabla de la hoja 3 son números sueltos. Los repite `autoTable` solo, y es
 *     lo contrario de lo que pidió — y es lo correcto. El mockup lo muestra así
 *     y él lo aprobó.
 *   · **El pie con la numeración NO se toca**: «Página 2 de 4» y «Confidencial ·
 *     fashiongr.com» siguen en todas. Es lo que dice de qué documento es la
 *     hoja suelta que quedó en la impresora.
 *
 * 🔑 EL ARCHIVO QUE EL ENCARGO NOMBRABA ESTÁ MUERTO. `ImpresionComision.tsx` —
 * la hoja HTML que se mandaba a `window.print()` y cuyo comentario decía
 * «repetidos en cada hoja»— se retiró el 9-sep-2026 y NO LO MONTA NADIE (solo
 * lo nombran tests y comentarios). Lo que Daniel ve hoy es el PDF de
 * `lib/comisiones/pdf-comision.ts`, y ahí el defecto seguía vivo. Se arregló
 * donde se ve, no donde estaba escrito.
 *
 * 🔴 UN SOLO JUEGO DE CARROCERÍA PARA LOS DOS PAPELES (`pdf-chrome.ts`): el
 * reporte de un vendedor y la matriz del mes. Los dos dejan de repetir el
 * título, porque dos copias de la misma regla es cómo se llega a que uno lo
 * repita y el otro no.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { construirPdfComision } from "@/lib/comisiones/pdf-comision";
import { construirPdfTablaComisiones } from "@/lib/comisiones/pdf-tabla-comisiones";
import {
  COLUMNAS_COBROS,
  COLUMNAS_VENTAS,
  encabezadoReporte,
  type HojaReporte,
} from "@/lib/comisiones/reporte-comision";
import type { ComisionDetalle } from "@/lib/ventas/comisionExcel";
import type { TablaPapel } from "@/lib/comisiones/tabla-papel";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const plano = (rel: string) =>
  leer(rel).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

/** El texto de CADA hoja, por separado: sin esto no se puede saber en cuál sale. */
async function hojasDelPdf(doc: { output: (t: "arraybuffer") => ArrayBuffer }): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(doc.output("arraybuffer")),
    useSystemFonts: true,
  }).promise;
  const hojas: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const texto = ((await page.getTextContent()).items as any[]).map((it) => it.str).join(" ");
    hojas.push(texto.replace(/\s+/g, " "));
  }
  return hojas;
}

/** Un reporte LARGO a propósito: tiene que pasar de una hoja o no se mide nada.
 *  Las bases van completas para que el CIERRE traiga números y no `NaN`. */
function detalleLargo(vendedor: string, filas: number): ComisionDetalle {
  const ventas = Array.from({ length: filas }, (_, i) => ({
    fecha: "2026-08-03",
    cliente: `Cliente ${i + 1}`,
    secuencial: `11-0000030${String(i).padStart(2, "0")}`,
    tipo: "Factura",
    subtotal: 1000 + i,
    pct_utilidad: 30,
  }));
  const cobros = Array.from({ length: filas }, (_, i) => ({
    fecha: "2026-08-15",
    cliente: `Cliente ${i + 1}`,
    monto: 500 + i,
  }));
  const ventasBase = ventas.reduce((a, v) => a + v.subtotal, 0);
  const cobrosBase = cobros.reduce((a, c) => a + c.monto, 0);
  return {
    empresa_key: "vistana",
    year: 2026,
    mes: 8,
    vendedor,
    tasa_venta: 0.005,
    tasa_cobro: 0.005,
    ventas,
    cobros,
    ventas_base: ventasBase,
    cobros_base: cobrosBase,
    comision_venta: ventasBase * 0.005,
    comision_cobro: cobrosBase * 0.005,
    comision_total: (ventasBase + cobrosBase) * 0.005,
  } as unknown as ComisionDetalle;
}

function hoja(data: ComisionDetalle, empresaNombre: string): HojaReporte {
  return { data, empresaNombre, vendedor: data.vendedor, year: data.year, mes: data.mes, descuentos: [] } as HojaReporte;
}

const LARGO = hoja(detalleLargo("EDWIN", 90), "Vistana");
const TITULO = encabezadoReporte(LARGO);

// ─────────────────────────────────────────────────────────────────────────────
// 1 · El reporte de un vendedor
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 el reporte de un vendedor: el título, una sola vez", () => {
  it("el ejemplo mide de verdad: pasa de una hoja", async () => {
    const hojas = await hojasDelPdf(construirPdfComision([LARGO]));
    expect(hojas.length, "el ejemplo cabe en una hoja y no mide nada").toBeGreaterThan(1);
  });

  it("🔴 «Comisión — Vendedor · Empresa · mes» sale SOLO en la primera hoja", async () => {
    const hojas = await hojasDelPdf(construirPdfComision([LARGO]));
    // El título se parte en varios trozos de texto; se busca el vendedor y el
    // mes juntos, que es lo que Daniel ve repetido.
    const tieneTitulo = (t: string) => t.includes("Edwin") && t.includes("Agosto");
    expect(tieneTitulo(hojas[0]), "la primera hoja perdió su título").toBe(true);
    for (let i = 1; i < hojas.length; i++) {
      expect(tieneTitulo(hojas[i]), `la hoja ${i + 1} repite el título`).toBe(false);
    }
    expect(TITULO).toContain("Edwin");
  });

  it("🔴 los NOMBRES DE COLUMNA sí se repiten: sin ellos son números sueltos", async () => {
    const hojas = await hojasDelPdf(construirPdfComision([LARGO]));
    // Cada hoja CON TABLA lleva sus encabezados (Ventas o Cobros).
    // ⚠️ La última puede ser solo la caja CIERRE, que no es una tabla: ahí no
    // hay columnas que nombrar, y por eso se la reconoce en vez de exigirle
    // encabezados que no le corresponden.
    let conColumnas = 0;
    for (let i = 0; i < hojas.length; i++) {
      const deVentas = COLUMNAS_VENTAS.every((c) => hojas[i].includes(c));
      const deCobros = COLUMNAS_COBROS.every((c) => hojas[i].includes(c));
      const soloCierre = hojas[i].includes("CIERRE") && !hojas[i].includes("Cliente");
      expect(deVentas || deCobros || soloCierre, `la hoja ${i + 1} quedó sin nombres de columna`).toBe(true);
      if (deVentas || deCobros) conColumnas++;
    }
    // Y se repiten de verdad: no es que solo la primera los tenga.
    expect(conColumnas).toBeGreaterThan(1);
  });

  it("⚠️ el pie con la numeración NO se tocó: sale en todas", async () => {
    const hojas = await hojasDelPdf(construirPdfComision([LARGO]));
    hojas.forEach((t, i) => {
      expect(t, `la hoja ${i + 1} perdió su numeración`).toContain(`Página ${i + 1} de ${hojas.length}`);
      expect(t).toContain("Confidencial");
      expect(t).toContain("fashiongr.com");
    });
  });

  it("🔴 con DOS reportes, cada uno estrena su título en SU primera hoja", async () => {
    const doc = construirPdfComision([LARGO, hoja(detalleLargo("REYNALDO", 90), "Fashion Shoes")]);
    const hojas = await hojasDelPdf(doc);
    const conEdwin = hojas.filter((t) => t.includes("Edwin") && t.includes("Agosto")).length;
    const conRey = hojas.filter((t) => t.includes("Reynaldo") && t.includes("Agosto")).length;
    expect(conEdwin, "el título de Edwin se repite").toBe(1);
    expect(conRey, "el título de Reynaldo se repite").toBe(1);
    // Y cada uno abre hoja propia: nunca se pegan a media página.
    expect(hojas.length).toBeGreaterThan(3);
  });

  it("un reporte de UNA sola hoja sigue trayendo su título", async () => {
    const corto = hoja(detalleLargo("EDWIN", 2), "Vistana");
    const hojas = await hojasDelPdf(construirPdfComision([corto]));
    expect(hojas.length).toBe(1);
    expect(hojas[0]).toContain("Edwin");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · La matriz del mes — el otro papel de la misma carrocería
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 la matriz de comisiones: la misma regla", () => {
  const TABLA: TablaPapel = {
    titulo: "Comisiones",
    subtitulo: "agosto 2026 · Vistana",
    columnas: [
      { header: "Vendedor", numerica: false },
      { header: "Venta", numerica: true },
      { header: "Comisión", numerica: true },
    ],
    filas: Array.from({ length: 80 }, (_, i) => ({
      celdas: [`Vendedor ${i + 1}`, "$1,000.00", "$5.00"],
    })),
    totales: ["Total", "$80,000.00", "$400.00"],
  } as unknown as TablaPapel;

  it("el título sale una vez y los nombres de columna en todas", async () => {
    const hojas = await hojasDelPdf(construirPdfTablaComisiones(TABLA));
    expect(hojas.length, "el ejemplo cabe en una hoja y no mide nada").toBeGreaterThan(1);
    const conTitulo = hojas.filter((t) => t.includes("agosto 2026")).length;
    expect(conTitulo, "la matriz repite su título").toBe(1);
    hojas.forEach((t, i) => {
      expect(t, `la hoja ${i + 1} quedó sin nombres de columna`).toContain("Vendedor");
      expect(t, `la hoja ${i + 1} perdió su numeración`).toContain(`Página ${i + 1} de`);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · El código: la regla vive en la carrocería, no copiada en dos archivos
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 la regla vive en UN solo lugar", () => {
  it("`asegurarEspacio` abre hoja y NO vuelve a dibujar la cabeza", () => {
    const chrome = plano("src/lib/comisiones/pdf-chrome.ts");
    expect(chrome).toContain("export const ALTO_CONTINUACION");
    const i = chrome.indexOf("export function asegurarEspacio");
    expect(i).toBeGreaterThan(-1);
    const cuerpo = chrome.slice(i, chrome.indexOf("\n}", i));
    expect(cuerpo, "`asegurarEspacio` volvió a repetir la cabeza").not.toContain("cabecera(");
    expect(cuerpo).toContain("ALTO_CONTINUACION");
  });

  it("ningún papel vuelve a pedir la cabeza en cada hoja", () => {
    for (const rel of ["src/lib/comisiones/pdf-comision.ts", "src/lib/comisiones/pdf-tabla-comisiones.ts"]) {
      const src = plano(rel);
      expect(src, `${rel} volvió a repetir la cabeza en cada hoja`).not.toContain(
        "didDrawPage: () => cabecera(",
      );
      // La cabeza se dibuja UNA vez por reporte, antes de la tabla.
      expect(src.match(/cabecera\(doc, titulo\)/g)?.length ?? 0, `${rel} dibuja la cabeza de más`).toBe(1);
      // Y las hojas de continuación arrancan arriba, sin franja en blanco.
      expect(src).toContain("top: ALTO_CONTINUACION");
    }
  });

  it("⚠️ CONTROL: el pie con la numeración sigue recorriendo TODAS las hojas", () => {
    const chrome = plano("src/lib/comisiones/pdf-chrome.ts");
    const i = chrome.indexOf("export function piePorHoja");
    const cuerpo = chrome.slice(i, chrome.indexOf("\n}", i));
    expect(cuerpo).toContain("doc.getNumberOfPages()");
    expect(cuerpo).toContain("doc.setPage(i)");
    expect(cuerpo).toContain("Página ${i} de ${hojas}");
    for (const rel of ["src/lib/comisiones/pdf-comision.ts", "src/lib/comisiones/pdf-tabla-comisiones.ts"]) {
      expect(plano(rel), `${rel} dejó de numerar`).toContain("piePorHoja(doc)");
    }
  });

  it("⚠️ CONTROL: el logo y el «−» del papel no se tocaron", () => {
    const chrome = plano("src/lib/comisiones/pdf-chrome.ts");
    expect(chrome).toContain("FG_LOGO_BASE64");
    expect(chrome).toContain('export const MENOS_EN_PDF = "-"');
  });
});
