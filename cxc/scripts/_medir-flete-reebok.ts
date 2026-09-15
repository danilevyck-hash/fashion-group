// Medición del FLETE de Reebok (Costo CIF) — antes y después.
//
// 🔴 ESTO MUEVE PLATA: el «Costo CIF *» es el costo con el que los artículos
// entran a Switch. El control de todo el cambio es que, con el flete en 1.10
// (el default de siempre), NI UN CENTAVO cambie.
//
// Arma un Excel de proveedor con la forma real del Book4 de Reebok (headers en
// la 2.ª fila, una columna de mes con piezas), lo pasa por el MISMO parseReebok
// que usa la pantalla y genera las DOS salidas. Escribe un JSON para comparar.
//
//   npx tsx scripts/_medir-flete-reebok.ts <salida.json> [flete]
//
// Solo lectura: no toca la base ni el disco del proyecto.

import { parseReebok, buildSwitchRows, buildCatalogo, REEBOK_FORMULA_A_DEFAULT, REEBOK_FORMULA_B_DEFAULT } from "../src/lib/depurador/reebok";
import type { SheetRow } from "../src/lib/depurador/logic";
import { writeFileSync } from "node:fs";

// Fila de basura arriba (el Book4 real la trae), después los encabezados.
const HEAD = ["PO NAME", "New Article", "SKU", "Name", "Department", "CATEGORY", "AGE GROUP",
  "COLOR NAME", "GENDER", "Sell In", "RRP", "WholesalePrice", "WholesalePrice OFF", "SIZE", "JULIO"];

// Artículos con las tres formas que cambian el FOB: footwear (×0.8), apparel
// (×0.7) y uno con «WholesalePrice OFF» puesto (gana al porcentaje).
const FILAS: (string | number)[][] = [
  ["PO-1", "100034418", "1000344180085", "CLUB C 85", "FOOTWEAR", "SHOES", "ADULT", "WHITE", "Male", "SI", 90, 45, "", "8", 6],
  ["PO-1", "100034418", "1000344180095", "CLUB C 85", "FOOTWEAR", "SHOES", "ADULT", "WHITE", "Male", "SI", 90, 45, "", "9", 6],
  ["PO-1", "100200571", "1002005710M", "IDENTITY TEE", "APPAREL", "T-SHIRTS", "ADULT", "BLACK", "Female", "SI", 30, 14.9, "", "M", 12],
  ["PO-1", "100200571", "1002005710L", "IDENTITY TEE", "APPAREL", "T-SHIRTS", "ADULT", "BLACK", "Female", "SI", 30, 14.9, "", "L", 12],
  ["PO-2", "100075436", "1000754360U", "ACTIVE FOUNDATION BAG", "HARDWARE", "BAGS", "ADULT", "NAVY", "Unisex", "SI", 45, 22.33, 19.5, "U", 4],
  ["PO-2", "100091077", "1000910770095", "NANO X4", "FOOTWEAR", "SHOES", "ADULT", "GREY", "Male", "SI", 130, 67.77, "", "9.5", 3],
];

const rows: SheetRow[] = [["Reebok Book4", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], HEAD, ...FILAS] as SheetRow[];

const destino = process.argv[2] ?? "/dev/stdout";
const fleteArg = process.argv[3];
const flete = fleteArg ? Number(fleteArg) : undefined;

const { items } = parseReebok(rows, HEAD.indexOf("JULIO"));

const switchRows = buildSwitchRows(items, { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07", flete });
const catalogo = buildCatalogo(items, { formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT, flete });

const salida = {
  flete: flete ?? "(sin parámetro — el de siempre)",
  switch: switchRows.map((r) => ({
    codigo: r.cols["Código *"], nombre: r.cols["Descripción *"],
    fob: r.cols["Costo FOB *"], cif: r.cols["Costo CIF *"], precio: r.cols["Precio *"],
  })),
  catalogo: catalogo.map((r) => ({
    codigo: r.newArticle, nombre: r.name, costo: r.costo, precioA: r.precioA, precioB: r.precioB,
  })),
};

writeFileSync(destino, JSON.stringify(salida, null, 2) + "\n");
