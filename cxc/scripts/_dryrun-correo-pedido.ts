// Renderiza a disco el correo de pedido de catálogo SIN MANDAR NADA por Resend.
// Genera, para las 3 marcas, las dos versiones que produce `send-order`:
//   <marca>-equipo.html   → lo que ve Fashion Group (botón "Confirmar pedido")
//   <marca>-cliente.html  → lo que ve el mayorista ("Enviar por email al cliente")
//
//   npx tsx --tsconfig ./tsconfig.json scripts/_dryrun-correo-pedido.ts [carpeta]
//
// Abrir los archivos en el navegador a 375 px y a 320 px de ancho: el correo
// tiene que caber sin scroll horizontal (la columna Subtotal es la que se
// cortaba antes del PR #310).

import fs from "node:fs";
import path from "node:path";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { buildOrderEmailHtml, escapeHtml, type OrderEmailItem } from "@/lib/catalogo/order-email";

const OUT = process.argv[2] || path.join(process.env.HOME || ".", "Desktop", "fg-correo-cliente");

// Pedido de muestra: nombres largos, precio con medio dólar y comillas en un
// nombre (el caso que rompía el alt="…"), para que el render sea representativo.
const ITEMS_BASE: OrderEmailItem[] = [
  { sku: "FM0FM05436BDS", name: 'Camisa Oxford Manga Larga "Classic Fit"', quantity: 4, unit_price: 17.5, image_url: "", category: "apparel" },
  { sku: "FM0FM05900BDS", name: "Pantalon Chino Slim Denton Azul Marino", quantity: 2, unit_price: 19.5, image_url: "", category: "apparel" },
  { sku: "GY9748", name: "Club C 85 Vintage", quantity: 6, unit_price: 35, image_url: "", category: "footwear" },
  { sku: "UKTRK.MPS", name: "Modern Clog Adulto Negro", quantity: 3, unit_price: 16.5, image_url: "", category: "footwear" },
];

const PREORDEN: OrderEmailItem = {
  sku: "100074281", name: "Nano X4 Training (Pre-orden)", quantity: 5,
  unit_price: 48, image_url: "", is_preorder: true, category: "footwear",
};

const CLIENTE = "Comercial El Machetazo, S.A.";
const FECHA = "26 de julio de 2026";

function render(marcaKey: string) {
  const cfg = MARCAS_CONFIG[marcaKey];
  const orderNumber = `${cfg.numeroPrefijo}-0421`;
  // Reebok es la única marca con pre-orden: se incluye para ver esa sección.
  const items = cfg.itemsHasPreorder ? [...ITEMS_BASE, PREORDEN] : ITEMS_BASE;

  const totalBultos = items.reduce((s, i) => s + i.quantity, 0);
  const totalPiezas = items.reduce((s, i) => s + i.quantity * cfg.bultoSize(i.category), 0);
  const total = items.reduce((s, i) => s + i.quantity * cfg.bultoSize(i.category) * i.unit_price, 0);

  const comun = {
    marcaLabel: cfg.label,
    tableHeadBg: cfg.sendOrder.tableHeadBg,
    itemsHasPreorder: cfg.itemsHasPreorder,
    items,
    bultoSize: cfg.bultoSize,
    comment: "Entregar en bodega de Vía España. Preguntar por Marisol.",
    totalBultos,
    totalPiezas,
    total,
  };

  const equipo = buildOrderEmailHtml({
    ...comun,
    audiencia: "equipo",
    headerHtml: cfg.sendOrder.headerHtml(escapeHtml(orderNumber), escapeHtml(CLIENTE), escapeHtml(FECHA)),
  });
  const cliente = buildOrderEmailHtml({
    ...comun,
    audiencia: "cliente",
    clientName: CLIENTE,
    headerHtml: cfg.sendOrder.headerClienteHtml(escapeHtml(orderNumber), escapeHtml(FECHA)),
  });

  return { equipo, cliente, total };
}

fs.mkdirSync(OUT, { recursive: true });
for (const marca of Object.keys(MARCAS_CONFIG)) {
  const { equipo, cliente, total } = render(marca);
  fs.writeFileSync(path.join(OUT, `${marca}-equipo.html`), equipo);
  fs.writeFileSync(path.join(OUT, `${marca}-cliente.html`), cliente);
  console.log(`${marca.padEnd(8)} total $${total.toFixed(2)}  →  ${marca}-equipo.html + ${marca}-cliente.html`);
}
console.log(`\nListo. Carpeta: ${OUT}`);
console.log("NO se envió ningún correo.");
