import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUIAS_ROLES = ["admin", "secretaria", "bodega", "director", "vendedor"];

// ── Shared: generate PDF + send email ──

interface GuiaEmail {
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
  guia_items: { cliente: string; direccion?: string; empresa: string; bultos: number; facturas: string }[];
}

async function sendDispatchEmail(guia: GuiaEmail, dispatchedBy: string) {
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const gi = guia.guia_items;
    const totalB = gi.reduce((s, i) => s + (i.bultos || 0), 0);
    const itemsHtml = gi.map(i => `• ${i.cliente} — ${i.empresa} — ${i.bultos} bultos — ${i.facturas}`).join("<br>");

    // Generate PDF
    let pdfBuffer: Buffer | null = null;
    try {
      const { jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
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

      pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    } catch { /* PDF failed */ }

    const tipoLabel = guia.tipo_despacho === "directo" ? "Entrega directa" : "Transportista externo";
    const emailOptions: { from: string; to: string[]; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] } = {
      from: "Fashion Group <notificaciones@fashiongr.com>",
      to: ["daniel@fashiongr.com", "info@fashiongr.com"],
      subject: `Guia #${guia.numero} despachada — ${guia.transportista}`,
      html: `<h2 style="color:#1a1a1a">Guia #${guia.numero} despachada</h2>
        <p><strong>Tipo:</strong> ${tipoLabel} | <strong>Transportista:</strong> ${guia.transportista} | <strong>Placa:</strong> ${guia.placa || "N/A"} | <strong>Receptor:</strong> ${guia.receptor_nombre || "—"} | <strong>Total:</strong> ${totalB} bultos</p>
        ${guia.nombre_chofer ? `<p><strong>Chofer:</strong> ${guia.nombre_chofer}</p>` : ""}
        <p><strong>Items:</strong></p><p>${itemsHtml || "Sin items"}</p>
        <p style="color:#888;font-size:12px;margin-top:16px">Fashion Group Panama — Despachado por ${dispatchedBy}</p>`,
    };
    if (pdfBuffer) {
      emailOptions.attachments = [{ filename: `Guia-${guia.numero}.pdf`, content: pdfBuffer }];
    }
    await resend.emails.send(emailOptions);
  } catch { /* email failed */ }
}

// ── GET ──

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, GUIAS_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("guia_transporte").select("*, guia_items(*)").eq("id", id).eq("deleted", false).single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  if (data?.guia_items) {
    data.guia_items = data.guia_items.filter((i: { deleted?: boolean }) => !i.deleted);
    data.guia_items.sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden);
  }
  return NextResponse.json(data);
}

