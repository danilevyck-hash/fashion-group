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
      const gi = (data.guia_items || []) as { cliente: string; empresa: string; bultos: number; facturas: string }[];
      const totalB = gi.reduce((s, i) => s + (i.bultos || 0), 0);
      const itemsList = gi.map(i => `• ${i.cliente} — ${i.empresa} — ${i.bultos} bultos — ${i.facturas}`).join("<br>");

      // Generate PDF server-side
      let pdfBuffer: Buffer | null = null;
      try {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF("portrait");
        doc.setFillColor(26, 26, 26); doc.rect(0, 0, 210, 18, "F");
        doc.setFontSize(12); doc.setTextColor(255); doc.setFont("helvetica", "bold");
        doc.text(`GUÍA #${data.numero}`, 14, 12);
        doc.setFontSize(8); doc.setFont("helvetica", "normal");
        doc.text("Fashion Group · Panamá", 196, 12, { align: "right" });
        doc.setTextColor(60); doc.setFontSize(9);
        doc.text(`Transportista: ${transportista || data.transportista}`, 14, 26);
        doc.text(`Placa: ${placa}`, 90, 26);
        doc.text(`Fecha: ${data.fecha || ""}`, 150, 26);
        doc.text(`Entregado por: ${data.entregado_por || "—"}`, 14, 33);
        doc.text(`Receptor: ${receptor_nombre || "—"}`, 90, 33);
        autoTable(doc, {
          startY: 40,
          head: [["#", "Cliente", "Empresa", "Facturas", "Bultos"]],
          body: gi.map((i, idx) => [String(idx + 1), i.cliente, i.empresa, i.facturas, String(i.bultos)]),
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [26, 26, 26] },
          columnStyles: { 0: { cellWidth: 10 }, 4: { cellWidth: 18, halign: "center" } },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fy = (doc as any).lastAutoTable.finalY + 6;
        doc.setFontSize(10); doc.setTextColor(26); doc.setFont("helvetica", "bold");
        doc.text(`Total: ${totalB} bultos`, 14, fy);
        doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "normal");
        doc.text("Fashion Group Panamá", 14, fy + 8);
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

  const { error } = await supabaseServer.from("guia_transporte").update(update).eq("id", params.id);
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
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
