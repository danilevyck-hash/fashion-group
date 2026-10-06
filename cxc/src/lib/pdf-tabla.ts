// ─────────────────────────────────────────────────────────────────────────────
// LA TABLA DE TODOS LOS PDF (6-oct-2026). Es `autoTable` con una sola regla más:
//
// 🔴 EL ENCABEZADO SE ALINEA COMO SU COLUMNA. Daniel, revisando la galería:
// «Subtotal», «Comisión» y «Monto» iban a la izquierda y sus números a la
// derecha; igual «Débitos / Créditos / Saldo» en el estado de cuenta.
//
// 🩸 La causa era una sola: en `jspdf-autotable`, `columnStyles` alinea el
// CUERPO pero no el encabezado ni el pie. Cada papel lo «arreglaba» a mano o no
// lo arreglaba. Acá se arregla para todos: si la celda del encabezado o del
// pie no trae su propia alineación, toma la de su columna.
//
// Todos los PDF importan `autoTable` de AQUÍ, no de "jspdf-autotable". La
// revisión automática (`papeles-qa/revisar.ts`) acusa una columna desalineada.
// ─────────────────────────────────────────────────────────────────────────────

import autoTableOriginal, { type CellHookData, type UserOptions } from "jspdf-autotable";
import type { jsPDF } from "jspdf";
import { ESTILO_UNICO, PAPEL, aPaleta, esNegativo } from "@/lib/pdf-estilo";

export default function autoTable(doc: jsPDF, opciones: UserOptions): void {
  const opts = ESTILO_UNICO ? conEstiloUnico(opciones) : opciones;
  const suyo = opts.didParseCell;
  autoTableOriginal(doc, {
    ...opts,
    didParseCell: (d: CellHookData) => {
      if (d.section !== "body") {
        const raw = d.cell.raw as { styles?: { halign?: unknown } } | null;
        const propia = (raw && typeof raw === "object" && raw.styles?.halign)
          || (d.section === "head" ? opts.headStyles?.halign : opts.footStyles?.halign);
        const col = opts.columnStyles?.[d.column.dataKey] ?? opts.columnStyles?.[d.column.index];
        if (!propia && col?.halign) d.cell.styles.halign = col.halign;
      }
      suyo?.(d);
    },
  });
}

// ── El estilo único (`pdf-estilo.ts`, interruptor PAPELES_ESTILO_UNICO_2026_10) ──
// La tabla de TODOS los papeles se ve igual aunque el módulo pida otra cosa:
// encabezado gris oscuro chico sobre gris muy claro con raya fina abajo, sin
// rayas verticales ni cebra, separadores finos, negativos en rojo, totales en
// negrita con raya arriba. Los colores que pida el módulo se llevan a la paleta.

type Estilos = Record<string, unknown>;
const limpio = (e: Estilos | undefined): Estilos => {
  const r: Estilos = { ...(e ?? {}) };
  if ("textColor" in r) r.textColor = aPaleta(r.textColor, "texto") || PAPEL.tinta;
  if ("fillColor" in r) r.fillColor = aPaleta(r.fillColor, "fondo");
  if ("lineColor" in r) r.lineColor = aPaleta(r.lineColor, "linea");
  return r;
};

function conEstiloUnico(o: UserOptions): UserOptions {
  const base = (o.styles ?? {}) as Estilos;
  const tam = typeof base.fontSize === "number" ? base.fontSize : 8;
  const suyoParse = o.didParseCell;
  const suyoDraw = o.didDrawCell;
  return {
    ...o,
    theme: "plain",
    tableLineColor: PAPEL.linea,
    tableLineWidth: 0,
    styles: { ...limpio(base), lineWidth: 0, lineColor: PAPEL.linea, fillColor: false, textColor: (limpio(base).textColor as [number, number, number] | undefined) ?? PAPEL.tinta },
    headStyles: { ...limpio(o.headStyles as Estilos), fillColor: PAPEL.fondo, textColor: PAPEL.grisOscuro, fontStyle: "bold", fontSize: Math.min(7, tam), lineWidth: 0 },
    bodyStyles: { ...limpio(o.bodyStyles as Estilos), lineWidth: 0 },
    alternateRowStyles: {},
    footStyles: { ...limpio(o.footStyles as Estilos), fillColor: false, textColor: PAPEL.tinta, fontStyle: "bold", lineWidth: 0 },
    columnStyles: Object.fromEntries(Object.entries(o.columnStyles ?? {}).map(([k, v]) => [k, limpio(v as Estilos)])),
    didParseCell: (d: CellHookData) => {
      suyoParse?.(d);
      const st = d.cell.styles as unknown as Estilos;
      if (d.section === "head") {
        st.fillColor = PAPEL.fondo;
        st.textColor = PAPEL.grisOscuro;
        return;
      }
      st.textColor = aPaleta(st.textColor, "texto") || PAPEL.tinta;
      // Un texto blanco era para ir sobre azul; sobre papel va en tinta.
      if (JSON.stringify(st.textColor) === JSON.stringify(PAPEL.blanco)) st.textColor = PAPEL.tinta;
      st.fillColor = aPaleta(st.fillColor, "fondo");
      st.lineColor = aPaleta(st.lineColor, "linea");
      if (d.section === "body" && esNegativo(d.cell.text.join(" "))) st.textColor = PAPEL.rojo;
    },
    didDrawCell: (d: CellHookData) => {
      suyoDraw?.(d);
      const { x, y, width, height } = d.cell;
      if (d.section === "head") {
        d.doc.setDrawColor(...PAPEL.linea);
        d.doc.setLineWidth(0.3);
        d.doc.line(x, y + height, x + width, y + height);
      } else if (d.section === "body") {
        d.doc.setDrawColor(...PAPEL.separador);
        d.doc.setLineWidth(0.15);
        d.doc.line(x, y + height, x + width, y + height);
      } else if (d.section === "foot" && d.row.index === 0) {
        d.doc.setDrawColor(...PAPEL.tinta);
        d.doc.setLineWidth(0.35);
        d.doc.line(x, y, x + width, y);
      }
    },
  };
}
