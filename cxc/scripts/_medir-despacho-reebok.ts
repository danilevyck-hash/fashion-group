/* ─────────────────────────────────────────────────────────────────────────────
 * MEDICIÓN — QUÉ CAMBIA EN LAS 25 COLUMNAS CON EL EXCEL DE DESPACHO (17-sep-2026)
 *
 * SOLO LECTURA: no toca la base ni escribe un archivo. Para los MISMOS artículos
 * de un despacho, compara lo que sale hoy con lo que salía con la regla ASUMIDA
 * de la confirmación de compra (WholesalePrice × 0,80 en calzado y × 0,70 en el
 * resto), que es de donde venían los tres defectos.
 *
 *   npx tsx scripts/_medir-despacho-reebok.ts <archivo.xlsx> [otro.xlsx …]
 * ────────────────────────────────────────────────────────────────────────── */
import fs from "node:fs";
import XLSX from "xlsx-js-style";
import { parseDespacho } from "../src/lib/depurador/reebok-despacho";
import { buildSwitchRows, REEBOK_FORMULA_A_DEFAULT } from "../src/lib/depurador/reebok";
import type { SheetRow } from "../src/lib/depurador/logic";

const CFG = { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07" };
const r2 = (x: number): number => Math.round(x * 100) / 100;

const archivos = process.argv.slice(2);
if (archivos.length === 0) {
  console.log("Uso: npx tsx scripts/_medir-despacho-reebok.ts <archivo.xlsx> [otro.xlsx …]");
  process.exit(1);
}

for (const ruta of archivos) {
  const wb = XLSX.read(fs.readFileSync(ruta), { type: "buffer" });
  const hoja = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null }) as SheetRow[];
  const { items, ausentes, segmentosDesconocidos } = parseDespacho(rows);
  const filas = buildSwitchRows(items, CFG);

  const base = new Map<string, { dept: string; precioBase: number; sku: string }>();
  for (const it of items) {
    if (!base.has(it.newArticle)) base.set(it.newArticle, { dept: it.department, precioBase: it.wholesale ?? 0, sku: it.sku });
  }

  let costoNuevo = 0, costoViejo = 0, distintos = 0, sinCodigoDeBarras = 0;
  for (const f of filas) {
    const b = base.get(String(f.cols["Código *"]))!;
    const fobViejo = r2(b.precioBase * (b.dept === "FOOTWEAR" ? 0.8 : 0.7));
    const fobNuevo = Number(f.cols["Costo FOB *"]);
    if (fobViejo !== fobNuevo) distintos++;
    costoNuevo += fobNuevo * f.piezas;
    costoViejo += fobViejo * f.piezas;
    if (!/^\d{11,14}$/.test(String(f.cols["Código Barra *"]))) sinCodigoDeBarras++;
  }

  const rubros = new Map<string, number>();
  for (const f of filas) {
    const k = String(f.cols["rubro *"]) || "(vacío)";
    rubros.set(k, (rubros.get(k) ?? 0) + 1);
  }

  console.log("═══", ruta.split("/").pop(), "· hoja", hoja);
  console.log("  filas:", items.length, "· artículos:", filas.length, "· piezas recibidas:", filas.reduce((s, f) => s + f.piezas, 0));
  console.log("  costo FOB total — leído del despacho: $" + costoNuevo.toFixed(2) + "  ·  con el descuento asumido: $" + costoViejo.toFixed(2));
  console.log("  diferencia: $" + (costoNuevo - costoViejo).toFixed(2), "· artículos con costo distinto:", distintos, "de", filas.length);
  console.log("  códigos de barra que no son numéricos de 11-14 dígitos:", sinCodigoDeBarras);
  console.log("  columnas ausentes:", ausentes.map((a) => a.rotulo).join(", ") || "(ninguna)");
  console.log("  segmentos sin FTW/APP/HW:", segmentosDesconocidos.length);
  console.log("  artículos en ámbar (talla-muestra no exacta):", filas.filter((f) => f.fallback).length);
  console.log("  rubros:", [...rubros.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" · "));

  const m = filas[0];
  const b = base.get(String(m.cols["Código *"]))!;
  const fobViejo = r2(b.precioBase * (b.dept === "FOOTWEAR" ? 0.8 : 0.7));
  console.log("  — ejemplo:", String(m.cols["Código *"]), "·", String(m.cols["Descripción *"]));
  console.log("     Costo FOB     ", fobViejo, "→", m.cols["Costo FOB *"]);
  console.log("     Costo CIF     ", r2(fobViejo * 1.1), "→", m.cols["Costo CIF *"]);
  console.log("     Precio        ", "(del CIF viejo)", "→", m.cols["Precio *"]);
  // El SKU de la MISMA talla-muestra: comparar contra el de otra talla mentiría.
  const muestra = items.find((it) => it.newArticle === String(m.cols["Código *"]) && it.talla === m.talla);
  console.log("     Código Barra  ", muestra?.sku ?? b.sku, "→", m.cols["Código Barra *"], "· talla", m.talla);
  console.log("     Stock Ideal   ", "(piezas del mes)", "→", m.cols["Stock Ideal"]);
  console.log("     rubro", m.cols["rubro *"], "· Marca", m.cols["Marca *"], "· Composición:", String(m.cols["Composición"]).slice(0, 45) || "(vacía)");
  console.log("");
}
