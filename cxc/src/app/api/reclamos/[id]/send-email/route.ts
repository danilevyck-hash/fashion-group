import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { Resend } from "resend";
import XLSX from "xlsx-js-style";

function getResend() { return new Resend(process.env.RESEND_API_KEY); }

function fmt(n: number) {
  return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = params;

    const { data: rec, error } = await supabaseServer
      .from("reclamos")
      .select("*, reclamo_items(*), reclamo_fotos(*)")
      .eq("id", id)
      .single();

    if (error || !rec) return NextResponse.json({ error: "Reclamo not found" }, { status: 404 });

    const { data: contacto } = await supabaseServer
      .from("reclamo_contactos")
      .select("*")
      .eq("empresa", rec.empresa)
      .single();

    if (!contacto?.correo) return NextResponse.json({ error: "No hay correo configurado para esta empresa." }, { status: 400 });

    // Generate Excel
    const items = (rec.reclamo_items || []) as Record<string, unknown>[];
    const xlRows: unknown[][] = [];
    xlRows.push([`Reclamo ${rec.nro_reclamo} — ${rec.empresa}`]);
    xlRows.push([]);
    xlRows.push(["Proveedor", rec.proveedor]);
    xlRows.push(["Marca", rec.marca]);
    xlRows.push(["Factura", rec.nro_factura]);
    xlRows.push(["Fecha", rec.fecha_reclamo]);
    xlRows.push(["Estado", rec.estado]);
    xlRows.push([]);
    xlRows.push(["Código", "Descripción", "Talla", "Cant.", "Precio Unit.", "Subtotal", "Motivo", "N° Factura", "N° PO"]);

    let subtotal = 0;
    for (const item of items) {
      const cant = Number(item.cantidad) || 0;
      const precio = Number(item.precio_unitario) || 0;
      const sub = cant * precio;
      subtotal += sub;
      xlRows.push([item.referencia, item.descripcion, item.talla, cant, precio, sub, item.motivo, item.nro_factura || "", item.nro_orden_compra || ""]);
    }
    xlRows.push([]);
    xlRows.push([null, null, null, null, "Subtotal", subtotal]);
    xlRows.push([null, null, null, null, "Importación (10%)", subtotal * 0.10]);
    xlRows.push([null, null, null, null, "ITBMS (7%)", subtotal * 0.077]);
    xlRows.push([null, null, null, null, "TOTAL", subtotal * 1.177]);

    const ws = XLSX.utils.aoa_to_sheet(xlRows);
    ws["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reclamo");
    const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Build attachments
    const attachments: { filename: string; content: Buffer; cid?: string }[] = [
      { filename: `${rec.nro_reclamo}-${rec.empresa}.xlsx`, content: Buffer.from(excelBuffer) },
    ];

    // Download and attach fotos in parallel
    const fotos = (rec.reclamo_fotos || []) as { storage_path: string }[];
    const fotoAttachments: { filename: string; content: Buffer; cid: string }[] = [];
    const downloads = await Promise.all(fotos.map(async (foto, i) => {
      try {
        const { data: fileData, error: dlErr } = await supabaseServer.storage.from("reclamo-fotos").download(foto.storage_path);
        if (!dlErr && fileData) {
          const ab = await fileData.arrayBuffer();
          const ext = foto.storage_path.split(".").pop() || "jpg";
          const filename = `evidencia-${i + 1}.${ext}`;
          const cid = `evidencia${i + 1}`;
          return { filename, content: Buffer.from(ab), cid };
        }
      } catch { /* skip */ }
      return null;
    }));
    for (const dl of downloads) {
      if (dl) {
        attachments.push(dl);
        fotoAttachments.push(dl);
      }
    }

    // Build HTML
    const total = subtotal * 1.177;
    const itemRowsHtml = items.map((item) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${esc(item.referencia)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${esc(item.descripcion)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:center">${esc(item.talla)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:center">${Number(item.cantidad) || 0}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right">$${fmt(Number(item.precio_unitario))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right">$${fmt(Number(item.cantidad) * Number(item.precio_unitario))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;color:#666">${esc(item.motivo)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;color:#666">${esc(item.nro_factura)}</td>
      </tr>`).join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1a1a1a">
        <div style="border-bottom:2px solid #000;padding-bottom:16px;margin-bottom:24px">
          <h2 style="margin:0;font-size:18px">Fashion Group</h2>
          <p style="margin:4px 0 0;color:#666;font-size:13px">Reclamo a Proveedor</p>
        </div>
        <p>Estimado/a ${esc(contacto.nombre)},</p>
        <p>Por medio de la presente, le hacemos llegar el detalle del siguiente reclamo pendiente de resolución:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
          <tr><td style="padding:6px 0;color:#666;width:140px">N° Reclamo</td><td style="font-weight:600">${esc(rec.nro_reclamo)}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Empresa</td><td>${esc(rec.empresa)}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Proveedor</td><td>${esc(rec.proveedor)}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Marca</td><td>${esc(rec.marca)}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Factura</td><td>${esc(rec.nro_factura)}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Fecha Reclamo</td><td>${esc(rec.fecha_reclamo)}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Estado</td><td>${esc(rec.estado)}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Total a acreditar</td><td style="font-weight:600">$${fmt(total)}</td></tr>
        </table>
        <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#666;margin:24px 0 8px">Detalle de Ítems</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="border-bottom:2px solid #000">
            <th style="padding:6px 8px;text-align:left">Código</th><th style="padding:6px 8px;text-align:left">Descripción</th><th style="padding:6px 8px;text-align:center">Talla</th><th style="padding:6px 8px;text-align:center">Cant.</th><th style="padding:6px 8px;text-align:right">Precio</th><th style="padding:6px 8px;text-align:right">Subtotal</th><th style="padding:6px 8px;text-align:left">Motivo</th><th style="padding:6px 8px;text-align:left">Factura</th>
          </tr></thead>
          <tbody>${itemRowsHtml}</tbody>
          <tfoot>
            <tr><td colspan="5" style="padding:8px;text-align:right;color:#666;font-size:11px">Subtotal</td><td style="padding:8px;text-align:right">$${fmt(subtotal)}</td><td colspan="2"></td></tr>
            <tr><td colspan="5" style="padding:4px 8px;text-align:right;color:#666;font-size:11px">Importación (10%)</td><td style="padding:4px 8px;text-align:right;font-size:11px">$${fmt(subtotal * 0.10)}</td><td colspan="2"></td></tr>
            <tr><td colspan="5" style="padding:4px 8px;text-align:right;color:#666;font-size:11px">ITBMS (7%)</td><td style="padding:4px 8px;text-align:right;font-size:11px">$${fmt(subtotal * 0.077)}</td><td colspan="2"></td></tr>
            <tr style="border-top:2px solid #000"><td colspan="5" style="padding:8px;text-align:right;font-weight:600">TOTAL</td><td style="padding:8px;text-align:right;font-weight:600">$${fmt(total)}</td><td colspan="2"></td></tr>
          </tfoot>
        </table>
        ${fotoAttachments.length > 0 ? `
          <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#666;margin:24px 0 8px">Fotos de Evidencia</h3>
          <div style="margin-bottom:16px">${fotoAttachments.map(f => `<img src="cid:${f.cid}" alt="${esc(f.filename)}" style="max-width:280px;height:auto;border-radius:8px;margin:0 8px 8px 0;border:1px solid #eee" />`).join("")}</div>
        ` : ""}
        ${rec.notas ? `<p style="color:#666;font-size:12px">Notas: ${esc(rec.notas)}</p>` : ""}
        <p style="margin-top:24px">Quedamos en espera de la nota de crédito correspondiente.</p>
        <p>Saludos,<br><strong>Fashion Group</strong></p>
        <div style="border-top:1px solid #eee;margin-top:32px;padding-top:12px;font-size:11px;color:#999">Este correo fue enviado desde el sistema interno de Fashion Group.</div>
      </div>`;

    const { error: sendError } = await getResend().emails.send({
      from: "Fashion Group <info@fashiongr.com>",
      to: [contacto.correo],
      subject: `Reclamo ${rec.nro_reclamo} — ${rec.empresa} — Factura ${rec.nro_factura}`,
      html,
      attachments,
    });

    if (sendError) { console.error("Resend error:", sendError.message); return NextResponse.json({ error: "Error al enviar correo" }, { status: 500 }); }

    await supabaseServer.from("reclamo_seguimiento").insert({
      reclamo_id: id,
      nota: `Correo enviado a ${contacto.correo}`,
      autor: "Sistema",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-email error:", err);
    return NextResponse.json({ error: "Error interno al enviar correo" }, { status: 500 });
  }
}
