/* ─────────────────────────────────────────────────────────────────────────────
 * MEDICIÓN — LO QUE LA FILA DE TOTALES VA A DECIR (17-sep-2026)
 *
 * SOLO LECTURA: no escribe nada, ni en la base ni en disco. Para un archivo de
 * despacho de Reebok, dice exactamente lo que la pantalla va a mostrar:
 * artículos, tallas, piezas, FOB, CIF, las facturas del archivo y cuántos
 * artículos son nuevos contra `switch_articulo_info` de Active Shoes.
 *
 * Sirve para cuadrar una pantalla contra el archivo de verdad sin abrir la app.
 *
 *   npx tsx scripts/_medir-resumen-del-archivo.ts <archivo.xlsx> [otro.xlsx …]
 * ────────────────────────────────────────────────────────────────────────── */
import fs from "node:fs";
import XLSX from "xlsx-js-style";
import { createClient } from "@supabase/supabase-js";
import { parseDespacho } from "../src/lib/depurador/reebok-despacho";
import { buildSwitchRows, valoresInesperados, REEBOK_FORMULA_A_DEFAULT, REEBOK_EMPRESA_KEY } from "../src/lib/depurador/reebok";
import { categoriasQueFaltan, inesperadosQueSeRevisan } from "../src/lib/depurador/reebok-categorias";
import { costoDelArchivo, facturasDelArchivo, contarContraSwitch, normalizarCodigo } from "../src/lib/depurador/resumen-del-archivo";
import type { SheetRow } from "../src/lib/depurador/logic";

const CFG = { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07" };
const dinero = (n: number) => "$" + n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const archivos = process.argv.slice(2);
if (archivos.length === 0) {
  console.log("Uso: npx tsx scripts/_medir-resumen-del-archivo.ts <archivo.xlsx> [otro.xlsx …]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = url && key ? createClient(url, key) : null;

/** Los códigos que `switch_articulo_info` ya tiene en Active Shoes, de a tandas
 *  de 200 (el mismo tamaño que usa la ruta). Solo lectura. */
async function yaEnSwitch(codigos: string[]): Promise<Set<string> | null> {
  if (!db) return null;
  const out = new Set<string>();
  for (let i = 0; i < codigos.length; i += 200) {
    const { data, error } = await db
      .from("switch_articulo_info")
      .select("codigo")
      .eq("empresa_key", REEBOK_EMPRESA_KEY)
      .in("codigo", codigos.slice(i, i + 200));
    if (error) return null;
    for (const r of data ?? []) out.add(normalizarCodigo((r as { codigo: string }).codigo));
  }
  return out;
}

(async () => {
  for (const ruta of archivos) {
    const wb = XLSX.read(fs.readFileSync(ruta), { type: "buffer" });
    const hoja = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null }) as SheetRow[];
    const { items, ausentes } = parseDespacho(rows);
    const filas = buildSwitchRows(items, CFG);

    const costo = costoDelArchivo(filas);
    const facturas = facturasDelArchivo(items.map((it) => it.documento));
    const codigos = [...new Set(filas.map((f) => normalizarCodigo(f.cols["Código *"])))];
    const enSwitch = await yaEnSwitch(codigos);
    const contra = enSwitch ? contarContraSwitch(codigos, enSwitch) : null;

    const inesperados = valoresInesperados(items);
    const faltan = categoriasQueFaltan(inesperados);

    console.log("═══", ruta.split("/").pop(), "· hoja", hoja);
    console.log(`  ${filas.length} artículos · ${filas.reduce((s, f) => s + f.skus, 0)} tallas · ` +
      `${filas.reduce((s, f) => s + f.piezas, 0)} piezas · FOB ${dinero(costo.fob)} · CIF ${dinero(costo.cif)}`);
    if (costo.sinCosto > 0) console.log(`  ⚠️ ${costo.sinCosto} artículo(s) sin costo quedan FUERA de esa suma`);
    console.log("  facturas del archivo:", facturas.length ? facturas.join(" · ") : "(el archivo no las trae)");
    console.log("  contra Switch:", contra
      ? `${contra.nuevos} nuevos · ${contra.yaEstan} ya están`
      : "(no se pudo preguntar — la línea no saldría en pantalla)");
    console.log("  categorías que le faltan al catálogo:", faltan
      ? `${faltan.categorias.join(", ")} — ${faltan.productos} productos`
      : "(ninguna)");
    console.log("  avisos que SÍ piden revisar (Department/GENDER):", inesperadosQueSeRevisan(inesperados).length);
    console.log("  columnas ausentes:", ausentes.map((a) => a.rotulo).join(", ") || "(ninguna)");
    console.log();
  }
})();
