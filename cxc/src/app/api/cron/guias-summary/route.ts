import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { Resend } from "resend";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const dynamic = "force-dynamic";

// ── Helpers ──

function getPanamaDateStr(date: Date): string {
  return date.toLocaleDateString("es-PA", {
    timeZone: "America/Panama",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getPanamaTimeStr(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleTimeString("es-PA", {
    timeZone: "America/Panama",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── PDF generation (reuses same layout as sendDispatchEmail) ──

interface GuiaRow {
  id: string;
  numero: number;
  fecha?: string;
  transportista?: string;
  placa?: string;
  entregado_por?: string;
  receptor_nombre?: string;
  cedula?: string;
  observaciones?: string;
  numero_guia_transp?: string;
  firma_base64?: string;
  firma_entregador_base64?: string;
  tipo_despacho?: string;
  nombre_chofer?: string;
  updated_at?: string;
  guia_items: { cliente: string; direccion?: string; empresa: string; bultos: number; facturas: string }[];
}

function generateGuiaPdf(guia: GuiaRow): Buffer {
  const gi = guia.guia_items;
  const totalB = gi.reduce((s, i) => s + (i.bultos || 0), 0);
  const doc = new jsPDF("portrait");
  const W = 210;

  doc.setFontSize(13); doc.setTextColor(26); doc.setFont("helvetica", "bold");
  doc.text("GUÍA DE TRANSPORTE INTERIOR", W / 2, 16, { align: "center" });

  doc.setFontSize(9); doc.setTextColor(60);
  const hY = 26;
  doc.setFont("helvetica", "bold"); doc.text("N° GUÍA:", 14, hY);
  doc.setFont("helvetica", "normal"); doc.text(String(guia.numero), 42, hY);
  doc.setFont("helvetica", "bold"); doc.text("FECHA:", 110, hY);
  doc.setFont("helvetica", "normal"); doc.text(guia.fecha || "", 132, hY);

  doc.setFont("helvetica", "bold"); doc.text("TRANSPORTISTA:", 14, hY + 7);
  doc.setFont("helvetica", "normal"); doc.text(guia.transportista || "", 56, hY + 7);
  doc.setFont("helvetica", "bold"); doc.text("PLACA:", 110, hY + 7);
  doc.setFont("helvetica", "normal"); doc.text(guia.placa || "Sin placa", 132, hY + 7);

  doc.setFont("helvetica", "bold"); doc.text("ENTREGADO POR:", 14, hY + 14);
  doc.setFont("helvetica", "normal"); doc.text(guia.entregado_por || "", 56, hY + 14);

  doc.setDrawColor(200); doc.line(14, hY + 19, W - 14, hY + 19);

  autoTable(doc, {
    startY: hY + 23,
    head: [["#", "CLIENTE", "DIRECCIÓN", "EMPRESA", "FACTURA(S)", "BULTOS", "N° GUÍA TRANSP."]],
    body: [
      ...gi.map((it, idx) => [String(idx + 1), it.cliente, it.direccion || "", it.empresa, it.facturas, String(it.bultos), guia.numero_guia_transp || ""]),
      [{ content: "TOTAL DE BULTOS DESPACHADOS", colSpan: 5, styles: { halign: "right" as const, fontStyle: "bold" as const } }, String(totalB), ""],
    ],
    styles: { fontSize: 8, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { fillColor: [240, 240, 240], textColor: [26, 26, 26], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 8 }, 5: { cellWidth: 14, halign: "center" }, 6: { cellWidth: 22 } },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fy = (doc as any).lastAutoTable.finalY + 6;

  doc.setFontSize(8); doc.setTextColor(26); doc.setFont("helvetica", "bold");
  doc.text("OBSERVACIONES GENERALES DEL ENVÍO", 14, fy);
  doc.setFont("helvetica", "normal");
  doc.rect(14, fy + 2, W - 28, 12);
  if (guia.observaciones) doc.text(guia.observaciones, 16, fy + 7, { maxWidth: W - 32 });
  fy += 20;

  const isDirect = guia.tipo_despacho === "directo";
  doc.setFont("helvetica", "bold");
  doc.text(isDirect ? "CHOFER" : "ENTREGADO POR", 14, fy);
  doc.text(isDirect ? "RECIBIDO POR — CLIENTE" : "RECIBIDO CONFORME — TRANSPORTISTA", 110, fy);
  fy += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`NOMBRE: ${isDirect ? (guia.nombre_chofer || "________________") : (guia.entregado_por || "________________")}`, 14, fy);
  if (!isDirect) doc.text(`PLACA: ${guia.placa || "________________"}`, 110, fy);
  else doc.text(`NOMBRE: ${guia.receptor_nombre || "________________"}`, 110, fy);
  fy += 5;
  doc.text("FIRMA: ________________", 14, fy);
  if (!isDirect) doc.text(`NOMBRE: ${guia.receptor_nombre || "________________"}`, 110, fy);
  else doc.text(`CEDULA: ${guia.cedula || "________________"}`, 110, fy);
  fy += 5;
  doc.text("", 14, fy);
  if (!isDirect) doc.text(`CEDULA: ${guia.cedula || "________________"}`, 110, fy);
  else doc.text("FIRMA: ________________", 110, fy);
  fy += 5;
  if (!isDirect) {
    doc.text("", 14, fy);
    doc.text("FIRMA: ________________", 110, fy);
  }

  if (guia.firma_entregador_base64) {
    try { doc.addImage(guia.firma_entregador_base64, "PNG", 14, fy - 12, 40, 15); } catch { /* */ }
  }
  if (guia.firma_base64) {
    try { doc.addImage(guia.firma_base64, "PNG", 145, fy - (isDirect ? 12 : 7), 40, 15); } catch { /* */ }
  }
  fy += 12;

  doc.setFontSize(6); doc.setTextColor(160);
  doc.text("La firma del transportista constituye aceptación expresa de la mercancía detallada en este documento, en la cantidad y condición indicadas.", 14, fy, { maxWidth: W - 28 });
  doc.text("Cualquier faltante o daño no reportado al momento de la recepción será responsabilidad exclusiva del transportista.", 14, fy + 4, { maxWidth: W - 28 });

  return Buffer.from(doc.output("arraybuffer"));
}

// ── Main cron handler ──

export async function GET(req: NextRequest) {
  // Auth: cron secret
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    // Also allow admin session
    let authorized = false;
    try {
      const session = req.cookies.get("cxc_session")?.value;
      if (session) {
        const parsed = JSON.parse(Buffer.from(session, "base64url").toString("utf-8"));
        if (parsed.role === "admin") authorized = true;
      }
    } catch { /* */ }
    if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 24-hour window: 6pm Panama yesterday to 6pm Panama today
  // Panama is UTC-5 year-round, so 6pm Panama = 23:00 UTC
  const now = new Date();
  const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 0, 0));
  // If cron runs at 23:00 UTC, endUtc is "today at 23:00 UTC"
  // If somehow it runs after midnight UTC, adjust
  if (endUtc > now) {
    // endUtc is in the future or current — that's fine
  } else {
    // We already passed 23:00 UTC today, use tomorrow (shouldn't happen with cron at 23:00)
    endUtc.setUTCDate(endUtc.getUTCDate() + 1);
  }
  const startUtc = new Date(endUtc.getTime() - 24 * 60 * 60 * 1000);

  const startIso = startUtc.toISOString();
  const endIso = endUtc.toISOString();

  // Query guías completed in the window
  const { data: guias, error: queryErr } = await supabaseServer
    .from("guia_transporte")
    .select("*, guia_items(*)")
    .eq("estado", "Completada")
    .eq("deleted", false)
    .gte("updated_at", startIso)
    .lte("updated_at", endIso)
    .order("updated_at", { ascending: true });

  if (queryErr) {
    console.error("[guias-summary] Query error:", queryErr.message);
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  if (!guias || guias.length === 0) {
    return NextResponse.json({ message: "No guías dispatched today, email skipped", count: 0 });
  }

  // Filter out deleted items and sort
  for (const g of guias) {
    if (g.guia_items) {
      g.guia_items = g.guia_items.filter((i: { deleted?: boolean }) => !i.deleted);
      g.guia_items.sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden);
    }
  }

  // Build summary email
  const fechaDisplay = getPanamaDateStr(endUtc);
  const totalBultos = guias.reduce((s, g) => s + (g.guia_items || []).reduce((ss: number, i: { bultos: number }) => ss + (i.bultos || 0), 0), 0);

  const tableRows = guias.map((g) => {
    const items = g.guia_items || [];
    const bultos = items.reduce((s: number, i: { bultos: number }) => s + (i.bultos || 0), 0);
    const clientes = [...new Set(items.map((i: { cliente: string }) => i.cliente).filter(Boolean))].join(", ");
    const hora = g.updated_at ? getPanamaTimeStr(g.updated_at) : "—";
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(g.numero)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(g.transportista)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(g.placa || "—")}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(clientes || "—")}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${bultos}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(hora)}</td>
    </tr>`;
  }).join("");

  const html = `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:700px;margin:0 auto;padding:24px">
      <h2 style="color:#1a1a1a;margin:0 0 4px">Resumen de Despachos</h2>
      <p style="color:#888;margin:0 0 20px;font-size:14px">${esc(fechaDisplay)} — ${guias.length} guía${guias.length > 1 ? "s" : ""}, ${totalBultos} bultos</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#1a1a1a;color:#fff">
          <th style="padding:8px 10px;text-align:left"># Guía</th>
          <th style="padding:8px 10px;text-align:left">Transportista</th>
          <th style="padding:8px 10px;text-align:left">Placa</th>
          <th style="padding:8px 10px;text-align:left">Cliente(s)</th>
          <th style="padding:8px 10px;text-align:center">Bultos</th>
          <th style="padding:8px 10px;text-align:left">Hora</th>
        </tr>
        ${tableRows}
        <tr style="font-weight:bold;border-top:2px solid #1a1a1a">
          <td colspan="4" style="padding:8px 10px;text-align:right">TOTAL</td>
          <td style="padding:8px 10px;text-align:center">${totalBultos}</td>
          <td></td>
        </tr>
      </table>
      <p style="color:#aaa;font-size:11px;margin-top:24px">Fashion Group Panamá — Resumen automático diario de despachos</p>
    </div>
  `;

  // Generate PDFs for each guía
  const attachments: { filename: string; content: Buffer }[] = [];
  for (const g of guias) {
    try {
      const pdf = generateGuiaPdf(g as GuiaRow);
      attachments.push({ filename: `Guia-${g.numero}.pdf`, content: pdf });
    } catch (err) {
      console.error(`[guias-summary] PDF generation failed for guía ${g.numero}:`, err);
    }
  }

  // Send email
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const { error: sendErr } = await resend.emails.send({
      from: "Fashion Group <notificaciones@fashiongr.com>",
      to: ["daniel@fashiongr.com"],
      subject: `Resumen de Despachos — ${fechaDisplay}`,
      html,
      attachments,
    });
    if (sendErr) {
      console.error("[guias-summary] Resend error:", sendErr.message);
      return NextResponse.json({ error: sendErr.message }, { status: 500 });
    }
  } catch (err) {
    console.error("[guias-summary] Send failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  return NextResponse.json({
    message: "Resumen de despachos enviado",
    count: guias.length,
    totalBultos,
    fecha: fechaDisplay,
  });
}
