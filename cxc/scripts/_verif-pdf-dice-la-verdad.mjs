// ─────────────────────────────────────────────────────────────────────────────
// EL PAPEL SE GENERA DE VERDAD Y SE LEE CON pdftotext (25-ago-2026)
//
// Un test que mire el objeto jsPDF en memoria NO prueba que el papel salga
// bien: el encabezado se dibuja con doc.text() en coordenadas fijas y lo que
// importa es qué se LEE en el A4. Este script genera los DOS casos —pedido y
// cotización— con el MISMO core que usa la app, los guarda, y les pasa
// `pdftotext` (o `mutool`) para leer el texto de verdad.
//
// Además mide el ANCHO del encabezado: "Cotización: TOM-027" es más largo que
// "Pedido: TOM-027" y la línea vive en columnas FIJAS (Cliente x=14 · documento
// x=90 · Fecha x=150). Si se pasa de 60 mm se monta encima de la fecha.
//
// Uso:  npx tsx scripts/_verif-pdf-dice-la-verdad.mjs
// Solo lectura: no toca la base, no llama a Switch, no manda nada.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { buildOrderPdfDoc } = await import("../src/lib/catalogo/order-pdf-core.ts");
const { palabraDelPapel } = await import("../src/lib/catalogo/documento-switch.ts");

const NUMERO = "TOM-027";
const CLIENTE = "COMERCIAL EL MACHETAZO, S.A. — SUCURSAL VÍA ESPAÑA";

const ITEMS = [
  { sku: "TH-1001", name: "Tommy Hilfiger Corp Logo Tee", quantity: 3, unit_price: 18.5, image_url: "", category: "CAMISETAS", bulto_pzas: 12 },
  { sku: "TH-1002", name: "Tommy Hilfiger Flag Cap", quantity: 2, unit_price: 22, image_url: "", category: "GORRAS", bulto_pzas: 12 },
];

const CASOS = [
  { nombre: "PEDIDO en Switch", envio: { estado: "verificado", documento: "pedido" }, esperado: "Pedido" },
  { nombre: "COTIZACIÓN en Switch", envio: { estado: "verificado", documento: "cotizacion" }, esperado: "Cotización" },
  { nombre: "TODAVÍA NO salió a Switch", envio: null, esperado: "Pedido" },
];

function leerTexto(ruta) {
  try {
    return execFileSync("pdftotext", ["-layout", ruta, "-"], { encoding: "utf8" });
  } catch {
    return execFileSync("mutool", ["draw", "-F", "txt", ruta], { encoding: "utf8" });
  }
}

const dir = mkdtempSync(join(tmpdir(), "pdf-verdad-"));
const fallos = [];
console.log(`\nPDFs en ${dir}\n`);

for (const caso of CASOS) {
  const palabra = palabraDelPapel(caso.envio);
  const doc = buildOrderPdfDoc({
    marca: "tommy",
    orderNumber: NUMERO,
    clientName: CLIENTE,
    createdAt: "2026-08-25T12:00:00.000Z",
    items: ITEMS,
    bultoSize: (_c, pz) => pz || 12,
    images: {},
    documentoLabel: palabra,
  });
  const ruta = join(dir, `${palabra}-${NUMERO}.pdf`);
  writeFileSync(ruta, Buffer.from(doc.output("arraybuffer")));
  const bytes = statSync(ruta).size;
  const texto = leerTexto(ruta);
  const linea = texto.split("\n").find((l) => /TOM-027/.test(l)) || "";
  const encabezado = (linea.match(/(Pedido|Cotización):\s*TOM-027/) || [])[0] || "(no se leyó)";

  // El ancho real de la línea en mm, medido con la MISMA fuente del PDF.
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const anchoMm = doc.getTextWidth(`${palabra}: ${NUMERO}`);
  const DISPONIBLE_MM = 150 - 90; // desde la columna del documento hasta la fecha

  console.log(`── ${caso.nombre}`);
  console.log(`   archivo   ${palabra}-${NUMERO}.pdf  (${(bytes / 1024).toFixed(1)} KB)`);
  console.log(`   encabezado "${encabezado}"`);
  console.log(`   ancho     ${anchoMm.toFixed(1)} mm de ${DISPONIBLE_MM} mm disponibles`);

  if (bytes < 5 * 1024) fallos.push(`${caso.nombre}: el PDF pesa ${bytes} bytes`);
  if (!texto.includes(`${caso.esperado}: ${NUMERO}`)) {
    fallos.push(`${caso.nombre}: el papel NO dice "${caso.esperado}: ${NUMERO}" — se leyó "${encabezado}"`);
  }
  const contraria = caso.esperado === "Pedido" ? "Cotización" : "Pedido";
  if (texto.includes(`${contraria}: ${NUMERO}`)) {
    fallos.push(`${caso.nombre}: el papel ADEMÁS dice "${contraria}: ${NUMERO}"`);
  }
  if (!texto.includes(NUMERO)) fallos.push(`${caso.nombre}: se perdió el número ${NUMERO}`);
  if (anchoMm > DISPONIBLE_MM) {
    fallos.push(`${caso.nombre}: el encabezado mide ${anchoMm.toFixed(1)} mm y se monta encima de la Fecha`);
  }
  console.log("");
}

if (fallos.length) {
  console.error("❌ FALLOS:");
  for (const f of fallos) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ Los 3 casos: el papel dice la verdad, el número no cambió y nada se monta.\n");
