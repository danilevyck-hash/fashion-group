"use client";

// Reporte detallado de comisión de un vendedor (período) — tab Comisiones.
// Replica el Excel manual: sección VENTAS, sección COBROS, cierre.
// Exporta a Excel (xlsx-js-style) y es imprimible.
//
// Print: cae en EXACTAMENTE 2 páginas fijas (letter landscape, definido en
// globals.css). Página 1 = VENTAS, página 2 = COBROS + CIERRE. Para mantener la
// fuente legible (piso 8px) el layout de impresión es tipo periódico: las filas
// de cada sección se reparten en N bloques (1..3) lado a lado, cada bloque es su
// propia <table> con su propio <thead>. N columnas multiplican la capacidad
// vertical por bloque. Estilos print scopeados aquí (no en globals.css, que es
// compartido con Guías/Caja). La vista de pantalla NO cambia (tabla única).

import { useEffect, useState } from "react";
import { X, Download, Printer } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { fmtDate } from "@/lib/format";
import { exportComisionDetalle, tipoDocCorto, type ComisionDetalle, type ComisionDescuento, type VentaDoc, type CobroDoc } from "@/lib/ventas/comisionExcel";
import { ModalOverlay } from "@/components/ui";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Fecha compacta para los bloques de impresión: día + mes, SIN año (el mes/año
// ya va en el header compacto y todas las filas son del mismo mes). Reusa el
// parseo de fmtDate ("5 jul 2026" → "5 jul") para ahorrar ancho en 3 columnas.
function fmtDateShort(d: string): string {
  const parts = fmtDate(d).split(" ");
  return parts.length >= 3 ? parts.slice(0, 2).join(" ") : fmtDate(d);
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// ── Layout de impresión: (tier, N bloques) por sección ───────────────────────
// Capacidad VERTICAL por bloque (una columna) medida empíricamente en letter
// landscape con margen 1.5cm imprimiendo a PDF (ver PR #217). Con N bloques lado
// a lado la capacidad total = capacidad_por_bloque(tier) × N.
//   VENTAS: solo su tabla → más capacidad.
//   COBROS: además carga la caja CIERRE + totales → menos capacidad.
const VENTAS_CAP: Record<string, number> = {
  "cds-s0": 21, "cds-s1": 26, "cds-s2": 33, "cds-s3": 41,
  "cds-s4": 52, "cds-s5": 64, "cds-s6": 76, "cds-s7": 94, "cds-s8": 112,
};
const COBROS_CAP: Record<string, number> = {
  "cds-s0": 11, "cds-s1": 15, "cds-s2": 19, "cds-s3": 24,
  "cds-s4": 30, "cds-s5": 37, "cds-s6": 44, "cds-s7": 54, "cds-s8": 65,
};
// Piso de fuente = s2 (8px). Se prioriza FUENTE GRANDE sobre menos columnas:
// se itera el tier por fuera (s0→s1→s2) y N por dentro (1→2→3); primera combo
// donde filas ≤ cap(tier)×N. Si ni s2×3 alcanza, se sigue bajando tier con N=3.
const MAIN_TIERS = ["cds-s0", "cds-s1", "cds-s2"];
const OVERFLOW_TIERS = ["cds-s3", "cds-s4", "cds-s5", "cds-s6", "cds-s7", "cds-s8"];

function pickLayout(rows: number, cap: Record<string, number>): { tier: string; n: number } {
  for (const t of MAIN_TIERS) {
    for (let n = 1; n <= 3; n++) {
      if (rows <= cap[t] * n) return { tier: t, n };
    }
  }
  for (const t of OVERFLOW_TIERS) {
    if (rows <= cap[t] * 3) return { tier: t, n: 3 };
  }
  return { tier: "cds-s8", n: 3 };
}

// Reparte filas en N bloques en orden column-major (bloque 1 = filas 1..k,
// bloque 2 = k+1..2k, …), como en el mockup aprobado.
function splitColumnMajor<T>(arr: T[], n: number): T[][] {
  const k = Math.max(1, Math.ceil(arr.length / n));
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += k) out.push(arr.slice(i, i + k));
  return out.length ? out : [[]];
}

// Anchos de columna por bloque (table-layout:fixed). Cliente se lleva el sobrante
// y trunca con ellipsis; las demás columnas van nowrap y NO se recortan. Calibrado
// para el peor caso HORIZONTAL: 3 bloques a 11px (la fuente más grande que llega
// a 3 columnas). Con fecha corta "5 jul" (sin año) entran Fecha/Factura/Tipo/
// Subtotal completas y Cliente trunca. Padding horizontal fijo 3px.
const VENTAS_COLS = ["15%", "23%", "24%", "12%", "26%"];
const COBROS_COLS = ["18%", "48%", "34%"];

function VentasPrintBlocks({ rows, n }: { rows: VentaDoc[]; n: number }) {
  if (rows.length === 0) return <p className="cds-empty">Sin ventas comisionables.</p>;
  const blocks = splitColumnMajor(rows, n);
  return (
    <div className="cds-blocks" style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
      {blocks.map((block, bi) => (
        <div key={bi} className="cds-block" style={{ flex: "1 1 0", minWidth: 0 }}>
          <table className="cds-block-table">
            <colgroup>{VENTAS_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Factura</th>
                <th className="cds-col-center">Tipo</th>
                <th className="cds-col-num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {block.map((v, i) => (
                <tr key={i} className={v.subtotal < 0 ? "cds-row-neg" : ""}>
                  <td>{fmtDateShort(v.fecha)}</td>
                  <td>{v.cliente}</td>
                  <td className="cds-col-muted">{v.secuencial}</td>
                  <td className="cds-col-center cds-col-muted">{tipoDocCorto(v.tipo)}</td>
                  <td className="cds-col-num">{fmtMoney(v.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function CobrosPrintBlocks({ rows, n }: { rows: CobroDoc[]; n: number }) {
  if (rows.length === 0) return <p className="cds-empty">Sin cobros comisionables.</p>;
  const blocks = splitColumnMajor(rows, n);
  return (
    <div className="cds-blocks" style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
      {blocks.map((block, bi) => (
        <div key={bi} className="cds-block" style={{ flex: "1 1 0", minWidth: 0 }}>
          <table className="cds-block-table">
            <colgroup>{COBROS_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th className="cds-col-num">Monto</th>
              </tr>
            </thead>
            <tbody>
              {block.map((c, i) => (
                <tr key={i}>
                  <td>{fmtDateShort(c.fecha)}</td>
                  <td>{c.cliente}</td>
                  <td className="cds-col-num">{fmtMoney(c.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

interface Props {
  empresa: string;
  empresaNombre: string;
  year: number;
  mes: number;
  vendedor: string;
  onClose: () => void;
}

export function ComisionesDetalleModal({ empresa, empresaNombre, year, mes, vendedor, onClose }: Props) {
  const [data, setData] = useState<ComisionDetalle | null>(null);
  const [descuentos, setDescuentos] = useState<ComisionDescuento[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = `empresa=${empresa}&year=${year}&mes=${mes}&vendedor=${encodeURIComponent(vendedor)}`;
        const [resDet, resDesc] = await Promise.all([
          fetch(`/api/ventas/comisiones/detalle?${qs}`, { cache: "no-store" }),
          fetch(`/api/ventas/comisiones/descuentos?${qs}`, { cache: "no-store" }),
        ]);
        if (!resDet.ok) {
          const b = await resDet.json().catch(() => ({}));
          throw new Error(b.error ?? `HTTP ${resDet.status}`);
        }
        if (alive) setData((await resDet.json()) as ComisionDetalle);
        // Los descuentos son opcionales (solo algunos vendedores los tienen).
        if (resDesc.ok) {
          const dj = (await resDesc.json()) as { descuentos?: ComisionDescuento[] };
          if (alive) setDescuentos(Array.isArray(dj.descuentos) ? dj.descuentos : []);
        } else if (alive) {
          setDescuentos([]);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "No se pudo cargar.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [empresa, year, mes, vendedor]);

  async function toggleDescuento(id: string, activo: boolean) {
    if (togglingId) return;
    setTogglingId(id);
    // Optimista: refleja el cambio y revierte si falla.
    setDescuentos((prev) => prev.map((d) => (d.id === id ? { ...d, activo } : d)));
    try {
      const res = await fetch(`/api/ventas/comisiones/descuentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descuento_id: id, year, mes, activo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setDescuentos((prev) => prev.map((d) => (d.id === id ? { ...d, activo: !activo } : d)));
    } finally {
      setTogglingId(null);
    }
  }

  const descActivos = descuentos.filter((d) => d.activo);
  const totalAPagar = data
    ? round2(data.comision_total - descActivos.reduce((s, d) => s + d.monto, 0))
    : 0;

  const pctTasaV = data ? (data.tasa_venta * 100).toFixed(2) : "";
  const pctTasaC = data ? (data.tasa_cobro * 100).toFixed(2) : "";

  // Layout de impresión por sección (fuente + N columnas). Para cobros, si hay
  // más de 3 descuentos la caja de cierre crece: se suman esas filas extra al
  // conteo para bajar la utilización (elige tier más chico o más columnas).
  const ventasLayout = data ? pickLayout(data.ventas.length, VENTAS_CAP) : { tier: "cds-s0", n: 1 };
  const cobrosRowsEff = data ? data.cobros.length + Math.max(0, descuentos.length - 3) : 0;
  const cobrosLayout = data ? pickLayout(cobrosRowsEff, COBROS_CAP) : { tier: "cds-s0", n: 1 };

  // Header compacto (una línea), repetido arriba de cada página en print.
  const headerLinea = `Comisión — ${vendedor.toUpperCase()} · ${empresaNombre} · ${MESES[mes - 1]} ${year}`;
  const compactHeader = (
    <div className="cds-print-header mb-2 hidden items-baseline justify-between border-b border-gray-300 pb-1 text-[11px] print:flex">
      <span className="font-semibold text-gray-900">{headerLinea}</span>
      <span className="font-semibold text-gray-900">Fashion Group</span>
    </div>
  );

  return (
    <ModalOverlay
      align="start"
      backdropClassName="bg-black/40"
      className="overflow-y-auto p-4 print:static print:block print:bg-white print:p-0"
    >
      {/* Estilos print scopeados a este reporte (globals.css es compartido). */}
      <style>{`
        @media print {
          /* Cobros arranca en su propia página → reporte fijo de 2 páginas. */
          #print-document .cds-cobros { break-before: page; page-break-before: always; }
          /* Nunca partir una fila ni la caja de cierre entre páginas. */
          #print-document tr,
          #print-document .cds-cierre { page-break-inside: avoid; break-inside: avoid; }

          /* ── Bloques tipo periódico ── */
          #print-document .cds-block-table {
            width: 100%; table-layout: fixed; border-collapse: collapse;
          }
          #print-document .cds-block-table th {
            text-align: left; font-weight: 500; text-transform: uppercase;
            letter-spacing: 0.02em; color: #6b7280;
            border-bottom: 1px solid #d1d5db;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          }
          #print-document .cds-block-table td {
            color: #1f2937; border-bottom: 1px solid #f3f4f6;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          }
          #print-document .cds-block-table .cds-col-muted { color: #6b7280; }
          #print-document .cds-block-table .cds-col-num { text-align: right; font-variant-numeric: tabular-nums; }
          #print-document .cds-block-table .cds-col-center { text-align: center; }
          #print-document .cds-block-table tr.cds-row-neg td { color: #e11d48; }
          #print-document .cds-empty { color: #9ca3af; font-size: 11px; padding: 8px 0; }

          /* Total a ancho completo debajo de los bloques. */
          #print-document .cds-total-line {
            border-top: 1.5px solid #d1d5db; margin-top: 4px; padding-top: 4px;
            font-size: 11px; font-weight: 600; color: #111827;
          }

          /* Auto-reducción de fuente + padding VERTICAL por tier (controla el
             alto de fila = capacidad). El padding horizontal es fijo (abajo)
             para no recortar fechas/facturas/montos en bloques angostos. */
          #print-document .cds-s0 table { font-size: 11px; }
          #print-document .cds-s0 table th,
          #print-document .cds-s0 table td { padding-top: 4px !important; padding-bottom: 4px !important; }
          #print-document .cds-s1 table { font-size: 9.5px; }
          #print-document .cds-s1 table th,
          #print-document .cds-s1 table td { padding-top: 3px !important; padding-bottom: 3px !important; }
          #print-document .cds-s2 table { font-size: 8px; }
          #print-document .cds-s2 table th,
          #print-document .cds-s2 table td { padding-top: 2px !important; padding-bottom: 2px !important; }
          #print-document .cds-s3 table { font-size: 7px; }
          #print-document .cds-s3 table th,
          #print-document .cds-s3 table td { padding-top: 1.2px !important; padding-bottom: 1.2px !important; }
          #print-document .cds-s4 table { font-size: 6px; }
          #print-document .cds-s4 table th,
          #print-document .cds-s4 table td { padding-top: 0.7px !important; padding-bottom: 0.7px !important; }
          #print-document .cds-s5 table { font-size: 5px; }
          #print-document .cds-s5 table th,
          #print-document .cds-s5 table td { padding-top: 0.4px !important; padding-bottom: 0.4px !important; }
          #print-document .cds-s6 table { font-size: 4.2px; }
          #print-document .cds-s6 table th,
          #print-document .cds-s6 table td { padding-top: 0.3px !important; padding-bottom: 0.3px !important; }
          #print-document .cds-s7 table { font-size: 3.4px; }
          #print-document .cds-s7 table th,
          #print-document .cds-s7 table td { padding-top: 0.2px !important; padding-bottom: 0.2px !important; }
          #print-document .cds-s8 table { font-size: 2.9px; }
          #print-document .cds-s8 table th,
          #print-document .cds-s8 table td { padding-top: 0.15px !important; padding-bottom: 0.15px !important; }
          /* Padding horizontal fijo y chico (no afecta el alto = capacidad). */
          #print-document .cds-block-table th,
          #print-document .cds-block-table td { padding-left: 3px !important; padding-right: 3px !important; }
        }
      `}</style>
      {/* id="print-document": globals.css oculta todo en @media print salvo este
          nodo; sin él, window.print() imprime una hoja en blanco. */}
      <div id="print-document" className="my-6 w-full max-w-3xl rounded-lg border border-gray-200 bg-white shadow-lg print:my-0 print:max-w-full print:border-0 print:shadow-none">
        {/* Header de pantalla (título + botones). Todo print:hidden — en print
            manda el header compacto de una línea. */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 print:hidden">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Comisión — {vendedor}</h2>
            <p className="text-xs text-gray-500">{empresaNombre} · {MESES[mes - 1]} {year}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => data && exportComisionDetalle(data, empresaNombre, descActivos)}
              disabled={!data}
              className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-sm text-white transition active:scale-[0.97] disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:border-black active:scale-[0.97]"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </button>
            <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-4 print:p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Cargando…</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-rose-600">{error}</div>
          ) : data ? (
            <div className="space-y-6 print:space-y-0">
              {/* ══════════ PÁGINA 1 — VENTAS ══════════ */}
              <section className="cds-ventas">
                {compactHeader}
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Ventas</h3>

                {/* PANTALLA: tabla única (sin cambios). */}
                <div className="print:hidden overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 font-medium">Factura</th>
                        <th className="px-3 py-2 text-center font-medium">Tipo</th>
                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                        <th className="px-3 py-2 text-right font-medium">% Util.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ventas.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">Sin ventas comisionables.</td></tr>
                      ) : data.ventas.map((v, i) => (
                        <tr key={i} className={`border-b border-gray-100 last:border-0 ${v.subtotal < 0 ? "text-rose-600" : "text-gray-800"}`}>
                          <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(v.fecha)}</td>
                          <td className="px-3 py-1.5">{v.cliente}</td>
                          <td className="px-3 py-1.5 tabular-nums text-gray-500">{v.secuencial}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums text-gray-500">{tipoDocCorto(v.tipo)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(v.subtotal)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{v.tipo === "Nota de Crédito" || v.pct_utilidad == null || !Number.isFinite(v.pct_utilidad) ? "—" : `${v.pct_utilidad.toFixed(1)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                        <td className="px-3 py-2" colSpan={4}>TOTAL VENTAS</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.ventas_base)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* IMPRESIÓN: bloques tipo periódico + total a ancho completo. */}
                <div className={`hidden print:block ${ventasLayout.tier}`}>
                  <VentasPrintBlocks rows={data.ventas} n={ventasLayout.n} />
                  <div className="cds-total-line flex items-center justify-between">
                    <span>TOTAL VENTAS</span>
                    <span className="tabular-nums">{fmtMoney(data.ventas_base)}</span>
                  </div>
                </div>
              </section>

              {/* ══════════ PÁGINA 2 — COBROS + CIERRE ══════════ */}
              <section className="cds-cobros">
                {compactHeader}
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Cobros</h3>

                {/* PANTALLA: tabla única (sin cambios). */}
                <div className="print:hidden overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 text-right font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cobros.length === 0 ? (
                        <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">Sin cobros comisionables.</td></tr>
                      ) : data.cobros.map((c, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0 text-gray-800">
                          <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(c.fecha)}</td>
                          <td className="px-3 py-1.5">{c.cliente}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(c.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                        <td className="px-3 py-2" colSpan={2}>TOTAL COBROS</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.cobros_base)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="mt-1 text-xs text-gray-400 print:hidden">El API de Switch no expone el número de recibo.</p>

                {/* IMPRESIÓN: bloques tipo periódico + total a ancho completo. */}
                <div className={`hidden print:block ${cobrosLayout.tier}`}>
                  <CobrosPrintBlocks rows={data.cobros} n={cobrosLayout.n} />
                  <div className="cds-total-line flex items-center justify-between">
                    <span>TOTAL COBROS</span>
                    <span className="tabular-nums">{fmtMoney(data.cobros_base)}</span>
                  </div>
                </div>

                {/* Suma de las BASES sobre las que se comisiona (no de las comisiones). */}
                <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 print:mt-2">
                  <span>TOTAL VENTAS + COBROS</span>
                  <span className="tabular-nums">{fmtMoney(round2(data.ventas_base + data.cobros_base))}</span>
                </div>

                {/* CIERRE */}
                <section className="cds-cierre mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 print:mt-2 print:p-3">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Cierre</h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Ventas {fmtMoney(data.ventas_base)} × {pctTasaV}%</dt>
                      <dd className="tabular-nums text-gray-900">{fmtMoney(data.comision_venta)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-600">Cobros {fmtMoney(data.cobros_base)} × {pctTasaC}%</dt>
                      <dd className="tabular-nums text-gray-900">{fmtMoney(data.comision_cobro)}</dd>
                    </div>
                    {descuentos.length === 0 ? (
                      <div className="flex justify-between border-t border-gray-300 pt-1.5 text-base font-semibold">
                        <dt>Comisión total</dt>
                        <dd className="tabular-nums">{fmtMoney(data.comision_total)}</dd>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between border-t border-gray-300 pt-1.5 font-semibold text-gray-900">
                          <dt>Subtotal comisión</dt>
                          <dd className="tabular-nums">{fmtMoney(data.comision_total)}</dd>
                        </div>
                        {/* Descuento inactivo: fila oculta en print (no es deducción del mes). */}
                        {descuentos.map((d) => (
                          <div key={d.id} className={`flex items-center justify-between ${d.activo ? "" : "print:hidden"}`}>
                            <dt className="flex items-center gap-2 text-gray-600">
                              {/* Toggle: solo pantalla (secretaria/admin). No sale en print. */}
                              <label className="print:hidden inline-flex cursor-pointer items-center" title={d.activo ? "Activo este mes — clic para desactivar" : "Desactivado este mes — clic para activar"}>
                                <input
                                  type="checkbox"
                                  className="peer sr-only"
                                  checked={d.activo}
                                  disabled={togglingId === d.id}
                                  onChange={(e) => toggleDescuento(d.id, e.target.checked)}
                                />
                                <span className="relative h-4 w-7 rounded-full bg-gray-300 transition peer-checked:bg-gray-900 after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-3" />
                              </label>
                              <span className={d.activo ? "" : "text-gray-400 line-through"}>{d.concepto}</span>
                            </dt>
                            <dd className={`tabular-nums ${d.activo ? "text-rose-600" : "text-gray-300"}`}>−{fmtMoney(d.monto)}</dd>
                          </div>
                        ))}
                        <div className="flex justify-between border-t border-gray-300 pt-1.5 text-base font-semibold">
                          <dt>Total a pagar</dt>
                          <dd className="tabular-nums">{fmtMoney(totalAPagar)}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                </section>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </ModalOverlay>
  );
}
