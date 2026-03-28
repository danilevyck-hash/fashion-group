import { RItem, Reclamo } from "./types";
import { fmt, fmtDate } from "@/lib/format";

export const EMPRESAS_MAP: Record<string, { proveedor: string; marca: string }> = {
  "Vistana International": { proveedor: "American Designer Fashion", marca: "Calvin Klein" },
  "Fashion Wear": { proveedor: "American Fashion Wear", marca: "Tommy Hilfiger" },
  "Fashion Shoes": { proveedor: "American Fashion Wear", marca: "Tommy Hilfiger" },
  "Active Shoes": { proveedor: "Latin Fitness Group", marca: "Reebok" },
  "Active Wear": { proveedor: "Latin Fitness Group", marca: "Reebok" },
};

export const EMPRESAS = Object.keys(EMPRESAS_MAP);

export const DEFAULT_MOTIVOS = [
  "Mercancía defectuosa",
  "Talla incorrecta",
  "Cantidad incorrecta",
  "Producto no recibido",
  "Daño en transporte",
  "Error de facturación",
];

export const TALLAS = ["XS", "S", "M", "L", "XL", "XXL", "OS", "Otros"];

export const ESTADOS = ["Borrador", "Enviado", "En revisión", "Resuelto con NC", "Rechazado"];

export const EC: Record<string, string> = {
  "Borrador": "bg-gray-100 text-gray-600",
  "Enviado": "bg-blue-50 text-blue-700",
  "En revisión": "bg-yellow-50 text-yellow-700",
  "Resuelto con NC": "bg-green-50 text-green-700",
  "Rechazado": "bg-red-50 text-red-600",
};

export function loadCustomMotivos(): string[] {
  try { return JSON.parse(localStorage.getItem("fg_custom_motivos") || "[]"); } catch { return []; }
}

export function saveCustomMotivo(m: string) {
  const cur = loadCustomMotivos();
  if (!cur.includes(m)) { cur.push(m); localStorage.setItem("fg_custom_motivos", JSON.stringify(cur)); }
}

export function emptyItem(): RItem {
  return { referencia: "", descripcion: "", talla: "", cantidad: 1, precio_unitario: 0, subtotal: 0, motivo: "", nro_factura: "", nro_orden_compra: "" };
}

export function daysSince(d: string) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

export function calcSub(items: RItem[]) {
  return items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0);
}

