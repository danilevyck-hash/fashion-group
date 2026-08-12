// Verificación LOCAL del logo oficial de Calvin en los dos PDFs (pedido +
// catálogo) con datos dummy — la DDL de las tablas calvin_* sigue pendiente,
// así que se llama al generador directo en vez de a un pedido real.
//
//   npx tsx scripts/_verif-calvin-logo-pdf.ts
import { writeFileSync } from "node:fs";
import { buildOrderPdfDoc } from "@/lib/catalogo/order-pdf-core";
import { buildCatalogPdfDoc } from "@/lib/catalogo/catalog-pdf";
import { getBultoSize as calvinBulto } from "@/lib/calvin-bulto";

const items = [
  { sku: "CKM-001", name: "Sneaker Runner CK", quantity: 2, unit_price: 35, image_url: "", category: "footwear" },
  { sku: "CKW-014", name: "Sandalia Monogram", quantity: 1, unit_price: 28, image_url: "", category: "footwear" },
];

const orderDoc = buildOrderPdfDoc({
  marca: "calvin",
  orderNumber: "CK-TEST-001",
  clientName: "Cliente de Prueba, S.A.",
  createdAt: "2026-08-12",
  items,
  bultoSize: (c, b) => calvinBulto(c ?? null, b),
  images: {},
});
writeFileSync("/tmp/calvin-order.pdf", Buffer.from(orderDoc.output("arraybuffer")));

const catDoc = buildCatalogPdfDoc({
  marca: "calvin",
  subtitle: "Todos los productos",
  totalCount: 2,
  sections: [{
    label: "HOMBRE",
    items: items.map((i) => ({ sku: i.sku, name: i.name, price: i.unit_price, image_url: null })),
  }],
  images: {},
});
writeFileSync("/tmp/calvin-catalog.pdf", Buffer.from(catDoc.output("arraybuffer")));
console.log("PDFs escritos: /tmp/calvin-order.pdf /tmp/calvin-catalog.pdf");
