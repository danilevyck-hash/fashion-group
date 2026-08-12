// Verificación del logo OFICIAL de Tommy en los dos PDF (pedido + catálogo),
// con datos dummy. Mismo molde que scripts/_verif-calvin-logo-pdf.ts (#499).
//
//   npx tsx scripts/_verif-tommy-logo-pdf.ts
//
// ⚠️ NO ALCANZA con que `addImage` no lance (eso ya lo cubre
// pdf-logos-embebibles.test.ts): las llamadas van dentro de un try/catch, y un
// PNG con paleta + tRNS que jsPDF no supiera componer saldría como un
// rectángulo o como nada, en silencio. Hay que RASTERIZAR el PDF y mirarlo:
//
//   pdftoppm -png -r 150 -f 1 -l 1 /tmp/tommy-order.pdf /tmp/tommy-order
import { writeFileSync } from "node:fs";
import { buildOrderPdfDoc } from "@/lib/catalogo/order-pdf-core";
import { buildCatalogPdfDoc } from "@/lib/catalogo/catalog-pdf";
import { getBultoSize as tommyBulto } from "@/lib/tommy-bulto";

const items = [
  { sku: "THS10159C000", name: "Women-Sandals Core", quantity: 2, unit_price: 22, image_url: "", category: "sandals" },
  { sku: "THM20411B100", name: "Men-Sneakers Runner", quantity: 1, unit_price: 34, image_url: "", category: "sneakers" },
];

const orderDoc = buildOrderPdfDoc({
  marca: "tommy",
  orderNumber: "TH-TEST-001",
  clientName: "Cliente de Prueba, S.A.",
  createdAt: "2026-08-12",
  items,
  bultoSize: (c, b) => tommyBulto(c ?? null, b),
  images: {},
});
writeFileSync("/tmp/tommy-order.pdf", Buffer.from(orderDoc.output("arraybuffer")));

const catDoc = buildCatalogPdfDoc({
  marca: "tommy",
  // Vacío a propósito: es el caso que dejó la poda de "Todos los productos".
  subtitle: "",
  totalCount: 2,
  sections: [{
    label: "WOMEN",
    items: items.map((i) => ({ sku: i.sku, name: i.name, price: i.unit_price, image_url: null })),
  }],
  images: {},
});
writeFileSync("/tmp/tommy-catalog.pdf", Buffer.from(catDoc.output("arraybuffer")));
console.log("PDFs escritos: /tmp/tommy-order.pdf /tmp/tommy-catalog.pdf");
