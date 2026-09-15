// Medición del COSTO ÚNICO de Reebok — antes y después (14-sep-2026).
//
// 🔴 ESTO MUEVE PRECIOS QUE SE LE DAN A CLIENTES. El «Pedido para cliente»
// calculaba su costo con un `× 0.80` propio mientras la Plantilla de Switch usa
// `fobReebok` (0.80 footwear · 0.70 el resto · «WholesalePrice OFF» cuando
// viene). El mismo artículo salía con DOS costos según qué archivo se bajara.
//
// Lee el Excel REAL del proveedor con el MISMO camino de la pantalla
// (SheetNames[0] → sheet_to_json header:1 → parseReebok) y compara, artículo por
// artículo, el Precio A y el Precio B de ANTES contra los de AHORA.
//
//   npx tsx scripts/_medir-costo-unico-reebok.ts "<archivo.xlsx>" [flete]
//
// Solo lectura: no toca la base ni escribe nada del proyecto.

import * as XLSX from "xlsx-js-style";
import {
  parseReebok, buildCatalogo, detectMonthCol, findHeaderRow, fobReebok,
  REEBOK_FORMULA_A_DEFAULT, REEBOK_FORMULA_B_DEFAULT,
} from "../src/lib/depurador/reebok";
import { precioDescripcion } from "../src/lib/depurador/logic";
import { normalizarFlete } from "../src/lib/depurador/flete";
import type { SheetRow } from "../src/lib/depurador/logic";

const archivo = process.argv[2];
if (!archivo) { console.error("Falta el archivo .xlsx"); process.exit(1); }
const flete = normalizarFlete(process.argv[3]);

const wb = XLSX.readFile(archivo);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as SheetRow[];
const headerRow = findHeaderRow(rows);
const mes = detectMonthCol(rows[headerRow] ?? []);
const { items } = parseReebok(rows, mes);

const round2 = (x: number) => Math.round(x * 100) / 100;

// AHORA (con el arreglo): buildCatalogo usa fobReebok.
const ahora = buildCatalogo(items, { formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT, flete });

// ANTES: el `× 0.80` fijo que tenía el pedido para cliente, replicado acá para
// poder comparar. NO vive en el código: es el defecto que se está arreglando.
const antesDe = (w: number | null) => (w === null ? null : round2(w * 0.8 * flete));

type Caso = "footwear" | "resto" | "con-descuento";
const casoDe = (dept: string, off: number | null): Caso =>
  off !== null && off > 0 ? "con-descuento"
    : String(dept).toUpperCase().includes("FOOTWEAR") ? "footwear" : "resto";

// Primer item de cada grupo (po|||newArticle), igual que buildCatalogo.
const primero = new Map<string, typeof items[number]>();
for (const it of items) {
  const k = `${it.po}|||${it.newArticle}`;
  if (!primero.has(k)) primero.set(k, it);
}

const filas = ahora.map((r) => {
  const it = primero.get(`${r.po}|||${r.newArticle}`)!;
  const costoAntes = antesDe(r.wholesale);
  const pAantes = precioDescripcion(costoAntes, null, REEBOK_FORMULA_A_DEFAULT);
  const pBantes = precioDescripcion(costoAntes, null, REEBOK_FORMULA_B_DEFAULT);
  return {
    codigo: r.newArticle, nombre: r.name, dept: r.department,
    caso: casoDe(it.department, it.wholesaleOff),
    wholesale: r.wholesale, off: it.wholesaleOff,
    costoAntes, costoAhora: r.costo,
    pAantes, pAahora: r.precioA, pBantes, pBahora: r.precioB,
    cambiaCosto: costoAntes !== r.costo,
    cambiaPrecio: pAantes !== r.precioA || pBantes !== r.precioB,
    dA: pAantes !== null && r.precioA !== null ? round2(r.precioA - pAantes) : null,
    dB: pBantes !== null && r.precioB !== null ? round2(r.precioB - pBantes) : null,
  };
});

const cambian = filas.filter((f) => f.cambiaCosto);
const cambianPrecio = filas.filter((f) => f.cambiaPrecio);
const porCaso = (c: Caso) => filas.filter((f) => f.caso === c);
const suben = cambianPrecio.filter((f) => (f.dA ?? 0) > 0 || (f.dB ?? 0) > 0);
const bajan = cambianPrecio.filter((f) => (f.dA ?? 0) < 0 || (f.dB ?? 0) < 0);
const footwearPrecio = cambianPrecio.filter((f) => f.caso === "footwear");

const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(2));
const linea = (f: typeof filas[number]) =>
  `  ${f.codigo}  ${String(f.nombre).slice(0, 34).padEnd(34)} ${f.caso.padEnd(14)} ` +
  `mayorista ${fmt(f.wholesale)}${f.off ? ` (OFF ${fmt(f.off)})` : ""}  ` +
  `costo ${fmt(f.costoAntes)} → ${fmt(f.costoAhora)}  ` +
  `A ${fmt(f.pAantes)} → ${fmt(f.pAahora)}  B ${fmt(f.pBantes)} → ${fmt(f.pBahora)}`;

console.log(`Archivo: ${archivo}`);
console.log(`Flete: ${flete.toFixed(2)}  ·  fórmulas por defecto (A ÷0.75 · B ÷0.80, redondeo al par)`);
console.log(`Filas del proveedor: ${items.length}  ·  artículos del pedido (PO + New Article): ${filas.length}`);
console.log("");
console.log(`Cambian de COSTO:  ${cambian.length} de ${filas.length}`);
console.log(`Cambian de PRECIO: ${cambianPrecio.length} de ${filas.length}   (SUBEN ${suben.length} · bajan ${bajan.length})`);
console.log(`  de esos, footwear (solo el centavo del redondeo): ${footwearPrecio.length}`);
console.log("");
console.log("Reparto por tipo:");
for (const c of ["footwear", "resto", "con-descuento"] as Caso[]) {
  const g = porCaso(c);
  console.log(`  ${c.padEnd(14)} ${String(g.length).padStart(4)} artículos · cambian ${g.filter((f) => f.cambiaCosto).length}`);
}
console.log("");
const peso = (f: typeof filas[number]) => Math.min(f.dA ?? 0, f.dB ?? 0);
const ordA = [...cambianPrecio].sort((a, b) => peso(b) - peso(a));
if (ordA.length) {
  console.log("Mayor subida (Precio A):"); console.log(linea(ordA[0]));
  console.log("Mayor bajada (Precio A):"); console.log(linea(ordA[ordA.length - 1]));
  console.log("");
  console.log("Tres ejemplos:");
  const paso = Math.max(1, Math.floor(ordA.length / 3));
  for (const f of [ordA[0], ordA[Math.min(paso, ordA.length - 1)], ordA[ordA.length - 1]]) console.log(linea(f));
}
console.log("");
console.log("Control — artículos que NO cambian (footwear sin descuento), primeros 3:");
for (const f of filas.filter((x) => !x.cambiaCosto).slice(0, 3)) console.log(linea(f));

// Control 2: la plantilla de Switch tiene que decir el MISMO costo FOB que el pedido.
const desalineados = ahora.filter((r) => {
  const it = primero.get(`${r.po}|||${r.newArticle}`)!;
  if (!it || it.wholesale === null) return false;
  return round2(round2(fobReebok(it.department, it.wholesale, it.wholesaleOff)) * flete) !== r.costo;
});
console.log("");
console.log(`Control — artículos donde el costo del pedido NO iguala al CIF de la plantilla: ${desalineados.length} (tiene que ser 0)`);
