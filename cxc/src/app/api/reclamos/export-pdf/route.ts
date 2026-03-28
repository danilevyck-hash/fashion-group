import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

async function fetchReclamos(ids: string[]) {
  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*)")
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (error) { console.error(error); throw new Error("Error al cargar reclamos"); }
  return data || [];
}

function buildPdf(reclamos: Record<string, unknown>[]) {
  const empresa = (reclamos[0]?.empresa as string) || "Export";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  // Header
  doc.setFillColor(27, 58, 92);
  doc.rect(0, 0, 220, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("FASHION GROUP", 108, 10, { align: "center" });
  doc.setFontSize(10);
  doc.text(`Reclamos — ${empresa}`, 108, 17, { align: "center" });

  // Subtitle with date
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.text(`Exportado el ${new Date().toLocaleDateString("es-HN")}`, 108, 26, { align: "center" });

  // Table data
  let grandTotal = 0;
  const rows = reclamos.map((r) => {
    const items = (r.reclamo_items as Record<string, unknown>[]) || [];
    const subtotal = items.reduce(
      (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0),
      0
    );
    const total = subtotal * 1.177;
    grandTotal += total;

    const itemsDesc = items
      .map((i) => `${i.descripcion || "Item"} x ${Number(i.cantidad) || 0}`)
      .join(", ");

    return [
      r.nro_reclamo as string || "",
      fmtDate((r.fecha_reclamo as string) || ""),
      r.nro_factura as string || "",
      r.estado as string || "",
      itemsDesc,
      `$${total.toFixed(2)}`,
    ];
  });

  // Footer row
  rows.push(["", "", "", "", "TOTAL", `$${grandTotal.toFixed(2)}`]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    startY: 30,
    head: [["N° Reclamo", "Fecha", "Factura", "Estado", "Items", "Total"]],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [27, 58, 92], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 249, 249] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 20 },
      2: { cellWidth: 30 },
      3: { cellWidth: 22 },
      4: { cellWidth: "auto" },
      5: { halign: "right", cellWidth: 22 },
    },
    didParseCell: (data: { row: { index: number }; cell: { styles: { fontStyle: string; fillColor: number[] } } }) => {
      if (data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [232, 232, 232];
      }
    },
  });

  // Footer with page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generado el ${new Date().toLocaleDateString("es-HN")}`, 15, 270);
    doc.text(`Página ${i} de ${pageCount}`, 200, 270, { align: "right" });
  }

  return { doc, empresa };
}

export async function POST(req: NextRequest) {
  try {
    const { ids } = await req.json();
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No IDs" }, { status: 400 });
    }

    const reclamos = await fetchReclamos(ids);
    if (!reclamos.length) {
      return NextResponse.json({ error: "No reclamos found" }, { status: 404 });
    }

    const { doc, empresa } = buildPdf(reclamos);
    const buf = doc.output("arraybuffer");
    const filename = `Reclamos-${empresa}-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(Buffer.from(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const empresa = req.nextUrl.searchParams.get("empresa");
    if (!empresa) {
      return NextResponse.json({ error: "Missing empresa param" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("reclamos")
      .select("*, reclamo_items(*)")
      .eq("empresa", empresa)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "No reclamos found" }, { status: 404 });
    }

    const { doc } = buildPdf(data);
    const buf = doc.output("arraybuffer");
    const filename = `Reclamos-${empresa}-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(Buffer.from(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
