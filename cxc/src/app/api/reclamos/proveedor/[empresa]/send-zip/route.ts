import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { Resend } from "resend";
import { buildBulkReclamosExcel, type ReclamoFull } from "@/lib/reclamos/excel-bulk";
import { fetchReclamosForEmpresa, type BulkSelector } from "@/lib/reclamos/fetch-empresa";
import { reclamoTaxes } from "@/lib/reclamos/tax";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SendBody extends BulkSelector {
  to?: string;
  cc?: string;
  subject?: string;
  message?: string;
}

export async function POST(req: NextRequest, { params }: { params: { empresa: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const empresa = decodeURIComponent(params.empresa || "");
    if (!empresa) return NextResponse.json({ error: "Empresa requerida" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as SendBody;
    const subject = (body.subject || "").trim();
    const message = (body.message || "").trim();

    const recipients = (body.to || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!recipients.length) {
      return NextResponse.json({ error: "Falta el correo del destinatario." }, { status: 400 });
    }
    const invalid = recipients.find((r) => !EMAIL_RE.test(r));
    if (invalid) {
      return NextResponse.json({ error: `Correo inválido: ${invalid}` }, { status: 400 });
    }
    // CC opcional (uno o varios, separados por coma).
    const ccList = (body.cc || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const invalidCc = ccList.find((r) => !EMAIL_RE.test(r));
    if (invalidCc) {
      return NextResponse.json({ error: `Correo en copia inválido: ${invalidCc}` }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ error: "Falta el asunto." }, { status: 400 });
    }

    const reclamos = await fetchReclamosForEmpresa<ReclamoFull>(empresa, { reclamo_ids: body.reclamo_ids });
    if (!reclamos.length) {
      return NextResponse.json({ error: "No hay reclamos para enviar." }, { status: 404 });
    }

    const { data: contactos } = await supabaseServer
      .from("reclamo_contactos")
      .select("*")
      .eq("empresa", empresa)
      .limit(1);
    const contacto = contactos?.[0] || null;

    // Excel pelado con links WEB (factura firmada + fotos públicas). Abre con un
    // clic en Mac/Windows, sin extraer ni permisos. Liviano → siempre se adjunta.
    const buffer = await buildBulkReclamosExcel(reclamos, empresa, contacto);
    const safeName = empresa.replace(/[^A-Za-z0-9_-]+/g, "_");
    const filename = `Reclamos_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    // Tabla resumen (igual estilo que el correo consolidado existente)
    let grandTotal = 0;
    const summaryRows = reclamos
      .map((r) => {
        const sub = (r.reclamo_items || []).reduce(
          (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0),
          0,
        );
        const total = reclamoTaxes(empresa, sub).total;
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

    // El Excel es liviano → siempre se adjunta. Los archivos (factura/fotos) abren
    // desde los links WEB del propio Excel, así que no se adjuntan binarios.
    const attachments = [{ filename, content: buffer }];
    const downloadBlock = `<p style="font-size:13px;color:#444">Adjunto encontrará <strong>${esc(filename)}</strong>. Dentro del Excel, los enlaces <em>Ver factura</em> y <em>Ver fotos</em> abren los archivos en el navegador con un clic.</p>`;

    const messageHtml = esc(message).replace(/\n/g, "<br>");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1a1a1a">
        <div style="border-bottom:2px solid #000;padding-bottom:16px;margin-bottom:24px">
          <h2 style="margin:0;font-size:18px">Fashion Group</h2>
          <p style="margin:4px 0 0;color:#666;font-size:13px">Reclamos a Proveedor — ${esc(empresa)}</p>
        </div>
        <p style="font-size:14px;white-space:pre-line">${messageHtml}</p>
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
        ${downloadBlock}
        <p style="margin-top:24px;font-size:14px">Saludos,<br><strong>Fashion Group</strong></p>
        <div style="border-top:1px solid #eee;margin-top:32px;padding-top:12px;font-size:11px;color:#999">Este correo fue enviado desde el sistema interno de Fashion Group.</div>
      </div>`;

    const { error: sendError } = await getResend().emails.send({
      from: "Fashion Group <info@fashiongr.com>",
      to: recipients,
      cc: ccList.length ? ccList : undefined,
      subject,
      html,
      attachments: attachments.length ? attachments : undefined,
    });

    if (sendError) {
      console.error("send-zip Resend error:", sendError.message);
      return NextResponse.json({ error: "Error al enviar el correo." }, { status: 500 });
    }

    // Registro en seguimiento (igual que el correo consolidado existente)
    const ids = reclamos.map((r) => r.id);
    if (ids.length > 0) {
      const ccNota = ccList.length ? ` · CC: ${ccList.join(", ")}` : "";
      const nota = `Correo con Excel adjunto enviado a ${recipients.join(", ")}${ccNota} (${reclamos.length} reclamos)`;
      await supabaseServer.from("reclamo_seguimiento").insert(
        ids.map((reclamo_id) => ({ reclamo_id, nota, autor: "Sistema" })),
      );
    }

    // Pipeline de 2 estados: enviar el correo NO cambia el estado. El reclamo se
    // queda en "Creado"; solo el settlement (Pagado) lo avanza.

    return NextResponse.json({
      ok: true,
      sent: reclamos.length,
      to: recipients,
    });
  } catch (err) {
    console.error("send-zip error:", err);
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
