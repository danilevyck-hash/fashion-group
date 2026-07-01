import { RItem, Reclamo } from "./types";
import { fmt, fmtDate } from "@/lib/format";
import { reclamoTaxes, esActiveShoes, impLabel } from "@/lib/reclamos/tax";

// Fuente única del cálculo fiscal: src/lib/reclamos/tax.ts. Se re-exporta aquí para
// no romper imports existentes. Active Shoes = importación 15% sin ITBMS; resto igual.
export { TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL, reclamoTaxes, esActiveShoes, ocultaPedido, impLabel } from "@/lib/reclamos/tax";

export const EMPRESAS_MAP: Record<string, { proveedor: string; marca: string }> = {
  "Vistana International": { proveedor: "American Designer Fashion", marca: "Calvin Klein" },
  "Fashion Wear": { proveedor: "American Fashion Wear", marca: "Tommy Hilfiger" },
  "Fashion Shoes": { proveedor: "American Fashion Wear", marca: "Tommy Hilfiger" },
  "Active Shoes": { proveedor: "Latin Fitness Group", marca: "Reebok" },
  "Active Wear": { proveedor: "Latin Fitness Group", marca: "Reebok" },
};

export const EMPRESAS = Object.keys(EMPRESAS_MAP);

/** Mapea proveedor/marca extraídos por IA a la "empresa" del reclamo (que
 *  determina proveedor+marca al guardar). Match por marca+proveedor; si la marca
 *  es ambigua (Tommy→FW/FS, Reebok→AS/AW) gana el primer match — el usuario
 *  puede corregir. Devuelve null si no hay match. */
export function empresaDesdeIA(
  proveedor: string | null | undefined,
  marca: string | null | undefined,
): string | null {
  const m = (marca || "").toLowerCase().trim();
  const p = (proveedor || "").toLowerCase().trim();
  if (!m && !p) return null;
  // 1) match por marca + proveedor.
  for (const [empresa, info] of Object.entries(EMPRESAS_MAP)) {
    const im = info.marca.toLowerCase();
    const ip = info.proveedor.toLowerCase();
    if (m && im === m && p && ip === p) return empresa;
  }
  // 2) match por marca sola.
  for (const [empresa, info] of Object.entries(EMPRESAS_MAP)) {
    if (m && info.marca.toLowerCase() === m) return empresa;
  }
  // 3) match por proveedor solo.
  for (const [empresa, info] of Object.entries(EMPRESAS_MAP)) {
    if (p && info.proveedor.toLowerCase() === p) return empresa;
  }
  return null;
}

export const DEFAULT_MOTIVOS = [
  "Mercancía defectuosa",
  "Producto no recibido",
  "Error de facturación",
  "Sobrante de mercancía",
  "Faltante de mercancía",
  "Mercancía manchada",
];

export const TALLAS = ["XS", "S", "M", "L", "XL", "XXL", "OS", "Otros"];

/** Género del ítem reclamado — dropdown FIJO (sin opción libre). Obligatorio. */
export const GENEROS = ["Men", "Women", "Kids", "Accessories"] as const;

export const ESTADOS = ["Creado", "En proceso", "Pagado"];

/** Display-friendly names for estados (use in buttons/labels) */
export const ESTADO_DISPLAY: Record<string, string> = {};

/** Get display name for an estado, falls back to the estado itself */
export function estadoLabel(estado: string): string {
  return ESTADO_DISPLAY[estado] || estado;
}

export const EC: Record<string, string> = {
  "Creado": "bg-gray-100 text-gray-600",
  "En proceso": "bg-amber-50 text-amber-700",
  "Pagado": "bg-green-50 text-green-700",
};

/** Load custom motivos — tries API first, falls back to localStorage */
export function loadCustomMotivos(): string[] {
  try { return JSON.parse(localStorage.getItem("fg_custom_motivos") || "[]"); } catch { return []; }
}

/** Fetch custom motivos from Supabase. Falls back to localStorage if API fails. */
export async function fetchCustomMotivos(): Promise<string[]> {
  try {
    const res = await fetch("/api/reclamos/motivos");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        // Sync to localStorage as cache
        localStorage.setItem("fg_custom_motivos", JSON.stringify(data));
        return data;
      }
    }
  } catch { /* fall through */ }
  // Fallback: load from localStorage
  return loadCustomMotivos();
}

/** Save a custom motivo — persists to Supabase and localStorage */
export async function saveCustomMotivo(m: string) {
  // Save to localStorage immediately for instant feedback
  const cur = loadCustomMotivos();
  if (!cur.includes(m)) { cur.push(m); localStorage.setItem("fg_custom_motivos", JSON.stringify(cur)); }
  // Persist to Supabase in background
  try {
    await fetch("/api/reclamos/motivos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo: m }),
    });
  } catch { /* localStorage already has it as fallback */ }
}

