/**
 * Verificación: genera un Excel REAL con cada generador del Depurador (las 4
 * empresas destino CK/TH/KL, Facturas Tienda = Multifashion, Reebok = Active
 * Shoes), lo escribe a disco como lo hace la pantalla (aoa_to_sheet + columnas
 * de texto + hoja «upload»), lo vuelve a leer y compara ENCABEZADO POR
 * ENCABEZADO contra la plantilla real de Switch
 * (src/__tests__/fixtures/plantilla-switch-articulos.xlsx).
 *
 * Solo lectura sobre el sistema; escribe en OUT (default /tmp/plantillas/salida).
 *
 *   npx tsx scripts/_verif-plantilla-switch.ts
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx-js-style";
import { OUT_COLS, TEXT_COLS, buildAoa, processRows, proveedorParaEmpresa, EMPRESAS_DESTINO, type SheetRow } from "../src/lib/depurador/logic";
import { processFactura, buildTiendaAoa } from "../src/lib/depurador/tienda";
import { parseReebok, buildSwitchRows, buildSwitchAoa, REEBOK_FORMULA_A_DEFAULT } from "../src/lib/depurador/reebok";

const OUT = process.env.OUT ?? "/tmp/plantillas/salida";
const FIXTURE = path.join(process.cwd(), "src/__tests__/fixtures/plantilla-switch-articulos.xlsx");
fs.mkdirSync(OUT, { recursive: true });

const leerHeader = (file: string): string[] => {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: true });
  return (aoa[0] ?? []).map(String);
};
const leerFila = (file: string, r = 1): (string | number)[] => {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: true });
  return aoa[r] ?? [];
};

/** Escribe el Excel exactamente como las pantallas (DepuradorClient / FacturasTiendaClient / ReebokClient). */
function escribir(aoa: (string | number)[][], nombre: string): string {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let R = 1; R <= range.e.r; R++) {
    for (const C of TEXT_COLS) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[addr]) { ws[addr].t = "s"; ws[addr].v = String(ws[addr].v); ws[addr].z = "@"; }
    }
  }
  ws["!cols"] = aoa[0].map((_c, i) => ({ wch: i === 3 ? 26 : i < 3 ? 16 : 13 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "upload");
  const file = path.join(OUT, nombre);
  XLSX.writeFile(wb, file);
  return file;
}

const real = leerHeader(FIXTURE);
console.log(`Plantilla real: ${real.length} columnas (${path.basename(FIXTURE)})\n`);

const H = ["REFERENCIA", "EAN", "FACTURA", "P_CATEGORY", "TALLA", "CANTIDAD", "COSTO", "PRECIO2", "MARCA", "PROVEEDOR"];
const cfg = { factor: 1.1, tasa: "7", mesIdx: 8, anio: "2026" };
const marcaDe: Record<string, [string, string]> = {
  vistana: ["CK Menswear", "Men-Polos S/S"],
  fashion_wear: ["TH Menswear", "Men-T-Shirts S/S"],
  fashion_shoes: ["TH Footwear", "Men-Sneakers"],
  active_wear: ["KL Womenswear", "Women-T-Shirts S/S"],
};

interface Res { generador: string; archivo: string; cols: number; iguales: number; distintas: string[]; fob: unknown; cif: unknown; tasa: unknown; comp: unknown }
const resultados: Res[] = [];

function comparar(generador: string, file: string): Res {
  const h = leerHeader(file);
  const fila = leerFila(file);
  const distintas: string[] = [];
  const n = Math.max(h.length, real.length);
  let iguales = 0;
  for (let i = 0; i < n; i++) {
    if (h[i] === real[i]) iguales++;
    else distintas.push(`${i + 1}: «${h[i] ?? "(falta)"}» ≠ «${real[i] ?? "(sobra)"}»`);
  }
  const idx = (c: string) => real.indexOf(c);
  return {
    generador, archivo: file, cols: h.length, iguales, distintas,
    fob: fila[idx("Costo FOB *")], cif: fila[idx("Costo CIF *")], tasa: fila[idx("Tasa de Impuesto *")], comp: fila[idx("Composición")] ?? "",
  };
}

// 1) Depurador CK/TH/KL — una por empresa destino, con el proveedor fijo como en la pantalla
for (const e of EMPRESAS_DESTINO) {
  const [marca, desc] = marcaDe[e.key];
  const rows = processRows([H, ["R-1", "7000000000001", "FAC-1", desc, "M", 10, 10, 20, marca, "Prov del archivo"]] as SheetRow[], cfg).rows;
  const prov = proveedorParaEmpresa(e.key);
  const finales = rows.map((r) => ({ ...r, cols: { ...r.cols, "Precio *": 25, ...(prov ? { "Proveedor *": prov } : {}) } }));
  resultados.push(comparar(`Depurador · ${e.label}`, escribir(buildAoa(finales), `depurador-${e.key}.xlsx`)));
}

// 2) Facturas Tienda (Multifashion) — factura formato A
{
  const HA = ["CODIGO", "CODIGO BARRA", "REFERENCIA", "DESCRIPCION", "MARCA", "RUBRO", "SUB RUBRO", "UNIDAD DE MEDIDA", "PROVEEDOR", "CANTIDAD", "PRECIO"];
  const rows: SheetRow[] = [["N. Interno: 11-000001"], [], HA,
    ["C1", "7000000000003", "R3", "Men-Polos S/S", "TH Menswear", "Men", "Polos S/S", "PIEZA", "American Fashion Wear, SA", 4, 12.5]];
  const r = processFactura(rows, { temporadaFallback: "2026-09", catalogo: { "TH Menswear": ["Men-Polos S/S"] } });
  resultados.push(comparar("Facturas Tienda · Multifashion", escribir(buildTiendaAoa(r.rows), "tienda-multifashion.xlsx")));
}

// 3) Reebok (Active Shoes)
{
  const hdr = ["Order", "ClientName", "PO NAME", "New Article", "Old Article ", "SKU", "PREPACK FTW", "Name", "Department", "CAMPAÑAS", "PRIORIDAD",
    "OptionName", "CurveName", "CATEGORY", "AGE GROUP", "COLOR NAME", "GENDER", "SELL-IN QUARTER", "SPORTS CATEGORY", "Talla", "RRP", "WholesalePrice",
    "PREVENTA", "DROP", "FW26 FINAL", "JULIO", "COMENTARIOS", "DELIVERY", "UBICACIÓN"];
  const fila: SheetRow = new Array(29).fill(null);
  fila[2] = "VIC"; fila[3] = "100000015"; fila[5] = "100000015-9"; fila[7] = "CLUB C 85"; fila[8] = "FOOTWEAR";
  fila[13] = "SHOES"; fila[14] = "Adult"; fila[16] = "Female"; fila[19] = 9; fila[20] = 84.95; fila[21] = 42.9; fila[25] = 7;
  const { items } = parseReebok([[], hdr, fila], hdr.indexOf("JULIO"));
  const sw = buildSwitchRows(items, { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-07", tasa: "7" });
  resultados.push(comparar("Reebok · Active Shoes", escribir(buildSwitchAoa(sw), "reebok-active_shoes.xlsx")));
}

console.log("| Generador | Cols | Iguales a la plantilla | Distintas | FOB | CIF | Tasa | Composición |");
console.log("|---|---|---|---|---|---|---|---|");
for (const r of resultados) {
  console.log(`| ${r.generador} | ${r.cols} | ${r.iguales}/${real.length} | ${r.distintas.length ? r.distintas.join("; ") : "ninguna"} | ${r.fob} | ${r.cif} | ${JSON.stringify(r.tasa)} | ${JSON.stringify(r.comp)} |`);
}
console.log(`\nOUT_COLS === plantilla real: ${JSON.stringify(OUT_COLS) === JSON.stringify(real)}`);
console.log(`Archivos en ${OUT}`);
const todoIgual = resultados.every((r) => r.distintas.length === 0 && r.cols === real.length);
process.exit(todoIgual ? 0 : 1);
