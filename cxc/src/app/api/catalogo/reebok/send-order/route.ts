import { NextRequest, NextResponse } from "next/server";

interface OrderItem {
  productName: string;
  productId: string;
  quantity: number;
  piezas: number;
  price: number | null;
  subtotal: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { clientName, clientEmail, items, totalBultos, totalPiezas, total } = body as {
    clientName: string;
    clientEmail?: string;
    items: OrderItem[];
    totalBultos: number;
    totalPiezas: number;
    total: number;
  };

  if (!clientName || !items?.length) {
    return NextResponse.json({ error: "Nombre del cliente y items requeridos" }, { status: 400 });
  }

  // Build email HTML
  const rows = items.map((item, i) =>
    `<tr style="border-bottom:1px solid #eee">
      <td style="padding:8px">${i + 1}</td>
      <td style="padding:8px">${item.productId.substring(0, 12)}</td>
      <td style="padding:8px">${item.productName}</td>
      <td style="padding:8px;text-align:center">${item.quantity}</td>
      <td style="padding:8px;text-align:center">${item.piezas}</td>
      <td style="padding:8px;text-align:right">${item.price ? `$${item.price.toFixed(2)}` : '-'}</td>
      <td style="padding:8px;text-align:right">${item.subtotal ? `$${item.subtotal.toFixed(2)}` : '-'}</td>
    </tr>`
  ).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <div style="background:#1a1a1a;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">Nuevo Pedido Reebok</h2>
      </div>
      <div style="padding:20px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
        <p><strong>Cliente:</strong> ${clientName}</p>
        ${clientEmail ? `<p><strong>Email:</strong> ${clientEmail}</p>` : ""}
        <p><strong>Fecha:</strong> ${new Date().toLocaleDateString("es-PA")}</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead>
            <tr style="background:#CC0000;color:white">
              <th style="padding:8px;text-align:left">#</th>
              <th style="padding:8px;text-align:left">SKU</th>
              <th style="padding:8px;text-align:left">Producto</th>
              <th style="padding:8px;text-align:center">Bultos</th>
              <th style="padding:8px;text-align:center">Piezas</th>
              <th style="padding:8px;text-align:right">Precio/u</th>
              <th style="padding:8px;text-align:right">Subtotal</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div style="background:#f5f5f5;padding:12px 16px;border-radius:6px;margin-top:16px">
          <strong>Total: ${totalBultos} bultos (${totalPiezas} piezas) — $${total.toFixed(2)}</strong>
        </div>
      </div>
    </div>
  `;

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const to = ["daniel@fashiongr.com", "respinosa1721@gmail.com"];
  if (clientEmail) to.push(clientEmail);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: "Reebok Panama <pedidos@fashiongr.com>",
        to,
        subject: `Nuevo Pedido Reebok — ${clientName}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err.message || "Error sending email" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