export function emptyItem(): RItem {
  return { referencia: "", descripcion: "", talla: "", cantidad: 1, precio_unitario: 0, subtotal: 0, motivo: "", genero: "", nro_factura: "", nro_orden_compra: "" };
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
    const total = reclamoTaxes(r.empresa, sub).total;
    const itemsDesc = items.map((i) => `${i.descripcion || "Item"} x ${Number(i.cantidad) || 0}`).join(", ");
    return `<tr><td>${r.nro_reclamo}</td><td>${fmtDate(r.fecha_reclamo)}</td><td>${r.nro_factura || ""}</td><td><span class="badge ${r.estado === "Pagado" ? "badge-green" : "badge-blue"}">${r.estado}</span></td><td>${itemsDesc}</td><td class="right">$${fmt(total)}</td></tr>`;
  }).join("");
  const grandTotal = reclamosArr.reduce((s, r) => s + reclamoTaxes(r.empresa, calcSub(r.reclamo_items ?? [])).total, 0);
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

export function buildSingleReclamoPdfHtml(r: Reclamo, fotos?: { url?: string; storage_path: string }[]) {
  const items = r.reclamo_items || [];
  const sub = calcSub(items);
  const tx = reclamoTaxes(r.empresa, sub);
  const asShoes = esActiveShoes(r.empresa);
  const itemRows = items.map((i) => `<tr><td>${i.referencia || ""}</td><td>${i.descripcion || ""}</td><td>${i.talla || ""}</td><td class="right">${Number(i.cantidad) || 0}</td><td class="right">$${fmt(i.precio_unitario)}</td><td class="right">$${fmt((Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0))}</td><td>${i.motivo || ""}</td></tr>`).join("");
  // Cajas de totales: para Active Shoes sin ITBMS (3 cajas); resto 4.
  const totalBoxes = [
    `<div class="total-box"><div class="total-label">Subtotal</div><div class="total-val">$${fmt(sub)}</div></div>`,
    `<div class="total-box"><div class="total-label">Import. ${impLabel(r.empresa)}</div><div class="total-val">$${fmt(tx.importacion)}</div></div>`,
    ...(tx.hasItbms ? [`<div class="total-box"><div class="total-label">ITBMS</div><div class="total-val">$${fmt(tx.itbms)}</div></div>`] : []),
    `<div class="total-box dark"><div class="total-label">Total</div><div class="total-val">$${fmt(tx.total)}</div></div>`,
  ].join("");
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
    ${asShoes ? "" : `<div class="meta-item"><div class="meta-label">Orden de Compra</div>${r.nro_orden_compra || "—"}</div>`}
    <div class="meta-item"><div class="meta-label">Fecha / Estado</div>${fmtDate(r.fecha_reclamo)} — ${r.estado}</div>
  </div>
  <div class="totals" style="grid-template-columns: repeat(${tx.hasItbms ? 4 : 3}, 1fr);">
    ${totalBoxes}
  </div>
  <table><thead><tr><th>Código</th><th>Descripción</th><th>Talla</th><th class="right">Cant.</th><th class="right">Precio U.</th><th class="right">Subtotal</th><th>Motivo</th></tr></thead><tbody>${itemRows}</tbody></table>
  ${r.notas ? `<p style="margin-top:12px;color:#666;">Notas: ${r.notas}</p>` : ""}
  ${fotos && fotos.length > 0 ? `
  <div style="margin-top:20px;">
    <div style="background:#1b3a5c;color:white;padding:6px 8px;font-size:10px;text-transform:uppercase;font-weight:600;border-radius:4px 4px 0 0;">Evidencia Fotográfica</div>
    <div style="padding:12px;border:1px solid #eee;border-top:none;border-radius:0 0 4px 4px;">
      ${fotos.map(f => {
        const src = f.url || `${typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_SUPABASE_URL || "") : ""}/storage/v1/object/public/reclamo-fotos/${f.storage_path}`;
        return `<img src="${src}" style="max-width:300px;border-radius:8px;margin:8px;display:inline-block;border:1px solid #eee;" />`;
      }).join("")}
    </div>
  </div>` : ""}
  ${(r.reclamo_seguimiento && r.reclamo_seguimiento.length > 0) ? `
  <div style="margin-top:20px;">
    <div style="background:#1b3a5c;color:white;padding:6px 8px;font-size:10px;text-transform:uppercase;font-weight:600;border-radius:4px 4px 0 0;">Seguimiento</div>
    <div style="padding:12px;border:1px solid #eee;border-top:none;border-radius:0 0 4px 4px;">
      ${r.reclamo_seguimiento.map(s => `<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;">
        <div style="font-size:11px;">${s.nota}</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">${new Date(s.created_at).toLocaleString("es-PA")} — ${s.autor || ""}</div>
      </div>`).join("")}
    </div>
  </div>` : ""}
  <div class="footer">Generado el ${new Date().toLocaleDateString("es-HN")}</div>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;
}

export function openPdfWindow(html: string) {
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}
