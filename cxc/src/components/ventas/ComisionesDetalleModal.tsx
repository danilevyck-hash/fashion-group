"use client";

// Reporte detallado de comisión de un vendedor (período) — tab Comisiones.
// Replica el Excel manual: sección VENTAS, sección COBROS, cierre.
// Exporta a Excel (xlsx-js-style) y es imprimible.
//
// Print: cae en EXACTAMENTE 2 páginas fijas (letter landscape). Página 1 =
// VENTAS, página 2 = COBROS + CIERRE. Para mantener la fuente legible (piso 8px)
// el layout de impresión es tipo periódico: las filas de cada sección se
// reparten en N bloques (1..3) lado a lado, cada bloque es su propia <table> con
// su propio <thead>. N columnas multiplican la capacidad vertical por bloque.
// Estilos print scopeados aquí (no en globals.css, que es compartido con
// Guías/Caja). La vista de pantalla NO cambia (tabla única).
//
// GOTCHA (por qué el portal): ModalOverlay llama useBodyScrollLock, que deja el
// <body> en `position:fixed; top:-Ypx; overflow:hidden` mientras el modal está
// abierto. Un body fijo y recortado NO pagina: Chrome lo trata como una caja del
// tamaño del viewport, imprime UNA hoja y descarta el resto — `break-before:page`
// se ignora en silencio. Por eso el modal se portalea a <body> y en @media print
// se deshace el lock y se ocultan los demás hijos del body. Sin el portal no hay
// forma de aislar el documento sin tocar globals.css.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Download, Printer } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { fmtDate } from "@/lib/format";
import { exportComisionDetalle, tipoDocCorto, comisionLinea, type ComisionDetalle, type ComisionDescuento, type VentaDoc, type CobroDoc } from "@/lib/ventas/comisionExcel";
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

// La columna "Comisión" de cada tabla es informativa: muestra cuánto aporta ese
// renglón. El total que se paga NO es la suma de esos renglones — el RPC redondea
// la BASE del mes (ROUND(base × tasa)), no documento por documento, así que la
// suma de líneas redondeadas puede diferir 1-2 centavos. Los pies de tabla
// muestran SIEMPRE el número del RPC (el mismo del cierre), y esta nota explica
// por qué "de a poquito" puede no dar exacto.
const NOTA_COMISION_LINEA =
  "La comisión de cada línea es referencial. El total se calcula sobre el total del mes, " +
  "por eso puede diferir unos centavos de la suma de las líneas.";

// ── Layout de impresión: letter PORTRAIT, fuente FIJA ────────────────────────
// Sin tiers que achiquen la letra: el reporte fluye a las hojas que necesite.
// VENTAS siempre en 2 columnas tipo periódico; COBROS en 1 o 2 según sus filas.
//
// ROWS_PER_COL = filas que caben en UNA columna de UNA hoja, a 9px con el
// padding vertical de abajo. Calibrado por MEDICIÓN imprimiendo a PDF: con 45
// la hoja llena medía 960px de contenido en una caja de 917px (se desbordaba y
// se perdían filas). 42 deja ~10px de aire. Si tocás el font-size o el padding,
// recalibrá esto midiendo scrollHeight vs clientHeight de .cds-page.
const ROWS_PER_COL = 42;

// Alto (en "filas equivalentes") que la última hoja de COBROS debe reservar para
// TOTAL COBROS + TOTAL VENTAS + COBROS + la caja CIERRE. Así el cierre nunca
// queda huérfano solo en una hoja: se rompe ANTES y baja acompañado de filas.
const CIERRE_RESERVE_ROWS = 16;
// La última hoja de VENTAS solo reserva su línea de TOTAL VENTAS (~24px ≈ 1.2
// filas; el aire de ROWS_PER_COL absorbe el resto). Con 3 la columna izquierda
// moría a ~75px del pie — media pulgada vacía que era justo la queja.
const TOTAL_LINE_ROWS = 1;

/**
 * Reparte `total` filas en hojas: las primeras llevan `capFull`, la última a lo
 * sumo `capLast` (menor, porque carga los totales / el cierre). Devuelve cuántas
 * filas van en cada hoja.
 */