export function buildReclamosPdfHtml(reclamosArr: Reclamo[], titulo: string) {
  const rows = reclamosArr.map((r) => {
    const items = r.reclamo_items || [];
    const sub = calcSub(items);
    const total = sub * 1.177;
    const itemsDesc = items.map((i) => `${i.descripcion || "Item"} x ${Number(i.cantidad) || 0}`).join(", ");
    return `<tr><td>${r.nro_reclamo}</td><td>${fmtDate(r.fecha_reclamo)}</td><td>${r.nro_factura || ""}</td><td><span class="badge ${r.estado === "Resuelto con NC" ? "badge-green" : r.estado === "Rechazado" ? "badge-red" : "badge-blue"}">${r.estado}</span></td><td>${itemsDesc}</td><td class="right">$${fmt(total)}</td></tr>`;
  }).join("");
  const grandTotal = reclamosArr.reduce((s, r) => s + calcSub(r.reclamo_items ?? []) * 1.177, 0);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title><style>
    @media print { @page { margin: 15mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; }
    .header { background: #1b3a5c; color: white; padding: 16px 24px; text-align: center; margin-bottom: 8px; }
    .header h1 { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
    .header p { font-size: 11px; opacity: 0.85; }
    .date-line { text-align: center; color: #888; font-size: 10px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #1b3a5c; color: white; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; font-weight: 600; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
    tr:nth-child(even) { background: #f8f9f9; }
    .right { text-align: right; }
    .total-row { font-weight: 700; background: #e8e8e8 !important; }
    .badge { padding: 2px 8px; border-radius: 9px; font-size: 10px; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .footer { display: flex; justify-content: space-between; color: #999; font-size: 9px; margin-top: 24px; padding-top: 8px; border-top: 1px solid #eee; }
  </style></head><body>
  <div class="header"><h1>FASHION GROUP</h1><p>Reclamos — ${titulo}</p></div>
  <div class="date-line">Exportado el ${new Date().toLocaleDateString("es-HN")}</div>
  <table><thead><tr><th>N° Reclamo</th><th>Fecha</th><th>Factura</th><th>Estado</th><th>Items</th><th class="right">Total</th></tr></thead>
  <tbody>${rows}<tr class="total-row"><td colspan="5" class="right">TOTAL</td><td class="right">$${fmt(grandTotal)}</td></tr></tbody></table>
  <div class="footer"><span>Generado el ${new Date().toLocaleDateString("es-HN")}</span></div>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;
}

export function buildSingleReclamoPdfHtml(r: Reclamo) {
  const items = r.reclamo_items || [];
  const sub = calcSub(items);
  const itemRows = items.map((i) => `<tr><td>${i.referencia || ""}</td><td>${i.descripcion || ""}</td><td>${i.talla || ""}</td><td class="right">${Number(i.cantidad) || 0}</td><td class="right">$${fmt(i.precio_unitario)}</td><td class="right">$${fmt((Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0))}</td><td>${i.motivo || ""}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reclamo ${r.nro_reclamo}</title><style>
    @media print { @page { margin: 15mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; }
    .header { background: #1b3a5c; color: white; padding: 16px 24px; text-align: center; margin-bottom: 8px; }
    .header h1 { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
    .header p { font-size: 11px; opacity: 0.85; }
    .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 16px 0; padding: 12px; background: #f8f9f9; border-radius: 8px; }
    .meta-item { font-size: 11px; }
    .meta-label { font-size: 9px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: #1b3a5c; color: white; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; font-weight: 600; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
    tr:nth-child(even) { background: #f8f9f9; }
    .right { text-align: right; }
    .totals { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin: 16px 0; }
    .total-box { border: 1px solid #eee; border-radius: 8px; padding: 10px; text-align: center; }
    .total-box.dark { background: #1b3a5c; color: white; }
    .total-label { font-size: 9px; text-transform: uppercase; color: #888; }
    .total-box.dark .total-label { color: #aaa; }
    .total-val { font-size: 16px; font-weight: 600; margin-top: 4px; }
    .footer { color: #999; font-size: 9px; margin-top: 24px; padding-top: 8px; border-top: 1px solid #eee; }
  </style></head><body>
  <div class="header"><h1>FASHION GROUP</h1><p>Reclamo ${r.nro_reclamo} — ${r.empresa}</p></div>
  <div class="meta">
    <div class="meta-item"><div class="meta-label">Empresa</div>${r.empresa}</div>
    <div class="meta-item"><div class="meta-label">Proveedor</div>${r.proveedor}</div>
    <div class="meta-item"><div class="meta-label">Marca</div>${r.marca}</div>
    <div class="meta-item"><div class="meta-label">Factura</div>${r.nro_factura || "—"}</div>
    <div class="meta-item"><div class="meta-label">Orden de Compra</div>${r.nro_orden_compra || "—"}</div>
    <div class="meta-item"><div class="meta-label">Fecha / Estado</div>${fmtDate(r.fecha_reclamo)} — ${r.estado}</div>
  </div>
  <div class="totals">
    <div class="total-box"><div class="total-label">Subtotal</div><div class="total-val">$${fmt(sub)}</div></div>
    <div class="total-box"><div class="total-label">Import. 10%</div><div class="total-val">$${fmt(sub * 0.10)}</div></div>
    <div class="total-box"><div class="total-label">ITBMS</div><div class="total-val">$${fmt(sub * 0.077)}</div></div>
    <div class="total-box dark"><div class="total-label">Total</div><div class="total-val">$${fmt(sub * 1.177)}</div></div>
  </div>
  <table><thead><tr><th>Código</th><th>Descripción</th><th>Talla</th><th class="right">Cant.</th><th class="right">Precio U.</th><th class="right">Subtotal</th><th>Motivo</th></tr></thead><tbody>${itemRows}</tbody></table>
  ${r.notas ? `<p style="margin-top:12px;color:#666;">Notas: ${r.notas}</p>` : ""}
  <div class="footer">Generado el ${new Date().toLocaleDateString("es-HN")}</div>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;
}

export function openPdfWindow(html: string) {
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}
