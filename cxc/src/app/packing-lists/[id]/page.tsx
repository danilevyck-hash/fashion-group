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
  const [muestrasOpen, setMuestrasOpen] = useState(false);

  const loadPL = useCallback(async () => {
    try {
      const res = await fetch(`/api/packing-lists/${id}`);
      if (res.ok) {
        const data = await res.json();
        // Map API response (items with DB column names) to frontend format
        if (data.items && !data.index_rows) {
          data.index_rows = data.items.map((item: { estilo: string; producto: string; total_pcs: number; bultos: Record<string, number>; bulto_muestra: string; is_os?: boolean }) => ({
            estilo: item.estilo,
            producto: item.producto,
            totalPcs: item.total_pcs,
            distribution: item.bultos || {},
            bultoMuestra: item.bulto_muestra || "",
            isOS: item.is_os || false,
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

  // Build bulto groups for "Vista para muestras"
  const bultoGroups = useMemo(() => {
    if (!pl?.index_rows) return [];
    const map = new Map<string, { estilo: string; producto: string; isOS: boolean }[]>();
    for (const row of pl.index_rows) {
      if (!row.bultoMuestra) continue;
      if (!map.has(row.bultoMuestra)) map.set(row.bultoMuestra, []);
      map.get(row.bultoMuestra)!.push({ estilo: row.estilo, producto: row.producto, isOS: row.isOS || false });
    }
    for (const styles of map.values()) {
      styles.sort((a, b) => a.estilo.localeCompare(b.estilo));
    }
    return [...map.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
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
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 14;
    const marginRight = 14;
    const contentRight = pageWidth - marginRight;

    // ── HEADER ──
    doc.addImage(FG_LOGO_BASE64, "JPEG", marginLeft, 10, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(
      `Indice de Estilos por Bulto — PL #${pl.numero_pl}`,
      marginLeft + FG_LOGO_WIDTH + 4,
      16
    );

    const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    let fechaDisplay = pl.fecha_entrega || "";
    if (fechaDisplay && /^\d{4}-\d{2}-\d{2}$/.test(fechaDisplay)) {
      const [y, m, d] = fechaDisplay.split("-");
      fechaDisplay = `${parseInt(d)} de ${meses[parseInt(m) - 1]} ${y}`;
    }

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    const subtitle = `${pl.empresa} · ${fechaDisplay ? fechaDisplay + " · " : ""}${pl.total_estilos} estilos · ${pl.total_piezas.toLocaleString()} piezas · ${pl.total_bultos} bultos`;
    doc.text(subtitle, marginLeft + FG_LOGO_WIDTH + 4, 22);
    doc.text("Muestra = bulto con talla M o 32 · OS = otro tamaño", marginLeft + FG_LOGO_WIDTH + 4, 27);
    doc.setTextColor(0);

    let currentY = 34;

    // ── SECTION 1: Vista para sacar muestras ──
    // Build bulto groups
    const pdfBultoGroups = new Map<string, { estilo: string; producto: string; isOS: boolean }[]>();
    for (const row of pl.index_rows) {
      if (!row.bultoMuestra) continue;
      if (!pdfBultoGroups.has(row.bultoMuestra)) pdfBultoGroups.set(row.bultoMuestra, []);
      pdfBultoGroups.get(row.bultoMuestra)!.push({ estilo: row.estilo, producto: row.producto, isOS: row.isOS || false });
    }
    for (const styles of pdfBultoGroups.values()) {
      styles.sort((a, b) => a.estilo.localeCompare(b.estilo));
    }
    const sortedBultos = [...pdfBultoGroups.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

    if (sortedBultos.length > 0) {
      // Section header
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 58, 95);
      doc.text("Vista para sacar muestras (agrupado por bulto)", marginLeft, currentY);
      currentY += 2;
      doc.setDrawColor(30, 58, 95);
      doc.line(marginLeft, currentY, contentRight, currentY);
      currentY += 4;

      // Draw each bulto block
      const checkboxSize = 2.8; // ~8pt
      const lineHeight = 4.5;
      const indentX = marginLeft + 6;

      for (const [bultoId, styles] of sortedBultos) {
        // Check if we need a page break (header line + all style lines)
        const blockHeight = lineHeight + (styles.length * lineHeight) + 3;
        if (currentY + blockHeight > pageHeight - 15) {
          doc.addPage();
          currentY = 15;
        }

        // Bulto header checkbox + label
        doc.setDrawColor(150);
        doc.setLineWidth(0.3);
        doc.rect(marginLeft, currentY - checkboxSize + 0.5, checkboxSize, checkboxSize);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 40, 60);
        doc.text(
          `Bulto #${bultoId}  ·  ${styles.length} muestra${styles.length > 1 ? "s" : ""}`,
          marginLeft + checkboxSize + 2,
          currentY
        );
        currentY += lineHeight + 0.5;

        // Style rows
        for (const style of styles) {
          doc.setDrawColor(180);
          doc.rect(indentX, currentY - checkboxSize + 0.5, checkboxSize, checkboxSize);
          doc.setFontSize(9);
          doc.setFont("courier", "normal");
          doc.setTextColor(50);
          doc.text(style.estilo, indentX + checkboxSize + 2, currentY);
          // Product description
          const estiloWidth = doc.getTextWidth(style.estilo);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100);
          const productoText = ` —  ${style.producto}`;
          doc.text(productoText, indentX + checkboxSize + 2 + estiloWidth, currentY);
          if (style.isOS) {
            const productoWidth = doc.getTextWidth(productoText);
            doc.setTextColor(150);
            doc.text("  · OS", indentX + checkboxSize + 2 + estiloWidth + productoWidth, currentY);
            doc.setTextColor(50);
          }
          currentY += lineHeight;
        }

        // Separator line between bultos
        currentY += 1;
        doc.setDrawColor(220);
        doc.setLineWidth(0.2);
        doc.line(marginLeft, currentY, contentRight, currentY);
        currentY += 3;
      }
    }

    // ── SECTION 2: Distribución completa por estilo ──
    if (groupedRows.length > 0) {
      // Section header
      currentY += 4;
      if (currentY > pageHeight - 30) {
        doc.addPage();
        currentY = 15;
      }
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 58, 95);
      doc.text("Distribución completa por estilo", marginLeft, currentY);
      currentY += 2;
      doc.setDrawColor(30, 58, 95);
      doc.line(marginLeft, currentY, contentRight, currentY);
      currentY += 4;

      const tableBody: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];
      for (const group of groupedRows) {
        tableBody.push([
          {
            content: group.producto || "SIN PRODUCTO",
            colSpan: 3,
            styles: {
              fillColor: [210, 215, 225],
              fontStyle: "bold",
              fontSize: 9,
              textColor: [30, 40, 60],
            },
          },
        ]);
        for (const row of group.rows) {
          const distParts = Object.entries(row.distribution).map(([bId, pcs]) => `(${bId}: ${pcs})`);
          tableBody.push([row.estilo, String(row.totalPcs), distParts.join("  ")]);
        }
      }

      autoTable(doc, {
        startY: currentY,
        head: [["Estilo", { content: "Total", styles: { halign: "center" } }, "Distribución por Bulto"]],
        body: tableBody,
        headStyles: {
          fillColor: [30, 58, 95],
          textColor: 255,
          fontSize: 8,
          fontStyle: "bold",
        },
        styles: {
          fontSize: 9,
          cellPadding: 1.5,
        },
        columnStyles: {
          0: { cellWidth: 32, font: "courier" },
          1: { cellWidth: 14, halign: "center" },
          2: { cellWidth: "auto" },
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { left: marginLeft, right: marginRight, top: 20 },
      });

      currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    }

    // ── PAGE NUMBERS (final loop only) ──
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(160);
      doc.text(`${i} / ${totalPages}`, pageWidth - marginRight, 8, { align: "right" });
    }

    doc.save(`PL-${pl.numero_pl || "sin-numero"}.pdf`);
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
              <span className="text-gray-400">Muestra = bulto con talla M o 32 · OS = otro tamaño</span>
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
          </div>
        </div>

        {/* Vista para muestras — collapsible */}
        {bultoGroups.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setMuestrasOpen(!muestrasOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <span className="text-sm font-semibold text-[#1e3a5f]">
                Vista para sacar muestras ({bultoGroups.length} bulto{bultoGroups.length !== 1 ? "s" : ""})
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`text-gray-400 transition-transform ${muestrasOpen ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {muestrasOpen && (
              <div className="px-3 py-3 space-y-3 border-t border-gray-200">
                {bultoGroups.map(([bultoId, styles]) => (
                  <div key={bultoId}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 border border-gray-400 rounded-sm flex-shrink-0" />
                      <span className="text-sm font-bold text-gray-700">
                        Bulto #{bultoId} · {styles.length} muestra{styles.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="ml-5 space-y-0.5">
                      {styles.map((s) => (
                        <div key={s.estilo} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 border border-gray-300 rounded-sm flex-shrink-0" />
                          <span className="font-mono text-xs text-gray-600">{s.estilo}</span>
                          <span className="text-xs text-gray-400">— {s.producto}</span>
                          {s.isOS && <span className="text-xs text-gray-300">· OS</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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

        {/* Distribución completa por estilo */}
        {filteredGroups.length > 0 ? (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1e3a5f] text-white">
                    <th className="text-left px-3 py-2.5 font-medium text-xs">Estilo</th>
                    <th className="text-center px-3 py-2.5 font-medium text-xs">Total</th>
                    <th className="text-left px-3 py-2.5 font-medium text-xs">
                      Distribución por Bulto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((group, gi) => (
                    <GroupRows key={gi} group={group} rowOffset={gi} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg">
            <p className="px-3 py-8 text-center text-gray-400 text-sm">
              {search ? "No se encontraron estilos" : "Sin datos de estilos"}
            </p>
          </div>
        )}

        </div>{/* close pl-print-area */}
      </div>

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
        <td colSpan={3} className="px-3 py-2 text-sm font-bold uppercase tracking-wide text-gray-700">
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
