// Arma el Excel del UNIVERSO REAL de artículos con el formato del proveedor,
// para medir el Depurador por la puerta de la app.
//
// ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
// La alarma de descripciones del Depurador solo se puede contar cargando un
// archivo por la pantalla. Un Excel de un pedido suelto toca 3 o 4 marcas: no
// sirve para saber cuántas descripciones del NEGOCIO ENTERO alerta el catálogo.
// Este script arma un archivo con UNA fila por cada par (MARCA cruda del Switch,
// DESCRIPCIÓN cruda del artículo) que existe de verdad en producción, así la
// pantalla ve el universo completo de una sola pasada.
//
// La marca cruda sale de `switch_factura_lineas` (la única tabla de FG que trae
// marca junto al código; `switch_articulo_marca` es SOLO american_classic).
// Va CRUDA a propósito: la reclasificación (`reclassMarca`, ej. APPAREL +
// T-SHIRT → CK Jeans) la tiene que hacer el Depurador, no este script — si no,
// se mediría otra cosa que la que ve Daniel.
//
// SOLO LECTURA de la base. Escribe un .xlsx local y nada más.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_universo-depurador-excel.ts
//   → /tmp/universo-depurador.xlsx

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx-js-style";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** Lee TODO paginado con orden estable — db-max-rows=1000 corta en silencio. */
async function leerTodo(tabla: string, cols: string, orden: string[]) {
  const out: any[] = [];
  const PAGINA = 1000;
  for (let desde = 0; ; desde += PAGINA) {
    let q = db.from(tabla).select(cols);
    for (const o of orden) q = q.order(o);
    const { data, error } = await q.range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) break;
  }
  return out;
}

async function main() {
  const info = await leerTodo("switch_articulo_info", "empresa_key, articulo_id, codigo, descripcion", ["empresa_key", "articulo_id"]);
  const lineas = await leerTodo("switch_factura_lineas", "empresa_key, codigo, marca", ["empresa_key", "id"]);

  const marcaPorCodigo = new Map<string, string>();
  for (const l of lineas) {
    const k = `${l.empresa_key}|${String(l.codigo).trim()}`;
    if (!marcaPorCodigo.has(k) && l.marca) marcaPorCodigo.set(k, String(l.marca).trim());
  }

  const vistos = new Set<string>();
  const filas: (string | number)[][] = [
    ["REFERENCIA", "EAN", "P_CATEGORY", "TALLA", "CANTIDAD", "COSTO", "PRECIO2", "MARCA", "PROVEEDOR", "FACT"],
  ];
  let n = 0;
  for (const r of info) {
    const marca = marcaPorCodigo.get(`${r.empresa_key}|${String(r.codigo).trim()}`);
    if (!marca) continue;
    const desc = String(r.descripcion ?? "").trim();
    if (!desc) continue;
    const k = `${marca.toUpperCase()}|||${desc.toUpperCase()}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    n++;
    // CANTIDAD 1: con 0, processRows tira la fila (el proveedor "no la pidió").
    filas.push([`UNIV${String(n).padStart(4, "0")}`, `900000${String(n).padStart(6, "0")}`, desc, "M", 1, 10, 20, marca, "American Fashion Wear, SA", "9999999"]);
  }

  const ws = XLSX.utils.aoa_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "universo");
  XLSX.writeFile(wb, "/tmp/universo-depurador.xlsx");
  console.log(`pares (marca, descripción) reales: ${n} → /tmp/universo-depurador.xlsx`);
}

main().catch((e) => { console.error(e); process.exit(1); });
