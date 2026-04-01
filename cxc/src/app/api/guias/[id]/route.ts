import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("guia_transporte")
    .select("*, guia_items(*)")
    .eq("id", id)
    .eq("deleted", false)
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  if (data?.guia_items) {
    data.guia_items = data.guia_items.filter((i: { deleted?: boolean }) => !i.deleted);
    data.guia_items.sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden);
  }

  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const body = await req.json();
  const { fecha, transportista, placa, observaciones, items, monto_total, estado, receptor_nombre, cedula, firma_base64, firma_entregador_base64, entregado_por, numero_guia_transp } = body;

  // Validation: dispatch requires items
  if (estado && (estado === "Completada" || estado === "Despachada")) {
    const { data: currentItems } = await supabaseServer
      .from("guia_items").select("bultos").eq("guia_id", id).eq("deleted", false);
    const itemCount = items !== undefined ? (items?.length || 0) : (currentItems?.length || 0);
    const totalBultos = items !== undefined
      ? (items || []).reduce((s: number, i: { bultos?: number }) => s + (i.bultos || 0), 0)
      : (currentItems || []).reduce((s: number, i: { bultos: number }) => s + (i.bultos || 0), 0);
    if (itemCount === 0) return NextResponse.json({ error: "No se puede despachar una guía sin items" }, { status: 400 });
    if (totalBultos === 0) return NextResponse.json({ error: "No se puede despachar una guía con 0 bultos" }, { status: 400 });
  }

  // Fetch previous state for logging
  const { data: previous } = await supabaseServer.from("guia_transporte").select("estado, placa, transportista").eq("id", id).single();

  // Update header
  const updateData: Record<string, unknown> = {};
  if (fecha !== undefined) updateData.fecha = fecha;
  if (transportista !== undefined) updateData.transportista = transportista;
  if (placa !== undefined) updateData.placa = placa;
  if (observaciones !== undefined) updateData.observaciones = observaciones;
  if (monto_total !== undefined) updateData.monto_total = monto_total || 0;
  if (estado !== undefined) updateData.estado = estado;
  if (receptor_nombre !== undefined) updateData.receptor_nombre = receptor_nombre;
  if (cedula !== undefined) updateData.cedula = cedula;
  if (firma_base64 !== undefined) updateData.firma_base64 = firma_base64;
  if (entregado_por !== undefined) updateData.entregado_por = entregado_por;
  if (numero_guia_transp !== undefined) updateData.numero_guia_transp = numero_guia_transp;
  if (firma_entregador_base64 !== undefined) updateData.firma_entregador_base64 = firma_entregador_base64;

  const { error: guiaErr } = await supabaseServer.from("guia_transporte").update(updateData).eq("id", id);
  if (guiaErr) return NextResponse.json({ error: guiaErr.message }, { status: 500 });

  // Only replace items if explicitly sent in body
  if (items !== undefined) {
    await supabaseServer.from("guia_items").delete().eq("guia_id", id);
    if (items && items.length > 0) {
      const rows = items.map((item: Record<string, unknown>, i: number) => ({
        guia_id: id, orden: i + 1,
        cliente: item.cliente || "", direccion: item.direccion || "",
        empresa: item.empresa || "", facturas: item.facturas || "",
        bultos: item.bultos || 0, numero_guia_transp: item.numero_guia_transp || "",
      }));
      const { error: itemsErr } = await supabaseServer.from("guia_items").insert(rows);
      if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }
  }

  // Return updated guia with items
  const { data } = await supabaseServer.from("guia_transporte").select("*, guia_items(*)").eq("id", id).single();
  if (data?.guia_items) {
    data.guia_items = data.guia_items.filter((i: { deleted?: boolean }) => !i.deleted);
    data.guia_items.sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden);
  }

  // Detailed logging
  const session = getSession(req);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (estado && previous?.estado !== estado) changes.estado = { from: previous?.estado, to: estado };
  if (placa && previous?.placa !== placa) changes.placa = { from: previous?.placa, to: placa };
  if (transportista && previous?.transportista !== transportista) changes.transportista = { from: previous?.transportista, to: transportista };
  if (items !== undefined) changes.items = { from: "replaced", to: `${(items || []).length} items` };

  if (Object.keys(changes).length > 0) {
    await logActivity(session?.role || "unknown", estado ? "guia_dispatch" : "guia_edit", "guias", { guiaId: id, changes }, session?.userName);
  }

  // Dispatch email with PDF attachment
  if (placa && estado && data) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const gi = (data.guia_items || []) as { cliente: string; direccion?: string; empresa: string; bultos: number; facturas: string }[];
      const totalB = gi.reduce((s, i) => s + (i.bultos || 0), 0);
      const itemsList = gi.map(i => `• ${i.cliente} — ${i.empresa} — ${i.bultos} bultos — ${i.facturas}`).join("<br>");

      // Generate professional PDF matching the print document
      let pdfBuffer: Buffer | null = null;
      try {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF("portrait");
        const W = 210;

        // Title
        doc.setFontSize(13); doc.setTextColor(26); doc.setFont("helvetica", "bold");
        doc.text("GUÍA DE TRANSPORTE INTERIOR", W / 2, 16, { align: "center" });

        // Header fields — 2 columns
        doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(60);
        const hY = 26;
        doc.setFont("helvetica", "bold"); doc.text("N° GUÍA:", 14, hY);
        doc.setFont("helvetica", "normal"); doc.text(String(data.numero), 42, hY);
        doc.setFont("helvetica", "bold"); doc.text("FECHA:", 110, hY);
        doc.setFont("helvetica", "normal"); doc.text(data.fecha || "", 132, hY);

        doc.setFont("helvetica", "bold"); doc.text("TRANSPORTISTA:", 14, hY + 7);
        doc.setFont("helvetica", "normal"); doc.text(transportista || data.transportista || "", 56, hY + 7);
        doc.setFont("helvetica", "bold"); doc.text("PLACA:", 110, hY + 7);
        doc.setFont("helvetica", "normal"); doc.text(placa || "", 132, hY + 7);

        doc.setFont("helvetica", "bold"); doc.text("ENTREGADO POR:", 14, hY + 14);
        doc.setFont("helvetica", "normal"); doc.text(data.entregado_por || "", 56, hY + 14);

        // Separator
        doc.setDrawColor(200); doc.line(14, hY + 19, W - 14, hY + 19);

        // Items table
        const guiaItemsFull = gi as { cliente: string; direccion?: string; empresa: string; facturas: string; bultos: number }[];
        autoTable(doc, {
          startY: hY + 23,
          head: [["#", "CLIENTE", "DIRECCIÓN", "EMPRESA", "FACTURA(S)", "BULTOS", "N° GUÍA TRANSP."]],
          body: [
            ...guiaItemsFull.map((it, idx) => [String(idx + 1), it.cliente, it.direccion || "", it.empresa, it.facturas, String(it.bultos), data.numero_guia_transp || ""]),
            [{ content: "TOTAL DE BULTOS DESPACHADOS", colSpan: 5, styles: { halign: "right" as const, fontStyle: "bold" as const } }, String(totalB), ""],
          ],
          styles: { fontSize: 8, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.2 },
          headStyles: { fillColor: [240, 240, 240], textColor: [26, 26, 26], fontStyle: "bold" },
          columnStyles: { 0: { cellWidth: 8 }, 5: { cellWidth: 14, halign: "center" }, 6: { cellWidth: 22 } },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fy = (doc as any).lastAutoTable.finalY + 6;

        // Observaciones
        doc.setFontSize(8); doc.setTextColor(26); doc.setFont("helvetica", "bold");
        doc.text("OBSERVACIONES GENERALES DEL ENVÍO", 14, fy);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        doc.rect(14, fy + 2, W - 28, 12); // empty box
        if (data.observaciones) doc.text(data.observaciones, 16, fy + 7, { maxWidth: W - 32 });
        fy += 20;

        // Signatures — 2 columns
        doc.setFontSize(8); doc.setFont("helvetica", "bold");
        doc.text("ENTREGADO POR", 14, fy);
        doc.text("RECIBIDO CONFORME — TRANSPORTISTA", 110, fy);
        fy += 6;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        doc.text(`NOMBRE: ${data.entregado_por || "________________"}`, 14, fy);
        doc.text(`PLACA: ${placa || "________________"}`, 110, fy);
        fy += 5;
        doc.text("FIRMA: ________________", 14, fy);
        doc.text(`NOMBRE: ${receptor_nombre || "________________"}`, 110, fy);
        fy += 5;
        doc.text("", 14, fy);
        doc.text(`CÉDULA: ${data.cedula || "________________"}`, 110, fy);
        fy += 5;
        doc.text("", 14, fy);
        doc.text("FIRMA: ________________", 110, fy);

        // Add signature images if available
        if (data.firma_entregador_base64) {
          try { doc.addImage(data.firma_entregador_base64, "PNG", 14, fy - 12, 40, 15); } catch { /* */ }
        }
        if (data.firma_base64) {
          try { doc.addImage(data.firma_base64, "PNG", 145, fy - 7, 40, 15); } catch { /* */ }
        }

        fy += 12;

        // Footer legal
        doc.setFontSize(6); doc.setTextColor(160);
        doc.text("La firma del transportista constituye aceptación expresa de la mercancía detallada en este documento, en la cantidad y condición indicadas.", 14, fy, { maxWidth: W - 28 });
        doc.text("Cualquier faltante o daño no reportado al momento de la recepción será responsabilidad exclusiva del transportista.", 14, fy + 4, { maxWidth: W - 28 });

        pdfBuffer = Buffer.from(doc.output("arraybuffer"));
      } catch { /* PDF generation failed, send email without attachment */ }

      const emailOptions: { from: string; to: string[]; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] } = {
        from: "Fashion Group <notificaciones@fashiongr.com>",
        to: ["daniel@fashiongr.com", "info@fashiongr.com"],
        subject: `✅ Guía #${data.numero} despachada — ${transportista || data.transportista}`,
        html: `<h2>Guía #${data.numero} despachada</h2><p><strong>Transportista:</strong> ${transportista || data.transportista}<br><strong>Placa:</strong> ${placa}<br><strong>Receptor:</strong> ${receptor_nombre || "—"}<br><strong>Total:</strong> ${totalB} bultos</p><p><strong>Items:</strong></p><p>${itemsList || "Sin items"}</p><p style="color:#888;font-size:11px">Fashion Group Panamá — Notificación automática</p>`,
      };
      if (pdfBuffer) {
        emailOptions.attachments = [{ filename: `Guia-${data.numero}.pdf`, content: pdfBuffer }];
      }
      await resend.emails.send(emailOptions);
    } catch { /* email send failed */ }
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const body = await req.json();
  const allowed = ["placa", "observaciones", "estado", "receptor_nombre", "cedula", "firma_base64", "firma_entregador_base64", "entregado_por", "numero_guia_transp", "nombre_entregador", "cedula_entregador", "firma_transportista"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "guia_patch", "guias", { guiaId: params.id, fields: Object.keys(update) }, session?.userName);

  const { data: updated, error } = await supabaseServer.from("guia_transporte").update(update).eq("id", params.id).select("id").maybeSingle();
  if (error) { console.error(error); return NextResponse.json({ error: error.message }, { status: 500 }); }
  if (!updated) { return NextResponse.json({ error: "Guía no encontrada o sin cambios" }, { status: 404 }); }

  // Send email if dispatched via PATCH
  if (body.estado === "Completada" || body.estado === "Listo para Imprimir") {
    try {
      const { data: guia } = await supabaseServer.from("guia_transporte").select("numero, transportista, placa, guia_items(cliente, empresa, bultos, facturas)").eq("id", params.id).single();
      if (guia) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const gi = (guia.guia_items || []) as { cliente: string; empresa: string; bultos: number; facturas: string }[];
        const totalB = gi.reduce((s, i) => s + (i.bultos || 0), 0);
        const itemsList = gi.map(i => `• ${i.cliente} — ${i.empresa} — ${i.bultos} bultos`).join("<br>");
        await resend.emails.send({
          from: "Fashion Group <notificaciones@fashiongr.com>",
          to: ["daniel@fashiongr.com", "info@fashiongr.com"],
          subject: `✅ Guía #${guia.numero} despachada — ${guia.transportista}`,
          html: `<h2>Guía #${guia.numero} despachada</h2><p><strong>Transportista:</strong> ${guia.transportista}<br><strong>Placa:</strong> ${guia.placa || "Sin placa"}<br><strong>Total:</strong> ${totalB} bultos</p><p>${itemsList}</p><p style="color:#888;font-size:11px">Fashion Group Panamá — Despachado por ${session?.userName || session?.role || "sistema"}</p>`,
        });
      }
    } catch { /* email failed silently */ }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Soft delete
  const { error } = await supabaseServer.from("guia_transporte").update({ deleted: true }).eq("id", id);
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "guia_delete", "guias", { guiaId: id }, session?.userName);

  return NextResponse.json({ ok: true });
}
