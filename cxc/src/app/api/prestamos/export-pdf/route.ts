import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

export async function GET(req: NextRequest) {
  const quincena = req.nextUrl.searchParams.get("quincena") || "1";
  const mes = req.nextUrl.searchParams.get("mes") || String(new Date().getMonth() + 1);
  const año = req.nextUrl.searchParams.get("año") || String(new Date().getFullYear());

  const meses = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const periodoLabel = `${quincena === "1" ? "1ra" : "2da"} Quincena de ${meses[Number(mes)]} ${año}`;

  const { data, error } = await supabaseServer
    .from("prestamos_empleados")
    .select("*, prestamos_movimientos(*)")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const empleados = (data || []).filter((emp) => {
    const movs = emp.prestamos_movimientos || [];
    const prestado = movs
      .filter((m: { concepto: string; estado: string }) => (m.concepto === "Préstamo" || m.concepto === "Responsabilidad por daño") && m.estado === "aprobado")
      .reduce((s: number, m: { monto: number }) => s + Number(m.monto), 0);
    const pagado = movs
      .filter((m: { concepto: string; estado: string }) => (m.concepto === "Pago" || m.concepto === "Abono extra" || m.concepto === "Pago de responsabilidad") && m.estado === "aprobado")
      .reduce((s: number, m: { monto: number }) => s + Number(m.monto), 0);
    return prestado - pagado > 0;
  });

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  // Header
  doc.setFillColor(27, 58, 92);
  doc.rect(0, 0, 220, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("FASHION GROUP", 108, 10, { align: "center" });
  doc.setFontSize(10);
  doc.text(`Reporte de Deducciones Quincenales — ${periodoLabel}`, 108, 17, { align: "center" });

  // Table
  let total = 0;
  const rows = empleados.map((emp) => {
    total += Number(emp.deduccion_quincenal);
    return [emp.nombre, emp.empresa || "", `$${Number(emp.deduccion_quincenal).toFixed(2)}`];
  });

  rows.push(["TOTAL", "", `$${total.toFixed(2)}`]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (doc as any).autoTable({
    startY: 28,
    head: [["Empleado", "Empresa", "Deducción Quincenal"]],
    body: rows,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [27, 58, 92], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 249, 249] },
    columnStyles: { 2: { halign: "right" } },
    didParseCell: (data: { row: { index: number }; cell: { styles: { fontStyle: string; fillColor: number[] } } }) => {
      if (data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [232, 232, 232];
      }
    },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generado el ${new Date().toLocaleDateString("es-HN")}`, 15, 270);
    doc.text(`Página ${i} de ${pageCount}`, 200, 270, { align: "right" });
  }

  const buf = doc.output("arraybuffer");
  const filename = `reporte-deducciones-${quincena === "1" ? "1ra" : "2da"}-quincena-${meses[Number(mes)]?.toLowerCase()}-${año}.pdf`;

  return new NextResponse(Buffer.from(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
