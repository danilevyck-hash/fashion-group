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

    // Subtitle
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    const subtitle = `${pl.empresa} · ${pl.total_estilos} estilos · ${pl.total_piezas.toLocaleString()} piezas · ${pl.total_bultos} bultos`;
    doc.text(subtitle, 14 + FG_LOGO_WIDTH + 4, 22);

    if (pl.bulto_muestra) {
      doc.text(
        `Bulto resaltado = muestra (${pl.bulto_muestra})`,
        14 + FG_LOGO_WIDTH + 4,
        27
      );
    }
    doc.setTextColor(0);

    // Build table data with product group headers
    const tableBody: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];

    for (const group of groupedRows) {
      tableBody.push([
        {
          content: group.producto || "SIN PRODUCTO",
          colSpan: 4,
          styles: {
            fillColor: [235, 235, 235],
            fontStyle: "bold",
            fontSize: 8,
            textColor: [60, 60, 60],
          },
        },
      ]);

      for (const row of group.rows) {
        const distParts = Object.entries(row.distribution).map(([bultoId, pcs]) => {
          const isMuestra = row.bultoMuestra && bultoId === row.bultoMuestra;
          return isMuestra ? `**(${bultoId}: ${pcs}pcs)**` : `(${bultoId}: ${pcs}pcs)`;
        });

        tableBody.push([
          row.estilo,
          row.producto,
          String(row.totalPcs),
          distParts.join("  "),
        ]);
        bodyIdx++;
      }
    }

    autoTable(doc, {
      startY: 32,
      head: [["Estilo", "Producto", "Total", "Distribución por Bulto"]],
      body: tableBody,
      headStyles: {
        fillColor: [30, 58, 95],
        textColor: 255,
        fontSize: 8,
        fontStyle: "bold",
      },
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
      },
      columnStyles: {
        0: { cellWidth: 28, font: "courier" },
        1: { cellWidth: 35 },
        2: { cellWidth: 15, halign: "right" },
        3: { cellWidth: "auto" },
      },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 14, right: 14 },
      didParseCell(data) {
        // Clean ** markers from distribution text (used for web bold, not needed in PDF)
        if (data.section === "body" && data.column.index === 3) {
          const raw = String(data.cell.raw || "");
          if (raw.includes("**")) {
            // Replace **(...)**  with [...] to visually distinguish muestra in PDF
            data.cell.text = [raw.replace(/\*\*\(([^)]+)\)\*\*/g, "[$1]").replace(/\*\*/g, "")];
          }
        }
      },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text(
        `PL #${pl.numero_pl} — Pag ${i}/${pageCount}`,
        pageWidth - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: "right" }
      );
    }

    doc.save(`PL-${pl.numero_pl || "sin-numero"}.pdf`);
  }

  function handlePrint() {
    window.print();
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
      <AppHeader
        module="Packing Lists"
        breadcrumbs={[
          { label: "Historial", onClick: () => window.history.back() },
          { label: `PL #${pl.numero_pl || "—"}` },
        ]}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">
              Indice de Estilos por Bulto — PL #{pl.numero_pl || "—"}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {pl.empresa}
              {pl.total_estilos > 0 && ` · ${pl.total_estilos} estilos`}
              {pl.total_piezas > 0 && ` · ${pl.total_piezas.toLocaleString()} piezas`}
              {pl.total_bultos > 0 && ` · ${pl.total_bultos} bultos`}
              {" · "}
              <span className="font-semibold text-gray-600">[bulto en negrita]</span>
              <span className="text-gray-400"> = muestra M / dim 32</span>
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

        {/* Index table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1e3a5f] text-white">
                  <th className="text-left px-3 py-2.5 font-medium text-xs">Estilo</th>
                  <th className="text-left px-3 py-2.5 font-medium text-xs">Producto</th>
                  <th className="text-right px-3 py-2.5 font-medium text-xs">Total</th>
                  <th className="text-left px-3 py-2.5 font-medium text-xs">
                    Distribución por Bulto
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupedRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-gray-400 text-sm">
                      Sin datos de estilos
                    </td>
                  </tr>
                )}
                {groupedRows.map((group, gi) => (
                  <GroupRows key={gi} group={group} bultoMuestra={pl.bulto_muestra} rowOffset={gi} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          nav, header > div:first-child { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function GroupRows({
  group,
  bultoMuestra,
  rowOffset,
}: {
  group: { producto: string; rows: PLIndexRow[] };
  bultoMuestra: string | null;
  rowOffset: number;
}) {
  return (
    <>
      {/* Product group header */}
      <tr className="bg-gray-100">
        <td colSpan={4} className="px-3 py-1.5 text-xs font-bold text-gray-600 uppercase tracking-wide">
          {group.producto || "SIN PRODUCTO"}
        </td>
      </tr>
      {group.rows.map((row, ri) => (
        <tr
          key={`${rowOffset}-${ri}`}
          className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
        >
          <td className="px-3 py-1.5 font-mono text-xs">{row.estilo}</td>
          <td className="px-3 py-1.5 text-xs text-gray-600">{row.producto}</td>
          <td className="px-3 py-1.5 text-xs text-right tabular-nums font-medium">
            {row.totalPcs}
          </td>
          <td className="px-3 py-1.5 text-xs">
            <div className="flex flex-wrap gap-1">
              {Object.entries(row.distribution).map(([bultoId, pcs]) => (
                <span
                  key={bultoId}
                  className={`inline-block px-1.5 py-0.5 rounded text-[11px] ${
                    row.bultoMuestra && bultoId === row.bultoMuestra
                      ? "bg-gray-200 text-gray-900 font-bold"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  ({bultoId}: {pcs}pcs)
                </span>
              ))}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
