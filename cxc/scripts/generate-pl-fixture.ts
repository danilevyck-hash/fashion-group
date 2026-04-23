/**
 * Congela el input y el expected output del test de fixtures de PL.
 *
 * Lee tests/fixtures/packing-lists/42328_PList.pdf → produce dos JSONs:
 *   - 42328_raw.json      (input: text + rawLines extraídos de pdfjs)
 *   - 42328_expected.json (output canónico del parser vigente para cada PL)
 *
 * El test (parse-packing-list.fixtures.test.ts) lee raw.json, re-corre el parser
 * y compara campo por campo con expected.json. Si el parser cambia, este script
 * se re-corre a mano para re-grabar el expected — el diff del PR es la evidencia
 * del cambio.
 *
 * Uso: npx tsx scripts/generate-pl-fixture.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractPdfFromFile } from "./lib/extract-pdf-node";
import {
  parseMultiplePackingLists,
  PARSER_VERSION,
} from "../src/lib/parse-packing-list";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/packing-lists");
const PDF_PATH = resolve(FIXTURE_DIR, "42328_PList.pdf");
const RAW_PATH = resolve(FIXTURE_DIR, "42328_raw.json");
const EXPECTED_PATH = resolve(FIXTURE_DIR, "42328_expected.json");

async function main() {
  console.log(`[fixture] parser version: ${PARSER_VERSION}`);
  console.log(`[fixture] pdf: ${PDF_PATH}`);
  const { text, rawLines } = await extractPdfFromFile(PDF_PATH);

  // Guarda raw: text + rawLines completos. Es el INPUT determinístico del test.
  writeFileSync(
    RAW_PATH,
    JSON.stringify({ text, rawLines }, null, 0) + "\n",
    "utf-8",
  );
  console.log(`[fixture] raw → ${RAW_PATH} (${text.length} chars, ${rawLines.length} líneas)`);

  // Corre el parser vigente y graba el output canónico por PL.
  const parsed = parseMultiplePackingLists(text, rawLines);
  const expected = {
    parser_version: PARSER_VERSION,
    total_pls: parsed.length,
    pls: parsed.map(pl => ({
      numero_pl: pl.numeroPL,
      empresa: pl.empresa,
      fecha_entrega: pl.fechaEntrega,
      total_bultos: pl.totalBultos,
      total_piezas: pl.totalPiezas,
      // Orden físico del PDF: bodega trabaja el PL impreso bulto por bulto.
      bulto_order: pl.bultos.map(b => ({ id: b.id, label: b.rawId })),
      bultos: pl.bultos.map(b => ({
        id: b.id,
        label: b.rawId,
        total_piezas: b.totalPiezas,
        size_columns: b.sizeColumns,
        items: b.items.map(it => ({
          estilo: it.estilo,
          producto: it.producto,
          qty: it.qty,
          has_m: it.hasM,
          has_32: it.has32,
        })),
      })),
    })),
  };
  writeFileSync(
    EXPECTED_PATH,
    JSON.stringify(expected, null, 2) + "\n",
    "utf-8",
  );
  console.log(`[fixture] expected → ${EXPECTED_PATH} (${expected.total_pls} PLs)`);
  const totalBultos = expected.pls.reduce((s, p) => s + p.total_bultos, 0);
  const totalItems = expected.pls.reduce((s, p) => s + p.bultos.reduce((ss, b) => ss + b.items.length, 0), 0);
  console.log(`[fixture] total bultos: ${totalBultos}, total items: ${totalItems}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
