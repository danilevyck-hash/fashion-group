"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import type { PLIndexRow } from "@/lib/parse-packing-list";

interface PLDetail {
  id: string;
  numero_pl: string;
  empresa: string;
  fecha_entrega: string;
  total_bultos: number;
  total_piezas: number;
  total_estilos: number;
  bulto_muestra: string | null;
  index_rows: PLIndexRow[];
  created_at: string;
}

export default function PackingListDetailPage() {
  const { authChecked } = useAuth({
    moduleKey: "packing-lists",
    allowedRoles: ["admin", "secretaria", "bodega", "director", "vendedor"],
  });

  const params = useParams();
  const id = params.id as string;

  const [pl, setPl] = useState<PLDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadPL = useCallback(async () => {
    try {
      const res = await fetch(`/api/packing-lists/${id}`);
      if (res.ok) {
        const data = await res.json();
        // Map API response (items with DB column names) to frontend format
        if (data.items && !data.index_rows) {
          data.index_rows = data.items.map((item: { estilo: string; producto: string; total_pcs: number; bultos: Record<string, number>; bulto_muestra: string }) => ({
            estilo: item.estilo,
            producto: item.producto,
            totalPcs: item.total_pcs,
            distribution: item.bultos || {},
            bultoMuestra: item.bulto_muestra || "",
          }));
        }
        setPl(data);
      } else {
        setError("No se encontró el Packing List");
      }
    } catch {
      setError("Error al cargar datos");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (authChecked) loadPL();
  }, [authChecked, loadPL]);

  // Group rows by product type (sort by producto A-Z, then estilo A-Z)
  const groupedRows = useMemo(() => {
    if (!pl?.index_rows) return [];

    const sorted = [...pl.index_rows].sort((a, b) => {
      const p = a.producto.localeCompare(b.producto);
      if (p !== 0) return p;
      return a.estilo.localeCompare(b.estilo);
    });

    const groups: { producto: string; rows: PLIndexRow[] }[] = [];
    let currentProduct = "";

    for (const row of sorted) {
      if (row.producto !== currentProduct) {
        currentProduct = row.producto;
        groups.push({ producto: currentProduct, rows: [] });
      }
      groups[groups.length - 1].rows.push(row);
    }

    return groups;
  }, [pl]);

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return groupedRows;
    return groupedRows
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => row.estilo.toUpperCase().includes(q)),
      }))
      .filter((group) => group.rows.length > 0);
  }, [groupedRows, search]);

  // PDF generation
  async function generatePDF() {
    if (!pl) return;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } = await import(
      "@/lib/pdf-logo"
    );

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Logo
    doc.addImage(FG_LOGO_BASE64, "JPEG", 14, 10, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);

    // Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(
      `Indice de Estilos por Bulto — PL #${pl.numero_pl}`,
      14 + FG_LOGO_WIDTH + 4,
      16
    );

    // Format date
    const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    let fechaDisplay = pl.fecha_entrega || "";
    if (fechaDisplay && /^\d{4}-\d{2}-\d{2}$/.test(fechaDisplay)) {
      const [y, m, d] = fechaDisplay.split("-");
      fechaDisplay = `${parseInt(d)} de ${meses[parseInt(m) - 1]} ${y}`;
    }

    // Subtitle
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    const subtitle = `${pl.empresa} · ${fechaDisplay ? fechaDisplay + " · " : ""}${pl.total_estilos} estilos · ${pl.total_piezas.toLocaleString()} piezas · ${pl.total_bultos} bultos`;
    doc.text(subtitle, 14 + FG_LOGO_WIDTH + 4, 22);

    doc.text(
      "Muestra = bulto con talla M o 32",
      14 + FG_LOGO_WIDTH + 4,
      27
    );
    doc.setTextColor(0);

    // Build table data with product group headers
    const tableBody: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];

    for (const group of groupedRows) {
      tableBody.push([
        {
          content: group.producto || "SIN PRODUCTO",
          colSpan: 4,
          styles: {
            fillColor: [210, 215, 225],
            fontStyle: "bold",
            fontSize: 9,
            textColor: [30, 40, 60],
          },
        },
      ]);

      for (const row of group.rows) {
        const distParts = Object.entries(row.distribution).map(([bultoId, pcs]) =>
          `(${bultoId}: ${pcs})`
        );

        tableBody.push([
          row.estilo,
          String(row.totalPcs),
          row.bultoMuestra || "-",
          distParts.join("  "),
        ]);
      }
    }

    const pageHeight = doc.internal.pageSize.getHeight();
    const plLabel = `PL #${pl.numero_pl}`;

    autoTable(doc, {
      startY: 32,
      head: [["Estilo", { content: "Total", styles: { halign: "center" } }, { content: "Muestra", styles: { halign: "center" } }, "Distribución por Bulto"]],
      body: tableBody,
      headStyles: {
        fillColor: [30, 58, 95],
        textColor: 255,
        fontSize: 8,
        fontStyle: "bold",
      },
      styles: {
        fontSize: 9,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 30, font: "courier" },
        1: { cellWidth: 12, halign: "center" },
        2: { cellWidth: 16, halign: "center" },
        3: { cellWidth: "auto" },
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 14, right: 14, top: 20 },
      didDrawPage(data) {
        // Page number top-right on every page
        doc.setFontSize(8);
        doc.setTextColor(160);
        doc.text(
          `${data.pageNumber}`,
          pageWidth - 14,
          8,
          { align: "right" }
        );
      },
    });

    // Update page numbers with correct total
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFillColor(255, 255, 255);
      doc.rect(pageWidth - 30, 3, 20, 7, "F");
      doc.setFontSize(8);
      doc.setTextColor(160);
      doc.text(`${i} / ${totalPages}`, pageWidth - 14, 8, { align: "right" });
    }

    doc.save(`PL-${pl.numero_pl || "sin-numero"}.pdf`);
  }

  function handlePrint() {
    // Create a print-only window with just the table content
    const printContent = document.getElementById("pl-print-area");
    if (!printContent) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>PL #${pl?.numero_pl || ""}</title>
      <style>
        body { font-family: -apple-system, sans-serif; margin: 1cm; font-size: 9pt; }
        h1 { font-size: 14pt; margin: 0 0 4px; }
        .sub { font-size: 9pt; color: #666; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1e3a5f; color: white; text-align: left; padding: 5px 6px; font-size: 8pt; }
        td { padding: 4px 6px; border-bottom: 1px solid #eee; font-size: 9pt; }
        tr:nth-child(even) { background: #f8f8f8; }
        .group { background: #d2d7e1 !important; font-weight: bold; font-size: 9pt; }
        .mono { font-family: Courier, monospace; }
        .center { text-align: center; }
        .right { text-align: right; }
        @page { size: letter; margin: 1.5cm; }
      </style></head><body>`);
    win.document.write(printContent.innerHTML);
    win.document.write("</body></html>");
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  if (!authChecked) return null;

  if (loading) {
    return (
      <div>
        <AppHeader
          module="Packing Lists"
          breadcrumbs={[{ label: "Cargando..." }]}
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="h-64 rounded-lg bg-gray-50 border border-gray-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !pl) {
    return (
      <div>
        <AppHeader
          module="Packing Lists"
          breadcrumbs={[{ label: "Error" }]}
        />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 text-center">
          <p className="text-sm text-gray-500">{error || "No encontrado"}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="print:hidden">
        <AppHeader
          module="Packing Lists"
          breadcrumbs={[
            { label: "Historial", onClick: () => window.history.back() },
            { label: `PL #${pl.numero_pl || "—"}` },
          ]}
        />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div id="pl-print-area">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">
              Indice de Estilos por Bulto — PL #{pl.numero_pl || "—"}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {pl.empresa}
              {pl.fecha_entrega && (() => {
                const ms = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
                if (/^\d{4}-\d{2}-\d{2}$/.test(pl.fecha_entrega)) {
                  const [y, m, d] = pl.fecha_entrega.split("-");
                  return ` · ${parseInt(d)} de ${ms[parseInt(m) - 1]} ${y}`;
                }
                return ` · ${pl.fecha_entrega}`;
              })()}
              {pl.total_estilos > 0 && ` · ${pl.total_estilos} estilos`}
              {pl.total_piezas > 0 && ` · ${pl.total_piezas.toLocaleString()} piezas`}
              {pl.total_bultos > 0 && ` · ${pl.total_bultos} bultos`}
              {" · "}
              <span className="text-gray-400">Muestra = bulto con talla M o 32</span>
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={generatePDF}
              className="flex items-center gap-1.5 px-4 py-2 border border-teal-500 text-teal-600 text-sm rounded-md hover:bg-teal-50 active:scale-[0.97] transition-all min-h-[44px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Descargar PDF
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 border border-teal-500 text-teal-600 text-sm rounded-md hover:bg-teal-50 active:scale-[0.97] transition-all min-h-[44px]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Imprimir
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="print:hidden">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar estilo..."
            className="w-full sm:w-64 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        {/* Index table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1e3a5f] text-white">
                  <th className="text-left px-3 py-2.5 font-medium text-xs">Estilo</th>
                  <th className="text-center px-3 py-2.5 font-medium text-xs">Total</th>
                  <th className="text-center px-3 py-2.5 font-medium text-xs">Muestra</th>
                  <th className="text-left px-3 py-2.5 font-medium text-xs">
                    Distribución por Bulto
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-gray-400 text-sm">
                      {search ? "No se encontraron estilos" : "Sin datos de estilos"}
                    </td>
                  </tr>
                )}
                {filteredGroups.map((group, gi) => (
                  <GroupRows key={gi} group={group} rowOffset={gi} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>{/* close pl-print-area */}
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { margin: 0 !important; padding: 0 !important; }
          .print\\:hidden, nav, header, [class*="sticky"], [class*="AppHeader"],
          button, [class*="print:hidden"] { display: none !important; }
          .max-w-6xl, .max-w-7xl { max-width: 100% !important; padding: 0 8px !important; margin: 0 !important; }
          .space-y-4 > * + * { margin-top: 8px !important; }
          table { font-size: 9pt !important; width: 100% !important; border-collapse: collapse !important; }
          td, th { padding: 4px 6px !important; }
          .border { border: 1px solid #ddd !important; }
          .rounded-lg { border-radius: 0 !important; }
          .overflow-hidden { overflow: visible !important; }
          @page { size: letter; margin: 1.5cm; }
        }
      `}</style>
    </div>
  );
}

function GroupRows({
  group,
  rowOffset,
}: {
  group: { producto: string; rows: PLIndexRow[] };
  rowOffset: number;
}) {
  return (
    <>
      {/* Product group header */}
      <tr className="bg-gray-200">
        <td colSpan={4} className="px-3 py-2 text-sm font-bold text-gray-700 uppercase tracking-wide">
          {group.producto || "SIN PRODUCTO"}
        </td>
      </tr>
      {group.rows.map((row, ri) => (
        <tr
          key={`${rowOffset}-${ri}`}
          className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
        >
          <td className="px-3 py-1.5 font-mono text-xs">{row.estilo}</td>
          <td className="px-3 py-1.5 text-xs text-center tabular-nums font-medium">
            {row.totalPcs}
          </td>
          <td className="px-3 py-1.5 text-xs text-center font-mono text-gray-600">
            {row.bultoMuestra || "-"}
          </td>
          <td className="px-3 py-1.5 text-xs">
            <div className="flex flex-wrap gap-1">
              {Object.entries(row.distribution).map(([bultoId, pcs]) => (
                <span
                  key={bultoId}
                  className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-gray-100 text-gray-600"
                >
                  ({bultoId}: {pcs})
                </span>
              ))}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
