/**
 * Debug one-shot: extrae el PDF y dumpea info cruda del parser actual
 * para PLs concretos (default: 80163244 y 80163234 — los dos bugs de
 * 4c-bis). Lectura pura, no escribe nada.
 *
 * Uso:
 *   npx tsx scripts/inspect-pl.ts
 *   npx tsx scripts/inspect-pl.ts --pl=80163244
 *   npx tsx scripts/inspect-pl.ts --pl=80163244 --raw
 *   npx tsx scripts/inspect-pl.ts --pl=80163244 --sku=76J4883CSY   (raw por SKU)
 */
import { resolve } from "node:path";
import { extractPdfFromFile } from "./lib/extract-pdf-node";
import {
  parseMultiplePackingLists,
  splitTextIntoPLSections,
  PARSER_VERSION,
  type RawLine,
} from "../src/lib/parse-packing-list";

function parseArgs() {
  const args = process.argv.slice(2);
  let pdf = "tests/fixtures/packing-lists/42328_PList.pdf";
  let pls: string[] = ["80163244", "80163234"];
  let raw = false;
  let rawSku: string | null = null;
  for (const a of args) {
    const pdfMatch = a.match(/^--pdf=(.+)$/);
    if (pdfMatch) pdf = pdfMatch[1];
    const plMatch = a.match(/^--pl=(.+)$/);
    if (plMatch) pls = plMatch[1].split(",").map(s => s.trim()).filter(Boolean);
    if (a === "--raw") raw = true;
    const skuMatch = a.match(/^--sku=(.+)$/);
    if (skuMatch) { rawSku = skuMatch[1]; raw = true; }
  }
  return { pdf, pls, raw, rawSku };
}

function dumpSectionRaw(plNumber: string, section: { text: string; rawLines?: RawLine[] }, skuFilter: string | null) {
  console.log(`---- RAW dump PL #${plNumber} ----`);
  const lines = section.text.split("\n");
  const raws = section.rawLines ?? [];
  let active = !skuFilter;
  let linesSinceSku = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (skuFilter && t.startsWith(skuFilter)) { active = true; linesSinceSku = 0; }
    if (!active) continue;
    const r = raws[i];
    const xTokens = r && r.items.length
      ? r.items.map(it => `${it.str.trim()}@${it.x.toFixed(0)}`).join(" ")
      : "";
    console.log(`  [${String(i).padStart(4)}] ${t}`);
    if (xTokens) console.log(`         X: ${xTokens}`);
    if (skuFilter) {
      linesSinceSku++;
      if (linesSinceSku > 4) active = false;
    }
  }
}

async function main() {
  const { pdf, pls: plsFilter, raw, rawSku } = parseArgs();
  const pdfPath = resolve(process.cwd(), pdf);
  console.log(`[inspect] parser version: ${PARSER_VERSION}`);
  console.log(`[inspect] pdf: ${pdfPath}`);
  const { text, rawLines } = await extractPdfFromFile(pdfPath);
  const parsed = parseMultiplePackingLists(text, rawLines);
  console.log(`[inspect] PLs detectados: ${parsed.length}\n`);

  const sections = splitTextIntoPLSections(text, rawLines);

  for (const pl of parsed) {
    if (!plsFilter.includes(pl.numeroPL)) continue;
    console.log("====================================================");
    console.log(`PL #${pl.numeroPL}  ${pl.empresa}  ${pl.fechaEntrega}`);
    console.log(`Total bultos: ${pl.totalBultos}  Total piezas: ${pl.totalPiezas}`);
    console.log(`Bultos en orden de aparición: ${pl.bultos.map(b => `${b.id} (${b.rawId})`).join(", ")}`);
    console.log("");
    for (const b of pl.bultos) {
      const sum = b.items.reduce((s, i) => s + i.qty, 0);
      console.log(`  Bulto ${b.id}  [cols=${b.sizeColumns.join("/")}]  header=${b.totalPiezas}  sum=${sum}${sum !== b.totalPiezas ? " ⚠ MISMATCH" : ""}`);
      for (const it of b.items) {
        const flags: string[] = [];
        if (it.hasM) flags.push("M");
        if (it.has32) flags.push("32");
        console.log(`     ${it.estilo.padEnd(14)} qty=${String(it.qty).padStart(4)} ${flags.length ? `[${flags.join(",")}]` : ""}  ${it.producto}`);
      }
    }
    console.log("");

    if (raw) {
      const idx = parsed.indexOf(pl);
      const section = sections[idx];
      dumpSectionRaw(pl.numeroPL, section, rawSku);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