function paginate(total: number, capFull: number, capLast: number): number[] {
  if (total <= capLast) return [total];
  // n hojas tales que (n-1)*capFull + capLast >= total
  const n = 1 + Math.ceil((total - capLast) / capFull);
  const pages: number[] = [];
  let restantes = total;
  for (let i = 0; i < n - 1; i++) {
    const enEsta = Math.min(capFull, restantes - 0);
    pages.push(enEsta);
    restantes -= enEsta;
  }
  pages.push(restantes);
  return pages;
}

/** Corta `arr` en tramos consecutivos de los tamaños dados. */
function chunkBySizes<T>(arr: T[], sizes: number[]): T[][] {
  const out: T[][] = [];
  let i = 0;
  for (const s of sizes) {
    out.push(arr.slice(i, i + s));
    i += s;
  }
  return out;
}

// Reparte filas en hasta N columnas LLENANDO cada una hasta el fondo de la hoja
// (colCap filas) antes de pasar a la siguiente: izquierda completa primero,
// luego la derecha. Un reparto parejo (ceil(n/2) y ceil(n/2)) dejaba las dos
// columnas muertas a media hoja con media página vacía abajo (feedback de
// Daniel con Reinaldo/Fashion Shoes/mayo: 42 filas → 21+21).
function splitFillFirst<T>(arr: T[], n: number, colCap: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < n && i * colCap < arr.length; i++) {
    out.push(arr.slice(i * colCap, (i + 1) * colCap));
  }
  return out.length ? out : [[]];
}

// Anchos de columna por bloque (table-layout:fixed). Cliente se lleva el sobrante
// y trunca con ellipsis; Fecha/Factura/Tipo/Subtotal van nowrap y NUNCA se
// recortan (son los datos que el contador concilia). Calibrado por MEDICIÓN
// (scrollWidth vs clientWidth a la anchura real de impresión) con las cadenas
// REALES de producción: secuencial de 13 chars "155-000000244", cliente de 32
// chars, subtotal "$63,737.00" y NC negativa "$-63,737.00" (signo incluido).
// El peor caso horizontal es 2 bloques en portrait (~346px por bloque).
// Tipo lleva 10%: con 8% el rótulo "TIPO" del thead truncaba a "TI…".
const VENTAS_COLS = ["13%", "30%", "24%", "10%", "23%"];
const COBROS_COLS = ["18%", "48%", "34%"];

