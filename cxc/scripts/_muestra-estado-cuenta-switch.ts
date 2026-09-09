// ─────────────────────────────────────────────────────────────────────────────
// LA MUESTRA DEL PAPEL, para poner al lado del de Switch.
//
//   npx tsx scripts/_muestra-estado-cuenta-switch.ts [D-25] [fashion_wear]
//
// Lee producción (solo lectura), arma el PDF con el MISMO código que usan el
// correo y la hoja «Cobrar», y lo deja en `_paraclaude/cxc/`.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { fetchEstadoCuentaData } from "../src/lib/cxc/estado-cuenta-data";
import { buildEstadoCuentaPDF } from "../src/lib/pdf-estado-cuenta";

const CODIGO = process.argv[2] || "D-25";
const EMPRESA = process.argv[3] || "fashion_wear";

async function main() {
  const data = await fetchEstadoCuentaData(CODIGO, [EMPRESA]);
  const { doc, filename } = buildEstadoCuentaPDF(data, data.clienteNombre || CODIGO);
  const destino = path.join(process.cwd(), "_paraclaude", "cxc");
  fs.mkdirSync(destino, { recursive: true });
  const salida = path.join(destino, `6 - ${filename.replace(".pdf", "")}-forma-Switch.pdf`);
  fs.writeFileSync(salida, Buffer.from(doc.output("arraybuffer")));
  const docs = data.empresas.reduce((n, e) => n + e.documentos.length, 0);
  console.log(`Cliente ......... ${data.clienteNombre} (${data.codigo})`);
  console.log(`Documentos ...... ${docs}`);
  console.log(`Total ........... ${data.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  console.log(`Hojas ........... ${doc.getNumberOfPages()}`);
  console.log(`Archivo ......... ${salida}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
