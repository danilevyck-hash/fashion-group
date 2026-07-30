/**
 * Vuelca el Excel del ZIP de Marketing (resumen_gastos.xlsx) con datos REALES de
 * producción, para leer fila por fila lo que va a ver Daniel. Solo lectura.
 *
 *   npx tsx scripts/_verif-marketing-excel.ts            (export global)
 *   npx tsx scripts/_verif-marketing-excel.ts legacy      (bucket Tommy/Calvin)
 *   npx tsx scripts/_verif-marketing-excel.ts multifashion
 */
import fs from "fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
import XLSX from "xlsx-js-style";
import JSZip from "jszip";

async function main() {
  const { buildMarketingZip } = await import("../src/lib/marketing/zip-export");
  const grupo = (process.argv[2] as "legacy" | "marca" | undefined) || undefined;
  const r = await buildMarketingZip(grupo ? { grupo } : {});
  console.log("grupo:", grupo ?? "(global)", "| gastos:", r.gastos, "proyectos:", r.proyectos, "pdfs:", r.pdfsIncluidos, "/omit", r.pdfsOmitidos, "fotos:", r.fotosIncluidas, "/omit", r.fotosOmitidas);
  const zip = await JSZip.loadAsync(r.buffer);
  const names = Object.keys(zip.files).sort();
  console.log(`\n=== archivos del ZIP (${names.length}) ===`);
  for (const n of names) console.log("  ", n);
  const xl = await zip.file("resumen_gastos.xlsx")!.async("nodebuffer");
  fs.writeFileSync(`/tmp/resumen_${grupo ?? "global"}.xlsx`, xl);
  const wb = XLSX.read(xl, { type: "buffer" });
  console.log("\n=== hojas ===", wb.SheetNames.join(" | "));
  for (const s of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true }) as unknown[][];
    console.log(`\n--- ${s} (${aoa.length} filas) ---`);
    for (const row of aoa) console.log("   ", JSON.stringify(row));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
