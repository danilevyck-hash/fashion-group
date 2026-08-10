// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. Comprueba que el N° de guía del TRANSPORTISTA sale DISTINTO en
// cada línea, en los dos papeles que produce el sistema:
//   1. el PDF de "Compartir" (jsPDF, `construirPdfGuia`)
//   2. — el impreso HTML se verifica aparte, en el navegador —
//
// Uso:  GUIA_ID=<uuid> BASE=http://localhost:3111 npx tsx scripts/_verif-guia-transp-por-linea.ts
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync, readFileSync } from "fs";
import { construirPdfGuia } from "../src/lib/guias/pdf-guia";

async function main() {
  const id = process.env.GUIA_ID ?? readFileSync("/tmp/guia-test-id.txt", "utf8").trim();
  const base = process.env.BASE ?? "http://localhost:3111";
  const cookie = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  const res = await fetch(`${base}/api/guias/${id}`, { headers: { cookie: `cxc_session=${cookie}` } });
  const guia = await res.json();
  console.log("guía", guia.numero, "· cabecera:", JSON.stringify(guia.numero_guia_transp));
  for (const it of guia.guia_items) console.log("  línea", it.orden, it.cliente, "→", JSON.stringify(it.numero_guia_transp));
  const buf = Buffer.from(construirPdfGuia(guia).output("arraybuffer"));
  writeFileSync("/tmp/guia-test-compartir.pdf", buf);
  console.log("PDF de compartir escrito:", buf.length, "bytes → /tmp/guia-test-compartir.pdf");
}
main();
