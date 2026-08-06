// ─────────────────────────────────────────────────────────────────────────────
// HTML del correo de pedido de catálogo (Reebok / Joybees / Tommy).
//
// Extraído del route `api/catalogo/[marca]/send-order` para poder RENDERIZARLO
// y medirlo sin mandar correos. Es puro: entra la config de marca + los items,
// sale el HTML exacto que va por Resend.
//
// Decisiones que valen la pena recordar (auditoría 26-jul-2026, se generó y se
// miró el correo en 375 px y en 320 px):
//   - Documento HTML COMPLETO con `<meta viewport>` y una media query: sin eso
//     el correo medía 524 px de ancho dentro de una pantalla de 375 y la columna
//     Subtotal quedaba cortada. La mayoría lo lee en el teléfono.
//   - Padding y tipografía apretados en la tabla → el ancho mínimo baja lo
//     suficiente para caber en un iPhone sin scroll horizontal.
//   - Nada de `display:flex` (Outlook y Gmail lo ignoran): el rótulo de sección
//     va como bloque con un `<span>` inline-block al lado.
//   - Todo lo que viene de la base (nombre, SKU, nota, URL de la foto) se
//     escapa: un producto con comillas en el nombre rompía el `alt="…"`.
//
// DOS AUDIENCIAS, UNA SOLA MAQUETA (26-jul-2026). El route `send-order` tiene
// dos botones que le pegan: "Confirmar pedido" (sin clientEmail → avisa al
// equipo) y "Enviar por email al cliente" (con clientEmail → le llega AL
// CLIENTE). Hasta hoy los dos mandaban el MISMO texto, escrito para adentro:
// el cliente recibía "Estimado equipo Fashion Group" y la instrucción de "no
// mezclar en bodega". `audiencia` cambia SOLO los párrafos de texto (saludo,
// nota de pre-orden, cierre y pie); la tabla, el CSS y las media queries son
// exactamente los mismos objetos para las dos — así el arreglo de ancho de
// 375 px del PR #310 no se puede romper en una sola de las dos versiones.
// ─────────────────────────────────────────────────────────────────────────────

import { precioTexto } from "@/lib/catalogo/precio";
import { resolverLineas } from "./lineas-pedido";

export interface OrderEmailItem {
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  image_url: string;
  is_preorder?: boolean;
  category?: string;
  /** Tommy: piezas por bulto del estilo. Vacío = el default de la marca. */
  bulto_pzas?: number | null;
}

/** Quién va a leer el correo. Decide los textos, no la maqueta. */
export type OrderEmailAudiencia = "equipo" | "cliente";

