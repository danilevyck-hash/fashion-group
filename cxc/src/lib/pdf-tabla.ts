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

export default function autoTable(doc: jsPDF, opts: UserOptions): void {
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