// ── PUT (bodega full dispatch with items/signatures) ──

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, GUIAS_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const body = await req.json();
  const { fecha, transportista, placa, observaciones, items, monto_total, estado, receptor_nombre, cedula, firma_base64, firma_entregador_base64, entregado_por, numero_guia_transp, tipo_despacho, nombre_chofer } = body;

  if (estado && (estado === "Completada" || estado === "Despachada")) {
    const { data: currentItems } = await supabaseServer.from("guia_items").select("bultos").eq("guia_id", id).eq("deleted", false);
    const itemCount = items !== undefined ? (items?.length || 0) : (currentItems?.length || 0);
    const totalBultos = items !== undefined
      ? (items || []).reduce((s: number, i: { bultos?: number }) => s + (i.bultos || 0), 0)
      : (currentItems || []).reduce((s: number, i: { bultos: number }) => s + (i.bultos || 0), 0);
    if (itemCount === 0) return NextResponse.json({ error: "No se puede despachar una guía sin items" }, { status: 400 });
    if (totalBultos === 0) return NextResponse.json({ error: "No se puede despachar una guía con 0 bultos" }, { status: 400 });
  }

  const { data: previous } = await supabaseServer.from("guia_transporte").select("estado, placa, transportista").eq("id", id).single();

  // Block edits on dispatched guías (only dispatch flow itself can update)
  if (previous?.estado === "Completada" && estado !== "Completada") {
    return NextResponse.json({ error: "Guía ya despachada, no se puede editar" }, { status: 400 });
  }

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
  if (tipo_despacho !== undefined) updateData.tipo_despacho = tipo_despacho;
  if (nombre_chofer !== undefined) updateData.nombre_chofer = nombre_chofer;

  const { error: guiaErr } = await supabaseServer.from("guia_transporte").update(updateData).eq("id", id);
  if (guiaErr) return NextResponse.json({ error: guiaErr.message }, { status: 500 });

  if (items !== undefined) {
    // Safe replace: insert new items first, then delete old ones
    if (items && items.length > 0) {
      const rows = items.map((item: Record<string, unknown>, i: number) => ({
        guia_id: id, orden: -(i + 1), // negative orden = new batch (temp marker)
        cliente: item.cliente || "", direccion: item.direccion || "",
        empresa: item.empresa || "", facturas: item.facturas || "",
        bultos: item.bultos || 0, numero_guia_transp: item.numero_guia_transp || "",
      }));
      const { error: itemsErr } = await supabaseServer.from("guia_items").insert(rows);
      if (itemsErr) {
        // Cleanup: remove any partially inserted new items
        await supabaseServer.from("guia_items").delete().eq("guia_id", id).lt("orden", 0);
        return NextResponse.json({ error: itemsErr.message }, { status: 500 });
      }
      // New items inserted successfully — delete old items (positive orden)
      await supabaseServer.from("guia_items").delete().eq("guia_id", id).gte("orden", 0);
      // Fix orden: flip negative to positive
      const { data: newItems } = await supabaseServer.from("guia_items").select("id, orden").eq("guia_id", id);
      if (newItems) {
        for (const ni of newItems) {
          if (ni.orden < 0) {
            await supabaseServer.from("guia_items").update({ orden: -ni.orden }).eq("id", ni.id);
          }
        }
      }
    } else {
      // Empty items array = delete all
      await supabaseServer.from("guia_items").delete().eq("guia_id", id);
    }
  }

  const { data } = await supabaseServer.from("guia_transporte").select("*, guia_items(*)").eq("id", id).single();
  if (data?.guia_items) {
    data.guia_items = data.guia_items.filter((i: { deleted?: boolean }) => !i.deleted);
    data.guia_items.sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden);
  }

  const session = getSession(req);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (estado && previous?.estado !== estado) changes.estado = { from: previous?.estado, to: estado };
  if (placa && previous?.placa !== placa) changes.placa = { from: previous?.placa, to: placa };
  if (items !== undefined) changes.items = { from: "replaced", to: `${(items || []).length} items` };
  if (Object.keys(changes).length > 0) {
    await logActivity(session?.role || "unknown", estado ? "guia_dispatch" : "guia_edit", "guias", { guiaId: id, changes }, session?.userName);
  }

  // Send email with PDF for BOTH dispatch flows
  if (estado && data) {
    await sendDispatchEmail(data as GuiaEmail, session?.userName || session?.role || "sistema");
  }

  return NextResponse.json(data);
}

// ── PATCH (quick dispatch from list / bodega partial update) ──

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, GUIAS_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const body = await req.json();
  const allowed = ["placa", "observaciones", "estado", "receptor_nombre", "cedula", "firma_base64", "firma_entregador_base64", "entregado_por", "numero_guia_transp", "nombre_entregador", "cedula_entregador", "firma_transportista", "tipo_despacho", "nombre_chofer", "motivo_rechazo"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  // Block double-dispatch: if guia is already Completada, reject state changes
  if (body.estado) {
    const { data: current } = await supabaseServer.from("guia_transporte").select("estado").eq("id", params.id).single();
    if (current?.estado === "Completada" && body.estado === "Completada") {
      return NextResponse.json({ error: "Esta guía ya fue despachada" }, { status: 400 });
    }
    if (current?.estado === "Completada" && body.estado !== "Completada") {
      return NextResponse.json({ error: "Guía ya despachada, no se puede editar" }, { status: 400 });
    }
  }

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "guia_patch", "guias", { guiaId: params.id, fields: Object.keys(update) }, session?.userName);

  const { data: updated, error } = await supabaseServer.from("guia_transporte").update(update).eq("id", params.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Guía no encontrada o sin cambios" }, { status: 404 });

  // Send email with PDF if dispatched
  if (body.estado === "Completada") {
    const { data: guia } = await supabaseServer.from("guia_transporte").select("*, guia_items(*)").eq("id", params.id).single();
    if (guia) {
      if (guia.guia_items) {
        guia.guia_items = guia.guia_items.filter((i: { deleted?: boolean }) => !i.deleted);
      }
      await sendDispatchEmail(guia as GuiaEmail, session?.userName || session?.role || "sistema");
    }
  }

  return NextResponse.json({ ok: true });
}

// ── DELETE (soft delete) ──

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const { error } = await supabaseServer.from("guia_transporte").update({ deleted: true }).eq("id", id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  const session = getSession(req);
  await logActivity(session?.role || "unknown", "guia_delete", "guias", { guiaId: id }, session?.userName);
  return NextResponse.json({ ok: true });
}
