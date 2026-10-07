// Capturas del PDF — estado de cuenta HOY vs RECOMENDACIÓN (7-oct-2026).
// SOLO LECTURA: solo hace SELECT contra Supabase (fetchEstadoCuentaData), no
// escribe nada. Renderiza el PDF real a PNG con pdfjs, igual que
// scripts/revisar-papeles.ts.
//
//   MODO=hoy       npx tsx -r dotenv/config scripts/_capturas-estado-cuenta-pdf.ts
//   MODO=propuesta npx tsx -r dotenv/config scripts/_capturas-estado-cuenta-pdf.ts
//
// MODO=propuesta reescribe el archivo del interruptor a `true` ANTES de
// importar nada (los módulos leen la constante al cargarse), y lo restaura a
// `false` siempre al salir (try/finally) — nunca queda prendido en disco.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = "/tmp/ec-grupo-caps";
const MODO = process.env.MODO === "propuesta" ? "propuesta" : "hoy";
mkdirSync(OUT, { recursive: true });

const flagPath = path.resolve("src/lib/cxc/estado-cuenta-un-boton-2026-10.ts");
const original = readFileSync(flagPath, "utf8");

async function hojasEnPng(bytes: Uint8Array) {
  const { abrirPdf } = await import("../src/lib/papeles-qa/revisar");
  const doc = await abrirPdf(bytes);
  const pngs: Buffer[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vista = page.getViewport({ scale: 2.2 });
    const { canvas, context } = doc.canvasFactory.create(Math.ceil(vista.width), Math.ceil(vista.height));
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport: vista, canvas }).promise;
    pngs.push(canvas.toBuffer("image/png"));
  }
  return pngs;
}

async function main() {
  if (MODO === "propuesta") writeFileSync(flagPath, original.replace("= false;", "= true;"));

  const { fetchEstadoCuentaData } = await import("../src/lib/cxc/estado-cuenta-data");
  const { CXC_GRUPO_EMPRESA_KEYS } = await import("../src/lib/empresa-mapping");
  const { buildEstadoCuentaPDF } = await import("../src/lib/pdf-estado-cuenta");

  // D-170 Nova Lux, S.A. — debe en 4 empresas del grupo a la vez. Medido
  // read-only el 7-oct-2026 contra producción.
  const CODIGO = "D-170";
  const grupo = await fetchEstadoCuentaData(CODIGO, [...CXC_GRUPO_EMPRESA_KEYS]);
  console.log(`${CODIGO} — ${grupo.clienteNombre}: ${grupo.empresas.length} empresas, total ${grupo.total}`);

  const pdf = buildEstadoCuentaPDF(grupo, grupo.clienteNombre);
  const pngs = await hojasEnPng(new Uint8Array(pdf.doc.output("arraybuffer")));
  const { writeFileSync: wfBin } = await import("node:fs");
  wfBin(path.join(OUT, `${MODO}-pdf-hoja1.png`), pngs[0]);
  console.log(`${MODO} filename:`, pdf.filename, `(${pngs.length} hojas)`);

  const unaEmpresa = grupo.empresas.find((e) => e.empresa_key === "fashion_wear")
    ? "fashion_wear" : grupo.empresas[0].empresa_key;
  const soloUna = await fetchEstadoCuentaData(CODIGO, [unaEmpresa]);
  const pdfUna = MODO === "propuesta"
    ? buildEstadoCuentaPDF(soloUna, soloUna.clienteNombre, { unaEmpresaElegida: true })
    : buildEstadoCuentaPDF(soloUna, soloUna.clienteNombre);
  console.log(`${MODO} (una empresa) filename:`, pdfUna.filename);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => writeFileSync(flagPath, original));
