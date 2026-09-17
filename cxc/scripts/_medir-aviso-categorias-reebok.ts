/* ─────────────────────────────────────────────────────────────────────────────
 * MEDICIÓN — QUÉ APAGA AGREGAR LOS CUATRO RUBROS DEL DESPACHO DE ROPA
 * (17-sep-2026). SOLO LECTURA: no toca la base ni escribe nada.
 *
 * El mapa `rubro → categoría` es el PLAN B: solo se consulta cuando el
 * Department viene vacío. Así que agregar un rubro no mueve un artículo que ya
 * trae su Department — lo que mueve es el AVISO de la Plantilla Switch, que es
 * donde de verdad dolía (30 de 75 en ámbar, sin nada que hacer).
 *
 * Esto lo mide sobre el archivo de verdad, con el parser de verdad.
 *
 *   npx tsx scripts/_medir-aviso-categorias-reebok.ts <archivo.xlsx> […]
 * ────────────────────────────────────────────────────────────────────────── */
import fs from "node:fs";
import XLSX from "xlsx-js-style";
import { parseDespacho } from "../src/lib/depurador/reebok-despacho";
import { valoresInesperados, REEBOK_CATEGORY_ESPERADAS } from "../src/lib/depurador/reebok";
import { categoriasQueFaltan } from "../src/lib/depurador/reebok-categorias";
import type { SheetRow } from "../src/lib/depurador/logic";

const NUEVOS = ["T-SHIRTS", "TOPS", "BRA", "JACKETS"];

for (const archivo of process.argv.slice(2)) {
  const wb = XLSX.read(fs.readFileSync(archivo), { type: "buffer" });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<SheetRow>(hoja, { header: 1, raw: true, defval: "" });
  const { items } = parseDespacho(rows);

  console.log(`\n── ${archivo.split("/").pop()} — ${items.length} renglones`);

  const antes = valoresInesperados(items);
  const faltanAntes = categoriasQueFaltan(antes);
  console.log(`   ANTES  (los ${REEBOK_CATEGORY_ESPERADAS.length} rubros del código):`);
  console.log(`     categorías que faltan: ${faltanAntes ? faltanAntes.categorias.join(", ") : "ninguna"}`);
  console.log(`     productos afectados:   ${faltanAntes ? faltanAntes.productos : 0}`);

  const conNuevos = [...REEBOK_CATEGORY_ESPERADAS, ...NUEVOS];
  const despues = valoresInesperados(items, conNuevos);
  const faltanDespues = categoriasQueFaltan(despues);
  console.log(`   DESPUÉS (agregando ${NUEVOS.join(" · ")}):`);
  console.log(`     categorías que faltan: ${faltanDespues ? faltanDespues.categorias.join(", ") : "ninguna"}`);
  console.log(`     productos afectados:   ${faltanDespues ? faltanDespues.productos : 0}`);

  // Los artículos distintos del archivo, y cuántos traen Department bueno.
  const arts = new Set(items.map((i) => i.newArticle || i.sku));
  const sinDept = new Set(items.filter((i) => !String(i.department ?? "").trim()).map((i) => i.newArticle || i.sku));
  console.log(`   artículos distintos: ${arts.size} · sin Department (los que mirarían el rubro): ${sinDept.size}`);
}
