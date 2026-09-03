/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LA PLANTILLA DE SWITCH ES UNA SOLA, Y ES LA REAL
 *
 * El Depurador (`/productos/cargar`) genera el Excel que se sube a Switch en
 * Stock › Artículos › Importar/Editar. Switch entrega su plantilla en
 * «Descargar plantilla modelo» (`/plantillas/productosplantillaimportarpafob.xlsx`).
 * El 3-sep-2026 se bajó de las 8 empresas y las 8 dieron el MISMO MD5
 * (b622f171713642a0393b3c95c7f30de7, 10.305 bytes): es un archivo fijo de
 * Switch, no depende de la empresa. Esa copia vive en
 * `src/__tests__/fixtures/plantilla-switch-articulos.xlsx`, y este test LEE
 * SUS ENCABEZADOS y exige igualdad exacta con los tres generadores del
 * sistema: Depurador CK/TH/KL, Facturas Tienda (Multifashion) y Reebok.
 *
 * 🩸 Por qué existe: durante dos meses el sistema tuvo DOS listas de 24
 * columnas y NINGUNA coincidía con la plantilla. El 27-jun-2026 se quitó
 * «Composición» «a propósito» (24 columnas, las 4 últimas corridas) y el
 * mismo día Fashion Shoes recibió una lista con UNA sola «Costo *» en vez de
 * «Costo FOB *» + «Costo CIF *» (24 columnas, 18 corridas, sin una
 * obligatoria); el 1-sep-2026 esa columna cambió de contenido (CIF → FOB).
 * Los tres cambios se hicieron contra plantillas que no estaban en el repo.
 * Esta vez el fixture queda: si Switch cambia la plantilla, se cambia el
 * fixture a propósito y este test dice qué columna se movió.
 *
 * Lo que cambia por empresa es el CONTENIDO, nunca las columnas:
 *   · Vistana / Fashion Wear / Active Wear / Fashion Shoes → FOB del archivo,
 *     CIF = FOB × factor (1,10). Daniel, 3-sep: Fashion Shoes «sí».
 *   · Multifashion (Facturas Tienda) → FOB = CIF = el precio de la factura.
 *     Daniel, 3-sep: «mismo número».
 *   · Composición SIEMPRE vacía. Daniel: «vuelve vacía, no la quiero».
 *   · Tasa de Impuesto en el CÓDIGO de Switch, «07» como texto (guía
 *     `Flujo_articulo_orden_de_compra_switchsoft2026.pdf`, p. 3). Daniel: «pon
 *     el 0 adelante pues».
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx-js-style";
import {
  OUT_COLS, TEXT_COLS, buildAoa, processRows, tasaSwitch,
  type SheetRow,
} from "../lib/depurador/logic";
import { processFactura, buildTiendaAoa } from "../lib/depurador/tienda";
import { parseReebok, buildSwitchRows, buildSwitchAoa, REEBOK_FORMULA_A_DEFAULT } from "../lib/depurador/reebok";

const FIXTURE = path.join(process.cwd(), "src/__tests__/fixtures/plantilla-switch-articulos.xlsx");

/** Encabezados de la fila 1 de la plantilla real, tal cual (acentos, asteriscos, espacios). */
function encabezadosDeLaPlantillaReal(): string[] {
  const wb = XLSX.read(fs.readFileSync(FIXTURE), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: true });
  return (aoa[0] ?? []).map((h) => String(h));
}

/* ── Los tres generadores, con una fila real cada uno ─────────────────────── */

const H = ["REFERENCIA", "EAN", "P_CATEGORY", "TALLA", "CANTIDAD", "COSTO", "PRECIO2", "MARCA", "PROVEEDOR"];
const cfg = { factor: 1.1, tasa: "7", mesIdx: 5, anio: "2026" };
const filaShoes = (): SheetRow[] => [H, ["R1", "7000000000001", "Men-Sneakers", "41", 10, 10, 20, "TH Footwear", "x"]];
const filaVistana = (): SheetRow[] => [H, ["R2", "7000000000002", "Men-Polos S/S", "M", 5, 10, 20, "CK Menswear", "x"]];

