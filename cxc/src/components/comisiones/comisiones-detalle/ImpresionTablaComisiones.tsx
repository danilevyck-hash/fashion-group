"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🔄 RETIRADO EL 9-SEP-2026 — SIN LECTORES, Y NO SE BORRA (patrón de la casa).
//
// Esta era la hoja HTML que se montaba invisible en `<body>` para mandarla al
// diálogo de imprimir del navegador. Daniel: *«¿no podemos hacer un botón de
// PDF, ya que de PDF en la compu paso a imprimir?»* y *«Los paso a PDF también,
// para que todo el módulo se comporte igual»*. El papel del mes y el del año son
// ahora un PDF armado en código (`lib/comisiones/pdf-tabla-comisiones.ts`), con
// el nombre puesto por nosotros y sin nada montado en la página que se pueda
// colar en el archivo.
//
// El archivo se queda con su calibración: es la única memoria de cómo se veía
// este papel, y de qué defecto obligó a la regla de CSS que hay más abajo.
//
// ── Lo que decía cuando estaba vivo ──────────────────────────────────────────
// LA HOJA IMPRESA DE UNA TABLA DE COMISIONES — el papel de «Descargar el mes en
// PDF».
//
// 🔴 UNA SOLA HOJA PARA LAS DOS VISTAS. La matriz de Fashion Group (vendedor ×
// 6 empresas + Total) y el resumen de UNA empresa (vendedor × 5 números) son la
// misma cosa impresa: una tabla con encabezados, filas y una línea de totales.
// Dibujar dos papeles distintos es cómo se llega a que uno lleve a los que no se
// pagan y el otro no.
//
// 🔴 LO QUE SE IMPRIME ES LO QUE SE VE, YA CALCULADO. Este componente NO suma,
// no netea y no decide quién se paga: recibe las filas ya armadas por la vista
// —que es la dueña del cálculo— y las dibuja. Ni una operación aritmética en
// todo el archivo.
//
// Mismo mecanismo que `ImpresionComision`: se monta en un portal a <body>
// envuelto en `[data-cds-print]`, en pantalla no se ve, y `globals.css` solo
// deja pasar `#print-document` al flujo de impresión.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ColumnaImpresa {
  header: string;
  /** Los números van a la derecha; el nombre del vendedor, a la izquierda. */
  numerica?: boolean;
}

export interface FilaImpresa {
  /** Ya formateadas por la vista (`fmtMoney`, `—`, etc.). */
  celdas: string[];
  /** Se pinta en gris: los que se calculan y no se pagan. */
  apagada?: boolean;
}

interface Props {
  /** `Comisiones — Fashion Group` · `Comisiones — Vistana`. */
  titulo: string;
  /** `Agosto 2026`. */
  subtitulo: string;
  columnas: ColumnaImpresa[];
  filas: FilaImpresa[];
  /** La línea de abajo: «Total a pagar» y sus números, tal cual el pie de la tabla. */
  totales: string[];
}

export function ImpresionTablaComisiones({ titulo, subtitulo, columnas, filas, totales }: Props) {
  // 🔑 VA EN UN PORTAL A <body>, SIEMPRE. La regla de impresión esconde a los
  // hijos de <body> que no sean el papel; dentro del árbol de la app este nodo
  // caería adentro de un hijo escondido y se imprimiría una hoja en blanco.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;

  return createPortal(
    <div data-cds-print="" data-cds-tabla="">
      {/* Estilos scopeados a este papel (globals.css es compartido). */}
      <style>{`
        @media print {
          /* Ocho columnas no entran en portrait: la matriz va acostada, que es
             además lo que globals.css ya declara por defecto. */
          @page { size: letter landscape; margin: 1.5cm; }
          body {
            position: static !important;
            top: auto !important; left: auto !important; right: auto !important;
            width: auto !important; height: auto !important;
            overflow: visible !important;
          }
          body > *:not([data-cds-print]) { display: none !important; }
          /* 🩸 SOLO ESTE PAPEL: con el detalle abierto, su hoja también está
             montada en <body> y saldría pegada al papel del mes. */
          body > [data-cds-print]:not([data-cds-tabla]) { display: none !important; }
          #print-document { position: static !important; max-width: none !important; }
          #print-document .cmt-header {
            display: flex; align-items: baseline; justify-content: space-between;
            border-bottom: 1px solid #d1d5db; padding-bottom: 4px; margin-bottom: 8px;
            font-size: 11px; font-weight: 600; color: #111827;
          }
          #print-document .cmt-table { width: 100%; border-collapse: collapse; font-size: 10px; }
          #print-document .cmt-table th {
            text-align: left; font-weight: 500; text-transform: uppercase;
            letter-spacing: 0.02em; color: #6b7280;
            border-bottom: 1px solid #d1d5db; padding: 3px 4px;
          }
          #print-document .cmt-table td { padding: 3px 4px; border-bottom: 1px solid #f3f4f6; color: #1f2937; }
          #print-document .cmt-num { text-align: right; font-variant-numeric: tabular-nums; }
          #print-document .cmt-apagada td { color: #9ca3af; }
          #print-document .cmt-total td {
            border-top: 1.5px solid #d1d5db; border-bottom: 0;
            font-weight: 600; color: #111827; padding-top: 5px;
          }
          #print-document tr { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>
      {/* id="print-document": globals.css oculta todo lo demás al imprimir. */}
      <div id="print-document" className="hidden print:block">
        <div className="cmt-header">
          <span>{titulo} · {subtitulo}</span>
          <span>Fashion Group</span>
        </div>
        <table className="cmt-table">
          <thead>
            <tr>
              {columnas.map((c, i) => (
                <th key={i} className={c.numerica ? "cmt-num" : undefined}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className={f.apagada ? "cmt-apagada" : undefined}>
                {f.celdas.map((celda, j) => (
                  <td key={j} className={columnas[j]?.numerica ? "cmt-num" : undefined}>{celda}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="cmt-total">
              {totales.map((t, i) => (
                <td key={i} className={columnas[i]?.numerica ? "cmt-num" : undefined}>{t}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>,
    document.body,
  );
}