export interface OrderEmailOpts {
  /** "equipo" (aviso interno, default histórico) o "cliente" (confirmación
   *  que le llega al mayorista). */
  audiencia?: OrderEmailAudiencia;
  /** Nombre de la marca tal cual va en el texto ("Reebok", "Joybees", …). */
  marcaLabel: string;
  /** Nombre del cliente — solo se usa para saludarlo en el correo a cliente. */
  clientName?: string;
  /** Cabecera de marca (banda con logo) — viene de cfg.sendOrder.headerHtml
   *  o de cfg.sendOrder.headerClienteHtml según la audiencia. */
  headerHtml: string;
  /** Color de fondo del encabezado de la tabla — cfg.sendOrder.tableHeadBg. */
  tableHeadBg: string;
  /** La marca maneja pre-orden (solo Reebok). */
  itemsHasPreorder: boolean;
  items: OrderEmailItem[];
  bultoSize: (category?: string | null, bultoPzas?: number | null) => number;
  comment: string | null;
  totalBultos: number;
  totalPiezas: number;
  total: number;
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Precio como en la vitrina: `35`, `12.50`, `4,422`. Sin `.00`, sin redondeo.
const fmt = precioTexto;

const CELL = "padding:6px 4px;vertical-align:middle";

export function buildOrderEmailHtml(opts: OrderEmailOpts): string {
  const {
    audiencia = "equipo", marcaLabel, clientName = "", headerHtml, tableHeadBg,
    itemsHasPreorder, items, bultoSize, comment, totalBultos, totalPiezas, total,
  } = opts;
  const esCliente = audiencia === "cliente";

  const regularItems = items.filter((i) => !i.is_preorder);
  const preorderItems = items.filter((i) => i.is_preorder);
  const hasPreorders = itemsHasPreorder && preorderItems.length > 0;

  const renderRow = (item: OrderEmailItem) => {
    // Línea resuelta: piezas y subtotal ya vienen calculados (lineas-pedido.ts).
    const l = resolverLineas([item], { bultoSize })[0];
    const foto = item.image_url
      ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" width="40" height="40" class="fg-foto" style="display:block;width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #eee">`
      : `<div class="fg-foto" style="display:block;width:40px;height:40px;background:#e5e7eb;border-radius:4px"></div>`;
    return `<tr style="border-bottom:1px solid #eee">
      <td style="${CELL};width:44px">${foto}</td>
      <td style="${CELL};overflow-wrap:break-word"><strong>${escapeHtml(item.name)}</strong><br><span style="font-size:11px;color:#888">${escapeHtml(item.sku)}</span></td>
      <td style="${CELL};text-align:center">${item.quantity}</td>
      <td style="${CELL};text-align:center">${l.piezas}</td>
      <td style="${CELL};text-align:right;white-space:nowrap">$${fmt(item.unit_price)}</td>
      <td style="${CELL};text-align:right;white-space:nowrap">$${fmt(l.subtotal)}</td>
    </tr>`;
  };

  const tableHead = `<thead><tr style="background:${tableHeadBg};color:white">
        <th style="padding:6px 4px;width:44px"></th>
        <th style="padding:6px 4px;text-align:left">Producto</th>
        <th style="padding:6px 4px;text-align:center">Bultos</th><th style="padding:6px 4px;text-align:center">Piezas</th>
        <th style="padding:6px 4px;text-align:right">Precio/u</th><th style="padding:6px 4px;text-align:right">Subtotal</th>
      </tr></thead>`;

  const tabla = (rows: string) =>
    `<table class="fg-items" style="width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:13px">
      ${tableHead}
      <tbody>${rows}</tbody>
    </table>`;

  const renderSection = (title: string, sectionItems: OrderEmailItem[], accent: string) =>
    sectionItems.length === 0 ? "" : `
    <div style="margin:16px 0 4px">
      <span style="display:inline-block;background:${accent};color:white;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:4px;letter-spacing:0.5px;text-transform:uppercase">${escapeHtml(title)}</span>
      <span style="display:inline-block;font-size:12px;color:#666;padding-left:8px">${sectionItems.length} ${sectionItems.length !== 1 ? "artículos" : "artículo"}</span>
    </div>
    ${tabla(sectionItems.map(renderRow).join(""))}`;

  const sectionsHtml = itemsHasPreorder
    ? hasPreorders
      ? `${renderSection("Pedido", regularItems, tableHeadBg)}${renderSection("Pre-orden", preorderItems, "#d97706")}`
      : `${renderSection("Detalle", regularItems, tableHeadBg)}`
    : tabla(items.map(renderRow).join(""));

  // ── Textos por audiencia ──────────────────────────────────────────────────
  // Al CLIENTE: se le agradece, se le confirma qué pidió y por cuánto, y se le
  // dice qué pasa ahora. Cero jerga interna, cero instrucciones de bodega.
  // Español simple de Panamá (tuteo), cálido pero corto: es un mayorista.
  const saludoCliente = clientName
    ? `Hola <strong>${escapeHtml(clientName)}</strong>,<br>`
    : "";

  const introHtml = esCliente
    ? `<p style="color:#333;font-size:14px;line-height:1.5;margin:0 0 16px">
          ${saludoCliente}Recibimos tu pedido del catálogo ${escapeHtml(marcaLabel)}. Este es el detalle — también te lo adjuntamos en PDF.
        </p>`
    : `<p style="color:#333;font-size:14px;line-height:1.5;margin:0 0 16px">
          Estimado equipo Fashion Group,<br>
          Se ha recibido un nuevo pedido del catálogo ${escapeHtml(marcaLabel)}. A continuación el detalle:
        </p>`;

  const preordenHtml = !hasPreorders
    ? ""
    : esCliente
      ? `<p style="background:#fef3c7;border-left:3px solid #d97706;padding:10px 14px;color:#92400e;font-size:12px;margin:8px 0 16px">Los artículos marcados como <strong>Pre-orden</strong> todavía no están en stock. Te avisamos apenas lleguen.</p>`
      : `<p style="background:#fef3c7;border-left:3px solid #d97706;padding:10px 14px;color:#92400e;font-size:12px;margin:8px 0 16px">Los artículos en <strong>Pre-orden</strong> aún no tienen stock disponible. No deben mezclarse con el pedido regular en bodega.</p>`;

  const queSigueHtml = esCliente
    ? `<p style="color:#333;font-size:13px;line-height:1.6;margin:16px 0 0">
          <strong>¿Qué sigue?</strong><br>
          Un vendedor de Fashion Group te contacta para confirmar la disponibilidad y coordinar el pago y la entrega.
          Si algo no está bien, responde este correo y lo corregimos.
        </p>`
    : "";

  const pieHtml = esCliente
    ? `<p style="color:#999;font-size:11px;margin:16px 0 0;border-top:1px solid #eee;padding-top:12px">
          Fashion Group · Panamá · pedidos@fashiongr.com
        </p>`
    : `<p style="color:#999;font-size:11px;margin:16px 0 0;border-top:1px solid #eee;padding-top:12px">
          Este pedido fue generado automáticamente desde fashiongr.com
        </p>`;

  const body = `
    <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto">
      ${headerHtml}
      <div class="fg-pad" style="padding:20px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
        ${introHtml}
        ${comment ? `<p style="color:#666;font-size:13px;margin:0 0 12px"><strong>Nota:</strong> ${escapeHtml(comment)}</p>` : ""}
        ${sectionsHtml}
        ${preordenHtml}
        <div style="background:#f5f5f5;padding:12px 16px;border-radius:6px;margin:16px 0">
          <strong style="font-size:14px">Total: ${totalBultos} bultos (${totalPiezas} piezas) — $${fmt(total)}</strong>
        </div>
        ${queSigueHtml}
        ${pieHtml}
      </div>
    </div>`;

  // Documento completo: `viewport` + media query = el correo cabe en el teléfono.
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @media only screen and (max-width:480px) {
    .fg-items { font-size:12px !important }
    .fg-items th, .fg-items td { padding:5px 2px !important }
  }
  /* iPhone SE / pantallas de 320 px */
  @media only screen and (max-width:360px) {
    .fg-items { font-size:11px !important }
    .fg-items th, .fg-items td { padding:4px 1px !important }
    .fg-foto { width:32px !important;height:32px !important }
    .fg-pad { padding:12px !important }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff">${body}</body></html>`;
}