/** Depurador CK/TH/KL: el mismo Excel para las 4 empresas destino. */
const aoaDepurador = (rows: SheetRow[]) => buildAoa(processRows(rows, cfg).rows);

/** Facturas Tienda (Multifashion): factura formato A (.xls) con PRECIO = lo que cobra la empresa. */
const aoaTienda = () => {
  const HA = ["CODIGO", "CODIGO BARRA", "REFERENCIA", "DESCRIPCION", "MARCA", "RUBRO", "SUB RUBRO",
    "UNIDAD DE MEDIDA", "PROVEEDOR", "CANTIDAD", "PRECIO"];
  const rows: SheetRow[] = [
    ["N. Interno: 11-000001"],
    [],
    HA,
    ["C1", "7000000000003", "R3", "Men-Polos S/S", "TH Menswear", "Men", "Polos S/S", "PIEZA", "American Fashion Wear, SA", 4, 12.5],
  ];
  const r = processFactura(rows, { temporadaFallback: "2026-09", catalogo: { "TH Menswear": ["Men-Polos S/S"] } });
  return buildTiendaAoa(r.rows);
};

/** Reebok (Active Shoes): archivo Book4, headers reales en la 2.ª fila (la 1.ª es basura). */
const aoaReebok = () => {
  const hdr = ["Order", "ClientName", "PO NAME", "New Article", "Old Article ", "SKU", "PREPACK FTW", "Name", "Department",
    "CAMPAÑAS", "PRIORIDAD", "OptionName", "CurveName", "CATEGORY", "AGE GROUP", "COLOR NAME", "GENDER", "SELL-IN QUARTER",
    "SPORTS CATEGORY", "Talla", "RRP", "WholesalePrice", "PREVENTA", "DROP", "FW26 FINAL", "JULIO", "COMENTARIOS", "DELIVERY", "UBICACIÓN"];
  const fila: SheetRow = new Array(29).fill(null);
  fila[2] = "VIC"; fila[3] = "100000015"; fila[5] = "100000015-9"; fila[7] = "CLUB C 85"; fila[8] = "FOOTWEAR";
  fila[13] = "SHOES"; fila[14] = "Adult"; fila[16] = "Female"; fila[19] = 9; fila[20] = 84.95; fila[21] = 42.9; fila[25] = 7;
  const rows: SheetRow[] = [[], hdr, fila];
  const { items } = parseReebok(rows, hdr.indexOf("JULIO"));
  const sw = buildSwitchRows(items, { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-07", tasa: "7" });
  return buildSwitchAoa(sw);
};

const col = (aoa: (string | number)[][], nombre: string) => aoa[1][(aoa[0] as string[]).indexOf(nombre)];

describe("🔴 Plantilla de Switch — OUT_COLS es IGUAL al fixture real, columna por columna", () => {
  it("el fixture es el archivo de Switch (una hoja «upload», 25 encabezados en la fila 1)", () => {
    const wb = XLSX.read(fs.readFileSync(FIXTURE), { type: "buffer" });
    expect(wb.SheetNames).toEqual(["upload"]);
    expect(encabezadosDeLaPlantillaReal()).toHaveLength(25);
  });

  it("OUT_COLS = los encabezados de la plantilla real, en el mismo orden y con el mismo texto", () => {
    const real = encabezadosDeLaPlantillaReal();
    // Comparación posición por posición: si falla, el mensaje dice CUÁL columna se movió.
    real.forEach((h, i) => {
      expect({ pos: i + 1, plantilla: h, sistema: OUT_COLS[i] ?? "(falta)" })
        .toEqual({ pos: i + 1, plantilla: h, sistema: h });
    });
    expect(OUT_COLS).toEqual(real);
  });

  it("las 13 obligatorias (con *) están, y Costo FOB y Costo CIF son dos de ellas", () => {
    const obligatorias = OUT_COLS.filter((c) => c.endsWith("*"));
    expect(obligatorias).toHaveLength(13);
    expect(obligatorias).toContain("Costo FOB *");
    expect(obligatorias).toContain("Costo CIF *");
    expect(OUT_COLS).not.toContain("Costo *");
  });

  it("«Composición» es la columna 21 (índice 20) — volvió, y vacía", () => {
    expect(OUT_COLS[20]).toBe("Composición");
    expect(OUT_COLS.indexOf("Codigo CPBS")).toBe(21);
    expect(OUT_COLS.indexOf("Cantidad por caja")).toBe(24);
  });

  it("TEXT_COLS es posicional y sigue apuntando a Código / Referencia / Código Barra", () => {
    // Las tres primeras de la plantilla no se mueven aunque Composición (la 21) haya vuelto.
    expect(TEXT_COLS).toEqual([0, 1, 2]);
    expect(TEXT_COLS.map((i) => OUT_COLS[i])).toEqual(["Código *", "Referencia *", "Código Barra *"]);
  });
});

describe("🔴 Los TRES generadores escriben exactamente esa fila de encabezados", () => {
  it("Depurador (Vistana / Fashion Wear / Active Wear / Fashion Shoes)", () => {
    expect(aoaDepurador(filaShoes())[0]).toEqual(encabezadosDeLaPlantillaReal());
    expect(aoaDepurador(filaVistana())[0]).toEqual(encabezadosDeLaPlantillaReal());
  });
  it("Facturas Tienda (Multifashion)", () => {
    expect(aoaTienda()[0]).toEqual(encabezadosDeLaPlantillaReal());
  });
  it("Reebok (Active Shoes)", () => {
    expect(aoaReebok()[0]).toEqual(encabezadosDeLaPlantillaReal());
  });
  it("y cada fila de datos tiene 25 celdas (ninguna columna corrida)", () => {
    for (const aoa of [aoaDepurador(filaShoes()), aoaTienda(), aoaReebok()]) {
      expect(aoa[1]).toHaveLength(25);
    }
  });
});

describe("Lo que cambia por empresa es el CONTENIDO, no las columnas", () => {
  it("Fashion Shoes: FOB del archivo (10) y CIF = FOB × 1,10 (11) — como Vistana", () => {
    const aoa = aoaDepurador(filaShoes());
    expect(col(aoa, "Costo FOB *")).toBe(10);
    expect(col(aoa, "Costo CIF *")).toBe(11);
  });
  it("⛔ en Fashion Shoes el CIF NO es el FOB: hay flete adentro", () => {
    const aoa = aoaDepurador(filaShoes());
    expect(col(aoa, "Costo CIF *")).not.toBe(col(aoa, "Costo FOB *"));
  });
  it("Vistana: igual, FOB 10 y CIF 11", () => {
    const aoa = aoaDepurador(filaVistana());
    expect(col(aoa, "Costo FOB *")).toBe(10);
    expect(col(aoa, "Costo CIF *")).toBe(11);
  });
  it("Multifashion (Facturas Tienda): FOB = CIF = el precio de la factura (12,5)", () => {
    const aoa = aoaTienda();
    expect(col(aoa, "Costo FOB *")).toBe(12.5);
    expect(col(aoa, "Costo CIF *")).toBe(12.5);
  });
  it("Reebok: FOB y CIF separados como siempre (CIF = FOB × 1,1)", () => {
    const aoa = aoaReebok();
    const fob = Number(col(aoa, "Costo FOB *"));
    const cif = Number(col(aoa, "Costo CIF *"));
    expect(fob).toBeGreaterThan(0);
    expect(cif).toBe(Math.round(fob * 1.1 * 100) / 100);
  });
  it("Composición va VACÍA en los tres", () => {
    expect(col(aoaDepurador(filaShoes()), "Composición")).toBe("");
    expect(col(aoaTienda(), "Composición")).toBe("");
    expect(col(aoaReebok(), "Composición")).toBe("");
  });
});

describe("Tasa de Impuesto: «07» como TEXTO, en los tres generadores", () => {
  it("tasaSwitch pone el cero adelante y devuelve texto", () => {
    expect(tasaSwitch("7")).toBe("07");
    expect(tasaSwitch(7)).toBe("07");
    expect(tasaSwitch("7.00")).toBe("07");
    expect(tasaSwitch("07")).toBe("07");
    expect(tasaSwitch(0)).toBe("0");     // exento, como dice la guía
    expect(tasaSwitch("10")).toBe("10"); // no se inventa un tercer dígito
    expect(tasaSwitch("")).toBe("");
    expect(tasaSwitch("abc")).toBe("abc"); // lo que no es número se deja tal cual
  });
  it("Depurador: la persona escribe «7» y el Excel dice exactamente \"07\"", () => {
    const v = col(aoaDepurador(filaShoes()), "Tasa de Impuesto *");
    expect(v).toBe("07");
    expect(typeof v).toBe("string");
  });
  it("Facturas Tienda: la factura trae 7 (o nada) y el Excel dice exactamente \"07\"", () => {
    const v = col(aoaTienda(), "Tasa de Impuesto *");
    expect(v).toBe("07");
    expect(typeof v).toBe("string");
  });
  it("Reebok: exactamente \"07\"", () => {
    const v = col(aoaReebok(), "Tasa de Impuesto *");
    expect(v).toBe("07");
    expect(typeof v).toBe("string");
  });
  it("⛔ nunca el número 7 ni el texto \"7\": ahí el cero se pierde", () => {
    for (const aoa of [aoaDepurador(filaShoes()), aoaTienda(), aoaReebok()]) {
      expect(col(aoa, "Tasa de Impuesto *")).not.toBe(7);
      expect(col(aoa, "Tasa de Impuesto *")).not.toBe("7");
    }
  });
  it("y al escribir el Excel de verdad, la celda sigue siendo texto «07»", () => {
    const aoa = aoaDepurador(filaShoes());
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "upload");
    const rb = XLSX.read(XLSX.write(wb, { bookType: "xlsx", type: "buffer" }), { type: "buffer" });
    const celda = rb.Sheets.upload[XLSX.utils.encode_cell({ r: 1, c: OUT_COLS.indexOf("Tasa de Impuesto *") })];
    expect(celda.t).toBe("s");
    expect(celda.v).toBe("07");
  });
});

describe("Ya no existe «plantilla por empresa»", () => {
  it("logic.ts no exporta OUT_COLS_DEFAULT, OUT_COLS_SHOES ni outColsForEmpresa", async () => {
    const mod = await import("../lib/depurador/logic");
    expect((mod as Record<string, unknown>).OUT_COLS_DEFAULT).toBeUndefined();
    expect((mod as Record<string, unknown>).OUT_COLS_SHOES).toBeUndefined();
    expect((mod as Record<string, unknown>).outColsForEmpresa).toBeUndefined();
  });
  it("ninguna pantalla ni módulo del Depurador escribe una columna «Costo *»", () => {
    const raiz = path.join(process.cwd(), "src");
    const archivos = [
      "lib/depurador/logic.ts", "lib/depurador/tienda.ts", "lib/depurador/reebok.ts",
      "app/productos/cargar/DepuradorClient.tsx", "app/productos/cargar/FacturasTiendaClient.tsx",
      "app/productos/cargar/ReebokClient.tsx",
    ];
    for (const a of archivos) {
      const src = fs.readFileSync(path.join(raiz, a), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect({ archivo: a, tieneCostoUnico: /"Costo \*"/.test(src) }).toEqual({ archivo: a, tieneCostoUnico: false });
    }
  });
});
