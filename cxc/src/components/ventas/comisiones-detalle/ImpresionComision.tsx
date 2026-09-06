"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA HOJA IMPRESA del reporte de comisión de un vendedor. Vive aparte del
// componente de pantalla desde el 6-sep-2026, cuando el detalle pasó a poder
// abrirse ABAJO de la matriz además de en el modal: con las dos formas y las
// hojas de impresión en el mismo archivo, `ComisionesDetalleModal.tsx` pasaba
// las 800 líneas de la casa.
//
// 🔴 SE MUEVE, NO SE CAMBIA. Cada constante calibrada, cada ancho de columna y
// cada regla de `@media print` es la misma; el porqué de cada una está en su
// comentario. La única diferencia es que ahora este árbol se monta SIEMPRE en un
// portal a `<body>` (lo hace quien lo usa), que es lo que permite imprimir tanto
// desde el modal como desde el detalle inline.
//
// Print: letter PORTRAIT, fuente fija, hojas explícitas. Página 1..N = VENTAS,
// N+1..M = COBROS + CIERRE. Para mantener la fuente legible el layout es tipo
// periódico: las filas de cada sección se reparten en bloques lado a lado, cada
// bloque es su propia <table> con su propio <thead>.
//
// GOTCHA (por qué el portal): `ModalOverlay` llama `useBodyScrollLock`, que deja
// el <body> en `position:fixed; top:-Ypx; overflow:hidden` mientras el modal
// está abierto. Un body fijo y recortado NO pagina: Chrome lo trata como una
// caja del tamaño del viewport, imprime UNA hoja y descarta el resto —
// `break-before:page` se ignora en silencio. Por eso el reporte se portalea a
// <body> y en @media print se deshace el lock y se ocultan los demás hijos del
// body. Sin el portal no hay forma de aislar el documento sin tocar globals.css.
//
// ⚠️ EL Nº DE FACTURA VA LARGO EN EL PAPEL (`11-000003022`), igual que en el
// Excel. En pantalla se muestran los últimos 4 dígitos; acá no: este es el papel
// que se concilia contra Switch, y Daniel lo dejó así expresamente («no»).

import { type ReactNode } from "react";
import { fmtMoney } from "@/lib/ventas/format";
import { fmtDate } from "@/lib/format";
import { tipoDocCorto, type ComisionDetalle, type ComisionDescuento, type VentaDoc, type CobroDoc } from "@/lib/ventas/comisionExcel";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { etiquetaPeriodo } from "@/lib/comisiones/periodo";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Fecha compacta para los bloques de impresión: día + mes, SIN año (el mes/año
// ya va en el header compacto y todas las filas son del mismo mes). Reusa el
// parseo de fmtDate ("5 jul 2026" → "5 jul") para ahorrar ancho en 3 columnas.
function fmtDateShort(d: string): string {
  const parts = fmtDate(d).split(" ");
  return parts.length >= 3 ? parts.slice(0, 2).join(" ") : fmtDate(d);
}

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
  data: ComisionDetalle;
  /** TODOS los descuentos del mes (activos o no): los inactivos no se imprimen. */
  descuentos: ComisionDescuento[];
  /** Nombre CORTO de la empresa (diccionario § 0). */
  empresaNombre: string;
  vendedor: string;
  year: number;
  mes: number;
}

/**
 * El árbol que se imprime. En pantalla no se ve (`hidden print:block`) y quien
 * lo usa lo monta en un portal a `<body>`, envuelto en `[data-cds-print]`.
 */
export function ImpresionComision({ data, descuentos, empresaNombre, vendedor, year, mes }: Props) {
  const descActivos = descuentos.filter((d) => d.activo);
  const totalAPagar = round2(
    data.comision_total - descActivos.reduce((s, d) => s + d.monto, 0),
  );
  const pctTasaV = (data.tasa_venta * 100).toFixed(2);
  const pctTasaC = (data.tasa_cobro * 100).toFixed(2);

  // ── Paginación explícita del print (portrait, fuente fija) ─────────────────
  // Chrome no soporta counter(pages) fuera de las cajas de margen de @page, así
  // que las hojas se arman acá para poder rotular "Página X de Y" y repetir el
  // header. VENTAS: 2 columnas siempre. COBROS: 1 columna si sus filas caben en
  // la hoja del cierre, si no 2. Cada descuento extra (más de 2) engorda la caja
  // de cierre → se le suma una fila a la reserva.
  const reserva = CIERRE_RESERVE_ROWS + Math.max(0, descActivos.length - 2);

  const ventasRows = data.ventas ?? [];
  const cobrosRows = data.cobros ?? [];

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
  // Capitalizado también en el papel (Daniel, 3-sep-2026: «si capitiliza reynaldo»).
  const headerLinea = `Comisión — ${nombreVendedorEnPantalla(vendedor)} · ${empresaNombre} · ${etiquetaPeriodo(year, mes)}`;
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

  return (
    <div data-cds-print="">
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
      <div id="print-document" className="hidden print:block">
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
    </div>
  );
}