function VentasPrintBlocks({ rows, n, colCap }: { rows: VentaDoc[]; n: number; colCap: number }) {
  if (rows.length === 0) return <p className="cds-empty">Sin ventas comisionables.</p>;
  // Solo se renderizan bloques con filas: si todo cabe en la izquierda, la
  // tabla va a ancho completo y no hay divisor colgando junto a nada.
  const blocks = splitFillFirst(rows, n, colCap);
  return (
    <div className="cds-blocks">
      {blocks.map((block, bi) => (
        <div key={bi} className="cds-block">
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

function CobrosPrintBlocks({ rows, n, colCap }: { rows: CobroDoc[]; n: number; colCap: number }) {
  if (rows.length === 0) return <p className="cds-empty">Sin cobros comisionables.</p>;
  const blocks = splitFillFirst(rows, n, colCap);
  return (
    <div className="cds-blocks">
      {blocks.map((block, bi) => (
        <div key={bi} className="cds-block">
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
  // El portal necesita `document`; en SSR no existe. Montamos en el cliente.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  // ── Paginación explícita del print (portrait, fuente fija) ─────────────────
  // Chrome no soporta counter(pages) fuera de las cajas de margen de @page, así
  // que las hojas se arman acá para poder rotular "Página X de Y" y repetir el
  // header. VENTAS: 2 columnas siempre. COBROS: 1 columna si sus filas caben en
  // la hoja del cierre, si no 2. Cada descuento extra (más de 2) engorda la caja
  // de cierre → se le suma una fila a la reserva.
  const reserva = CIERRE_RESERVE_ROWS + Math.max(0, descuentos.filter((d) => d.activo).length - 2);

  const ventasRows = data?.ventas ?? [];
  const cobrosRows = data?.cobros ?? [];

  // Las columnas se llenan hasta el fondo de la hoja, así que los totales / el
  // cierre de la última hoja van DEBAJO de las columnas y le restan alto a CADA
  // columna (cap − reserva), no al total de la hoja.
  const ventasCapLast = ROWS_PER_COL - TOTAL_LINE_ROWS;
  const ventasSizes = paginate(ventasRows.length, 2 * ROWS_PER_COL, 2 * ventasCapLast);
  const ventasPages = chunkBySizes(ventasRows, ventasSizes);

  const cobrosCapLast = ROWS_PER_COL - reserva;
  const cobrosCols = cobrosRows.length <= cobrosCapLast ? 1 : 2;
  const cobrosSizes = paginate(cobrosRows.length, cobrosCols * ROWS_PER_COL, cobrosCols * cobrosCapLast);
  const cobrosPages = chunkBySizes(cobrosRows, cobrosSizes);

  const totalPaginas = ventasPages.length + cobrosPages.length;

  // Header compacto (una línea) + pie con numeración, repetidos en cada hoja.
  const headerLinea = `Comisión — ${vendedor.toUpperCase()} · ${empresaNombre} · ${MESES[mes - 1]} ${year}`;
  const PageChrome = ({ n, children }: { n: number; children: ReactNode }) => (
    <section className="cds-page">
      <div className="cds-print-header">
        <span>{headerLinea}</span>
        <span>Fashion Group</span>
      </div>
      {children}
      <div className="cds-print-footer">Página {n} de {totalPaginas}</div>
    </section>
  );

  if (!mounted) return null;

  return createPortal(
    <div data-cds-print="">
    <ModalOverlay
      align="start"
      backdropClassName="bg-black/40"
      className="overflow-y-auto p-4 print:static print:block print:bg-white print:p-0"
    >
      {/* Estilos print scopeados a este reporte (globals.css es compartido). */}
      <style>{`
        @media print {
          /* PORTRAIT (decisión de negocio). globals.css declara landscape para
             Guías/Caja; esta regla va después y gana mientras el modal existe. */
          @page { size: letter portrait; margin: 1.5cm; }

          /* Deshacer el lock de scroll del body (position:fixed + overflow:hidden)
             SOLO al imprimir: con el body fijo Chrome no pagina y sale 1 hoja.
             Los estilos inline del hook son sin !important, así que estas reglas
             ganan. Al cerrar el diálogo de print el lock vuelve solo. */
          body {
            position: static !important;
            top: auto !important; left: auto !important; right: auto !important;
            width: auto !important; height: auto !important;
            overflow: visible !important;
          }
          /* Solo el reporte entra al flujo de impresión. */
          body > *:not([data-cds-print]) { display: none !important; }
          #print-document { position: static !important; max-width: none !important; }

          /* ── Hojas explícitas ──────────────────────────────────────────────
             Cada .cds-page ocupa exactamente una hoja y rompe después. El alto
             fijo pone el pie abajo (margin-top:auto) y hace que un desborde de
             capacidad se note como una hoja de más (no como un pie flotando). */
          #print-document .cds-page {
            height: 9.55in;
            display: flex; flex-direction: column;
            break-inside: avoid; page-break-inside: avoid;
          }
          #print-document .cds-page:not(:last-child) {
            break-after: page; page-break-after: always;
          }
          #print-document .cds-print-header {
            display: flex; align-items: baseline; justify-content: space-between;
            border-bottom: 1px solid #d1d5db; padding-bottom: 3px; margin-bottom: 6px;
            font-size: 10px; font-weight: 600; color: #111827;
          }
          #print-document .cds-print-footer {
            margin-top: auto; padding-top: 4px; border-top: 1px solid #e5e7eb;
            text-align: right; font-size: 9px; color: #6b7280;
          }
          #print-document .cds-seccion-titulo {
            font-size: 10px; font-weight: 600; text-transform: uppercase;
            letter-spacing: 0.04em; color: #6b7280; margin: 0 0 4px;
          }
          /* Nunca partir una fila ni la caja de cierre. */
          #print-document tr,
          #print-document .cds-cierre { page-break-inside: avoid; break-inside: avoid; }

          /* ── Bloques tipo periódico ── */
          /* align-items por defecto (stretch): el bloque corto se estira al alto
             del lleno y el divisor corre a lo alto de las columnas. */
          #print-document .cds-blocks { display: flex; }
          #print-document .cds-block { flex: 1 1 0; min-width: 0; }
          /* Divisor sutil entre columnas, con margen simétrico (10px por lado). */
          #print-document .cds-block + .cds-block {
            border-left: 1px solid #e5e7eb;
            margin-left: 10px; padding-left: 10px;
          }
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

          /* Fuente FIJA legible. El alto de fila que resulta de este font-size +
             padding es lo que define ROWS_PER_COL: si tocás uno, recalibrá el
             otro midiendo el PDF. */
          #print-document .cds-block-table { font-size: 9px; }
          #print-document .cds-block-table th,
          #print-document .cds-block-table td {
            padding: 2.5px 3px !important;
          }
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
              {/* ══════════ PANTALLA — VENTAS ══════════ */}
              <section className="print:hidden">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Ventas</h3>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 font-medium">Factura</th>
                        <th className="px-3 py-2 text-center font-medium">Tipo</th>
                        <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                        <th className="px-3 py-2 text-right font-medium">% Util.</th>
                        <th className="px-3 py-2 text-right font-medium">Comisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ventas.length === 0 ? (
                        <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400">Sin ventas comisionables.</td></tr>
                      ) : data.ventas.map((v, i) => (
                        // Facturas con utilidad ≤20% no comisionan: se listan con
                        // $0.00 (atribuidas al vendedor de la factura) pero en gris.
                        <tr key={i} className={`border-b border-gray-100 last:border-0 ${v.subtotal < 0 ? "text-rose-600" : v.subtotal === 0 && v.tipo === "Factura" ? "text-gray-400" : "text-gray-800"}`}>
                          <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(v.fecha)}</td>
                          <td className="px-3 py-1.5">{v.cliente}</td>
                          <td className="px-3 py-1.5 tabular-nums text-gray-500">{v.secuencial}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums text-gray-500">{tipoDocCorto(v.tipo)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(v.subtotal)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{v.tipo === "Nota de Crédito" || v.pct_utilidad == null || !Number.isFinite(v.pct_utilidad) ? "—" : `${v.pct_utilidad.toFixed(1)}%`}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(comisionLinea(v.subtotal, data.tasa_venta))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {/* El pie de "Comisión" muestra el número del RPC (el mismo
                          del cierre), NO la suma de las líneas: un solo total. */}
                      <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                        <td className="px-3 py-2" colSpan={4}>TOTAL VENTAS</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.ventas_base)}</td>
                        <td></td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.comision_venta)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="mt-1 text-xs text-gray-400">Comisión de cada línea = subtotal × {pctTasaV}%. {NOTA_COMISION_LINEA}</p>

              </section>

              {/* ══════════ PANTALLA — COBROS + CIERRE ══════════ */}
              <section className="print:hidden">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Cobros</h3>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Cliente</th>
                        <th className="px-3 py-2 text-right font-medium">Monto</th>
                        <th className="px-3 py-2 text-right font-medium">Comisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cobros.length === 0 ? (
                        <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">Sin cobros comisionables.</td></tr>
                      ) : data.cobros.map((c, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0 text-gray-800">
                          <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(c.fecha)}</td>
                          <td className="px-3 py-1.5">{c.cliente}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(c.monto)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(comisionLinea(c.monto, data.tasa_cobro))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {/* Igual que en VENTAS: el pie es el número del RPC. */}
                      <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                        <td className="px-3 py-2" colSpan={2}>TOTAL COBROS</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.cobros_base)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(data.comision_cobro)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="mt-1 text-xs text-gray-400 print:hidden">El API de Switch no expone el número de recibo.</p>
                <p className="mt-0.5 text-xs text-gray-400 print:hidden">Comisión de cada línea = monto × {pctTasaC}%. {NOTA_COMISION_LINEA}</p>

                {/* Suma de las BASES sobre las que se comisiona (no de las comisiones). */}
                <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 print:hidden">
                  <span>TOTAL VENTAS + COBROS</span>
                  <span className="tabular-nums">{fmtMoney(round2(data.ventas_base + data.cobros_base))}</span>
                </div>

                {/* CIERRE */}
                <section className="cds-cierre mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4 print:hidden">
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

              {/* ══════════ IMPRESIÓN — hojas explícitas ══════════
                  VENTAS ocupa las hojas que necesite (2 columnas, fuente fija).
                  COBROS siempre arranca en hoja nueva. El CIERRE va al final de
                  la última hoja de cobros, con su espacio ya reservado por
                  `reserva`, así que nunca queda huérfano. */}
              <div className="hidden print:block">
                {ventasPages.map((pageRows, i) => (
                  <PageChrome key={`v${i}`} n={i + 1}>
                    <p className="cds-seccion-titulo">Ventas{i > 0 ? " (continúa)" : ""}</p>
                    <VentasPrintBlocks
                      rows={pageRows}
                      n={2}
                      colCap={i === ventasPages.length - 1 ? ventasCapLast : ROWS_PER_COL}
                    />
                    {i === ventasPages.length - 1 && (
                      <div className="cds-total-line flex items-center justify-between">
                        <span>TOTAL VENTAS</span>
                        <span className="tabular-nums">{fmtMoney(data.ventas_base)}</span>
                      </div>
                    )}
                  </PageChrome>
                ))}

                {cobrosPages.map((pageRows, i) => {
                  const esUltima = i === cobrosPages.length - 1;
                  return (
                    <PageChrome key={`c${i}`} n={ventasPages.length + i + 1}>
                      <p className="cds-seccion-titulo">Cobros{i > 0 ? " (continúa)" : ""}</p>
                      <CobrosPrintBlocks rows={pageRows} n={cobrosCols} colCap={esUltima ? cobrosCapLast : ROWS_PER_COL} />
                      {esUltima && (
                        <>
                          <div className="cds-total-line flex items-center justify-between">
                            <span>TOTAL COBROS</span>
                            <span className="tabular-nums">{fmtMoney(data.cobros_base)}</span>
                          </div>
                          <div className="cds-total-line flex items-center justify-between">
                            <span>TOTAL VENTAS + COBROS</span>
                            <span className="tabular-nums">{fmtMoney(round2(data.ventas_base + data.cobros_base))}</span>
                          </div>
                          <div className="cds-cierre mt-2 border border-gray-300 p-2">
                            <p className="cds-seccion-titulo">Cierre</p>
                            <dl className="text-[10px]">
                              <div className="flex justify-between">
                                <dt>Ventas {fmtMoney(data.ventas_base)} × {pctTasaV}%</dt>
                                <dd className="tabular-nums">{fmtMoney(data.comision_venta)}</dd>
                              </div>
                              <div className="flex justify-between">
                                <dt>Cobros {fmtMoney(data.cobros_base)} × {pctTasaC}%</dt>
                                <dd className="tabular-nums">{fmtMoney(data.comision_cobro)}</dd>
                              </div>
                              {descActivos.length === 0 ? (
                                <div className="mt-1 flex justify-between border-t border-gray-300 pt-1 text-[11px] font-semibold">
                                  <dt>Comisión total</dt>
                                  <dd className="tabular-nums">{fmtMoney(data.comision_total)}</dd>
                                </div>
                              ) : (
                                <>
                                  <div className="mt-1 flex justify-between border-t border-gray-300 pt-1 font-semibold">
                                    <dt>Subtotal comisión</dt>
                                    <dd className="tabular-nums">{fmtMoney(data.comision_total)}</dd>
                                  </div>
                                  {/* Solo los descuentos ACTIVOS: son la deducción del mes. */}
                                  {descActivos.map((d) => (
                                    <div key={d.id} className="flex justify-between">
                                      <dt>{d.concepto}</dt>
                                      <dd className="tabular-nums">−{fmtMoney(d.monto)}</dd>
                                    </div>
                                  ))}
                                  <div className="mt-1 flex justify-between border-t border-gray-300 pt-1 text-[11px] font-semibold">
                                    <dt>Total a pagar</dt>
                                    <dd className="tabular-nums">{fmtMoney(totalAPagar)}</dd>
                                  </div>
                                </>
                              )}
                            </dl>
                          </div>
                        </>
                      )}
                    </PageChrome>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </ModalOverlay>
    </div>,
    document.body,
  );
}
