import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const P = 12;

function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

  let clientName: string;
  let orderNumber: string;
  let items: { sku: string; name: string; quantity: number; unit_price: number; image_url: string }[];
  let totalBultos: number;
  let totalPiezas: number;
  let total: number;
  let comment: string | null = null;
  let createdAt: string = new Date().toISOString();

  if (body.orderId) {
    const { data: order, error } = await reebokServer
      .from("reebok_orders")
      .select("*, reebok_order_items(*)")
      .eq("id", body.orderId)
      .single();
    if (error || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    clientName = order.client_name;
    orderNumber = order.order_number;
    comment = order.comment;
    createdAt = order.created_at;
    items = (order.reebok_order_items || []).map((i: { sku: string; name: string; quantity: number; unit_price: number; image_url?: string }) => ({
      sku: i.sku || "", name: i.name || "", quantity: i.quantity, unit_price: i.unit_price, image_url: i.image_url || "",
    }));
    totalBultos = items.reduce((s, i) => s + i.quantity, 0);
    totalPiezas = totalBultos * P;
    total = items.reduce((s, i) => s + i.quantity * P * Number(i.unit_price), 0);
  } else {
    clientName = body.clientName || "Sin nombre";
    orderNumber = "PEDIDO";
    items = (body.items || []).map((i: { productId: string; productName: string; quantity: number; price: number; image_url?: string }) => ({
      sku: i.productId?.substring(0, 12) || "", name: i.productName || "", quantity: i.quantity, unit_price: i.price || 0, image_url: "",
    }));
    totalBultos = body.totalBultos || 0;
    totalPiezas = body.totalPiezas || 0;
    total = body.total || 0;
  }

  // ── Generate PDF attachment ──
  const doc = new jsPDF("portrait");

  doc.setFillColor(26, 26, 26);
  doc.rect(0, 0, 210, 18, "F");
  doc.setFontSize(12); doc.setTextColor(255); doc.setFont("helvetica", "bold");
  doc.text("REEBOK", 14, 12);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text("Fashion Group · Panama", 196, 12, { align: "right" });

  doc.setTextColor(100); doc.setFontSize(9);
  doc.text(`Cliente: ${clientName}`, 14, 26);
  doc.text(`Pedido: ${orderNumber}`, 90, 26);
  doc.text(`Fecha: ${new Date(createdAt).toLocaleDateString("es-PA")}`, 150, 26);

  autoTable(doc, {
    startY: 32,
    head: [["Producto", "SKU", "Bultos", "Piezas", "Precio/u", "Subtotal"]],
    body: items.map(i => [i.name, i.sku, String(i.quantity), String(i.quantity * P), `$${fmt(i.unit_price)}`, `$${fmt(i.quantity * P * Number(i.unit_price))}`]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [26, 26, 26], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [249, 249, 249] },
    columnStyles: { 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fy = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(10); doc.setTextColor(26); doc.setFont("helvetica", "bold");
  doc.text(`${totalBultos} bultos · ${totalPiezas} piezas`, 14, fy);
  doc.text(`$${fmt(total)}`, 196, fy, { align: "right" });
  doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "normal");
  doc.text("Fashion Group Panama · Reebok Authorized Distributor", 14, fy + 10);

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  const pdfFilename = `${orderNumber}-${clientName.replace(/\s+/g, "-")}.pdf`;

  // ── Build HTML email ──
  const rows = items.map((item) =>
    `<tr style="border-bottom:1px solid #eee">
      <td style="padding:8px;vertical-align:middle"><strong>${item.name}</strong><br><span style="font-size:11px;color:#888">${item.sku}</span></td>
      <td style="padding:8px;text-align:center;vertical-align:middle">${item.quantity}</td>
      <td style="padding:8px;text-align:center;vertical-align:middle">${item.quantity * P}</td>
      <td style="padding:8px;text-align:right;vertical-align:middle">$${fmt(item.unit_price)}</td>
      <td style="padding:8px;text-align:right;vertical-align:middle">$${fmt(item.quantity * P * Number(item.unit_price))}</td>
    </tr>`
  ).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto">
      <div style="background:#1a1a1a;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">Pedido ${orderNumber} — ${clientName}</h2>
        <p style="margin:4px 0 0;font-size:12px;opacity:0.7">${new Date(createdAt).toLocaleDateString("es-PA")}</p>
      </div>
      <div style="padding:20px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
        <p style="color:#333;font-size:14px;line-height:1.5;margin:0 0 16px">
          Estimado equipo Fashion Group,<br>
          Se ha recibido un nuevo pedido del catalogo Reebok. A continuacion el detalle:
        </p>
        ${comment ? `<p style="color:#666;font-size:13px;margin:0 0 12px"><strong>Nota:</strong> ${comment}</p>` : ""}
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead><tr style="background:#1a1a1a;color:white">
            <th style="padding:8px;text-align:left">Producto</th>
            <th style="padding:8px;text-align:center">Bultos</th><th style="padding:8px;text-align:center">Piezas</th>
            <th style="padding:8px;text-align:right">Precio/u</th><th style="padding:8px;text-align:right">Subtotal</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="background:#f5f5f5;padding:12px 16px;border-radius:6px;margin:16px 0">
          <strong style="font-size:14px">Total: ${totalBultos} bultos (${totalPiezas} piezas) — $${fmt(total)}</strong>
        </div>
        <p style="color:#999;font-size:11px;margin:16px 0 0;border-top:1px solid #eee;padding-top:12px">
          Este pedido fue generado automaticamente desde fashiongr.com
        </p>
      </div>
    </div>`;

  const to = body.clientEmail ? [body.clientEmail] : ["daniel@fashiongr.com"];

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: "Reebok Panama <pedidos@fashiongr.com>",
        to,
        subject: `Nuevo pedido ${orderNumber} — ${clientName} — $${fmt(total)}`,
        html,
        attachments: [{ filename: pdfFilename, content: pdfBuffer.toString("base64") }],
      }),
    });
    if (!res.ok) { const err = await res.json(); return NextResponse.json({ error: err.message }, { status: 500 }); }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err); return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
