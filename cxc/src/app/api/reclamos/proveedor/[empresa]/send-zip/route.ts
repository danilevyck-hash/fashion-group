import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { Resend } from "resend";
import { fetchReclamosForEmpresa, reclamoBulkConstants, type BulkSelector } from "@/lib/reclamos/excel-bulk";
import { buildReclamosZip } from "@/lib/reclamos/zip-bulk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Bucket PRIVADO dedicado a los ZIPs (facturas + fotos del negocio).
// NO usar el bucket público reclamo-fotos: ahí el objeto quedaría alcanzable
// por URL aunque el link firmado venza. En privado, solo la signed URL sirve.
const ZIP_BUCKET = "reclamo-zips-privado";
const ATTACH_LIMIT = 10 * 1024 * 1024; // ≤10MB → adjunta; sobre eso → link firmado
const SIGNED_URL_DAYS = 7;

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

/** Crea el bucket privado si no existe (idempotente, self-healing). */
async function ensureZipBucket(): Promise<void> {
  const { data } = await supabaseServer.storage.getBucket(ZIP_BUCKET);
  if (data) return;
  const { error } = await supabaseServer.storage.createBucket(ZIP_BUCKET, { public: false });
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`No se pudo preparar el almacenamiento privado: ${error.message}`);
  }
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
    if (!subject) {
      return NextResponse.json({ error: "Falta el asunto." }, { status: 400 });
    }

    const reclamos = await fetchReclamosForEmpresa(empresa, { reclamo_ids: body.reclamo_ids });
    if (!reclamos.length) {
      return NextResponse.json({ error: "No hay reclamos para enviar." }, { status: 404 });
    }

    const { data: contactos } = await supabaseServer
      .from("reclamo_contactos")
      .select("*")
      .eq("empresa", empresa)
      .limit(1);
    const contacto = contactos?.[0] || null;

    // Arma el ZIP (Excel resumen + carpeta por reclamo con factura PDF + fotos)
    const { buffer, fotosIncluidas, fotosOmitidas, pdfsIncluidos, pdfsOmitidos } = await buildReclamosZip(reclamos, empresa, contacto);
    const safeName = empresa.replace(/[^A-Za-z0-9_-]+/g, "_");
    const filename = `Reclamos_${safeName}_${new Date().toISOString().slice(0, 10)}.zip`;
    const sizeMB = buffer.length / (1024 * 1024);

    // Tabla resumen (igual estilo que el correo consolidado existente)
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

    // Lógica híbrida: adjuntar o link firmado
    const attachments: { filename: string; content: Buffer }[] = [];
    let downloadBlock = "";
    let mode: "attach" | "link" = "attach";

    if (buffer.length <= ATTACH_LIMIT) {
      attachments.push({ filename, content: buffer });
      downloadBlock = `<p style="font-size:13px;color:#444">Adjunto encontrará <strong>${esc(filename)}</strong> (${sizeMB.toFixed(1)} MB) con el Excel resumen y las fotos de evidencia organizadas por número de factura.</p>`;
    } else {
      mode = "link";
      await ensureZipBucket();
      const path = `${safeName}/${new Date().toISOString().slice(0, 10)}_${Date.now()}_${filename}`;
      const { error: upErr } = await supabaseServer.storage
        .from(ZIP_BUCKET)
        .upload(path, buffer, { contentType: "application/zip", upsert: true });
      if (upErr) {
        return NextResponse.json({ error: "No se pudo preparar el archivo para el envío." }, { status: 500 });
      }
      const { data: signed, error: signErr } = await supabaseServer.storage
        .from(ZIP_BUCKET)
        .createSignedUrl(path, SIGNED_URL_DAYS * 24 * 60 * 60);
      if (signErr || !signed?.signedUrl) {
        return NextResponse.json({ error: "No se pudo generar el enlace de descarga." }, { status: 500 });
      }
      downloadBlock = `<p style="font-size:13px;color:#444">El archivo (${sizeMB.toFixed(1)} MB) es demasiado grande para adjuntar, así que puede descargarlo desde este enlace (válido por ${SIGNED_URL_DAYS} días):</p>
        <p style="margin:12px 0"><a href="${signed.signedUrl}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:600">Descargar ZIP (${sizeMB.toFixed(1)} MB)</a></p>`;
    }

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
      const nota =
        mode === "link"
          ? `Correo con ZIP (enlace de descarga) enviado a ${recipients.join(", ")} (${reclamos.length} reclamos)`
          : `Correo con ZIP adjunto enviado a ${recipients.join(", ")} (${reclamos.length} reclamos)`;
      await supabaseServer.from("reclamo_seguimiento").insert(
        ids.map((reclamo_id) => ({ reclamo_id, nota, autor: "Sistema" })),
      );
    }

    // Pipeline de 2 estados: enviar el ZIP por correo NO cambia el estado. El
    // reclamo se queda en "Creado"; solo el settlement (Pagado) lo avanza.

    return NextResponse.json({
      ok: true,
      sent: reclamos.length,
      to: recipients,
      mode,
      sizeMB: Number(sizeMB.toFixed(1)),
      fotosIncluidas,
      fotosOmitidas,
      pdfsIncluidos,
      pdfsOmitidos,
    });
  } catch (err) {
    console.error("send-zip error:", err);
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
