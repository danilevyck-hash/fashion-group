import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { Resend } from "resend";
import { buildBulkReclamosPdf, fetchReclamosForEmpresa, BulkSelector, reclamoBulkConstants } from "@/lib/reclamos/pdf-bulk";

export const dynamic = "force-dynamic";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function fmt(n: number): string {
  return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d: string | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export async function POST(req: NextRequest, { params }: { params: { empresa: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const empresa = decodeURIComponent(params.empresa || "");
    if (!empresa) return NextResponse.json({ error: "Empresa requerida" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as BulkSelector;

    const { data: contactos } = await supabaseServer
      .from("reclamo_contactos")
      .select("*")
      .eq("empresa", empresa)
      .limit(1);
    const contacto = contactos?.[0];
    if (!contacto?.correo) {
      return NextResponse.json(
        { error: `No hay correo configurado para ${empresa}.` },
        { status: 400 },
      );
    }

    const reclamos = await fetchReclamosForEmpresa(empresa, body);
    if (!reclamos.length) {
      return NextResponse.json({ error: "No hay reclamos para enviar." }, { status: 404 });
    }

    const { FACTOR_TOTAL } = reclamoBulkConstants();
    let grandTotal = 0;
    const summaryRows = reclamos
      .map((r) => {
        const sub = (r.reclamo_items || []).reduce(
          (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0),
          0,
        );
        const total = sub * FACTOR_TOTAL;
        grandTotal += total;
        return `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${esc(r.nro_reclamo)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${esc(r.nro_factura)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${esc(fmtDate(r.fecha_reclamo))}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${esc(r.estado)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right">$${fmt(total)}</td>
        </tr>`;
      })
      .join("");

    const doc = await buildBulkReclamosPdf(reclamos, empresa);
    const pdfBuf = Buffer.from(doc.output("arraybuffer"));
    const safeName = empresa.replace(/[^A-Za-z0-9_-]+/g, "_");
    const pdfFilename = `Reclamos_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;

    const nombre = contacto.nombre_contacto || contacto.nombre || "equipo";
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1a1a1a">
        <div style="border-bottom:2px solid #000;padding-bottom:16px;margin-bottom:24px">
          <h2 style="margin:0;font-size:18px">Fashion Group</h2>
          <p style="margin:4px 0 0;color:#666;font-size:13px">Reclamos pendientes — ${esc(empresa)}</p>
        </div>
        <p>Estimado/a ${esc(nombre)},</p>
        <p>Adjuntamos el detalle de <strong>${reclamos.length}</strong> reclamo${reclamos.length === 1 ? "" : "s"} pendiente${reclamos.length === 1 ? "" : "s"} de resolución para ${esc(empresa)}.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:12px">
          <thead>
            <tr style="border-bottom:2px solid #000">
              <th style="padding:6px 8px;text-align:left">N° Reclamo</th>
              <th style="padding:6px 8px;text-align:left">Factura</th>
              <th style="padding:6px 8px;text-align:left">Fecha</th>
              <th style="padding:6px 8px;text-align:left">Estado</th>
              <th style="padding:6px 8px;text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${summaryRows}</tbody>
          <tfoot>
            <tr style="border-top:2px solid #000">
              <td colspan="4" style="padding:8px;text-align:right;font-weight:600">TOTAL A ACREDITAR</td>
              <td style="padding:8px;text-align:right;font-weight:600">$${fmt(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
        <p>El detalle completo de cada reclamo (ítems, evidencia fotográfica y totales por reclamo) se encuentra en el PDF adjunto.</p>
        <p>Quedamos en espera de la nota de crédito correspondiente.</p>
        <p style="margin-top:24px">Saludos,<br><strong>Fashion Group</strong></p>
        <div style="border-top:1px solid #eee;margin-top:32px;padding-top:12px;font-size:11px;color:#999">Este correo fue enviado desde el sistema interno de Fashion Group.</div>
      </div>`;

    const subject = `Reclamos pendientes — ${empresa} — ${reclamos.length} reclamo${reclamos.length === 1 ? "" : "s"}`;

    const { error: sendError } = await getResend().emails.send({
      from: "Fashion Group <info@fashiongr.com>",
      to: [contacto.correo],
      subject,
      html,
      attachments: [{ filename: pdfFilename, content: pdfBuf }],
    });

    if (sendError) {
      console.error("Resend bulk error:", sendError.message);
      return NextResponse.json({ error: "Error al enviar el correo." }, { status: 500 });
    }

    const ids = reclamos.map((r) => r.id);
    if (ids.length > 0) {
      await supabaseServer.from("reclamo_seguimiento").insert(
        ids.map((reclamo_id) => ({
          reclamo_id,
          nota: `Correo consolidado enviado a ${contacto.correo} (${reclamos.length} reclamos)`,
          autor: "Sistema",
        })),
      );
    }

    return NextResponse.json({ ok: true, sent: reclamos.length, to: contacto.correo });
  } catch (err) {
    console.error("send-email bulk error:", err);
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
