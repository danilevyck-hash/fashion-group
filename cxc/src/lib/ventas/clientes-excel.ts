// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL DE VENTAS › CLIENTES (5-sep-2026).
//
// 🩸 QUÉ FALTABA. Las otras vistas del módulo tenían su Excel adentro
// (Productos, Utilidad) y el botón que se veía arriba de Clientes NO era el de
// Clientes: era el del **Resumen**, puesto en la barra del módulo al lado del
// año (`exportResumenToExcel`). O sea que desde Clientes se bajaba la matriz de
// empresas × meses. Daniel pidió que cada pestaña tenga el suyo, adentro.
//
// 🔴 BAJA LO QUE ESTÁS VIENDO, CON LOS FILTROS PUESTOS. Recibe las filas YA
// filtradas y ordenadas por la pantalla — no vuelve a filtrar ni a ordenar por
// su cuenta: dos criterios de filtrado son dos listas distintas con el mismo
// nombre de archivo.
//
// ⚠️ El MOSTRADOR (`TCKCTA`) va en su propia fila al final, marcado, igual que
// en la pantalla: no es un cliente y meterlo en el ranking lo pondría primero
// en varias empresas. Si la pantalla no lo está mostrando (hay búsqueda), acá
// tampoco.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkSheet } from "xlsx-js-style";
import type { Cliente } from "@/components/ventas/types";
// 🔴 La cuenta del Δ% vive en UN solo lugar (`variacion.ts`) y acá NO se
//    reescribe: el guard de $100 de base mínima es el que impide que un total
//    previo de centavos produzca un porcentaje absurdo en el archivo.
import { variacionPct } from "@/lib/variacion";
import { rotuloCompras, rotuloVs, type PeriodoVentas } from "@/lib/ventas/periodo";
// 🔴 EL ARCHIVO SE EXPLICA SOLO (23-sep-2026). El Excel del 20-sep tenía 92
// filas que sumaban $6.045.624,95 y un TOTAL de $5.988.950,48: la diferencia
// exacta era la fila del mostrador ($56.674,47), que en pantalla va en ámbar
// «fuera del ranking» y en el archivo no llevaba marca. Daniel: «Sí» baja el
// Excel. Ahora la fila del mostrador va marcada igual que en pantalla y el
// TOTAL dice cuántos clientes suma y que el mostrador queda afuera. El número
// del total NO cambia.
import { UNA_SOLA_VENTA, nombreMostradorExcel, rotuloTotalClientes } from "@/lib/ventas/una-sola-venta";

export interface ClientesExcelOpts {
  /** Año de la columna «Compras» (el nombre del archivo lo lleva). */
  year: number;
  /** El período que la pantalla está sumando: «Año 2026» o «Últimos 12 meses».
   *  Los encabezados salen de ÉL, con las mismas funciones que la pantalla. */
  periodo: PeriodoVentas;
  /** Año contra el que compara la columna de cambio. */
  anioComparativo: number;
  /** Las filas tal como se ven, ya filtradas y ordenadas. */
  filas: readonly Cliente[];
  /** La fila ámbar del mostrador, si la pantalla la está mostrando. */
  mostrador?: Cliente | null;
  /** Qué empresa está puesta ("todas" o una key). */
  empresa: string;
}

/** Construcción pura del sheet (sin DOM) — testeable. */
export async function buildClientesSheet(opts: ClientesExcelOpts): Promise<WorkSheet> {
  const { buildReportSheet, MONEY_FMT, PCT_FMT } = await import("@/lib/excel-export");

  const filas = opts.filas.filter((c) => !c.isOtrosAggregate);
  const rows: (string | number | null)[][] = filas.map((c) => [
    c.nombre,
    c.id,
    c.empresas_count,
    c.ytd,
    // 🔴 `delta` VA TAL CUAL Y SIN `?? 0`. Un 0,0% en el Excel se lee como «no
    // cambió», que es otra cosa que «no hay con qué comparar». La celda vacía
    // es lo que «Nuevo» significa en la pantalla.
    c.delta != null && Number.isFinite(c.delta) ? c.delta : null,
    c.ultima || null,
  ]);

  if (opts.mostrador) {
    rows.push([
      UNA_SOLA_VENTA ? nombreMostradorExcel(opts.mostrador.nombre) : (opts.mostrador.nombre || "Mostrador"),
      opts.mostrador.id,
      opts.mostrador.empresas_count,
      opts.mostrador.ytd,
      null,
      opts.mostrador.ultima || null,
    ]);
  }

  const totalYtd = filas.reduce((s, c) => s + c.ytd, 0);
  const totalPrev = filas.reduce((s, c) => s + c.prev, 0);
  const totalDelta = variacionPct(totalYtd, totalPrev);

  return buildReportSheet({
    columns: [
      { header: "Cliente", wch: 34 },
      { header: "Código", wch: 12 },
      { header: "Empresas", wch: 10, align: "right", fmt: "#,##0" },
      { header: rotuloCompras(opts.periodo), wch: 22, align: "right", fmt: MONEY_FMT },
      { header: rotuloVs(opts.periodo, opts.anioComparativo), wch: 14, align: "right", fmt: PCT_FMT },
      { header: "Última compra", wch: 16 },
    ],
    rows,
    // El TOTAL no incluye al mostrador, igual que la pantalla: ahí está fuera
    // del ranking y decirlo de una forma en la tabla y de otra en el archivo
    // es cómo se descubre un descuadre que no existe. Y LO DICE: «TOTAL · 91
    // clientes, sin el mostrador».
    totals: [
      UNA_SOLA_VENTA ? rotuloTotalClientes(filas.length, !!opts.mostrador) : "TOTAL",
      null, null, totalYtd, totalDelta, null,
    ],
    // 🔴 SIN `nota:`. La hoja no lleva una línea al pie explicando qué se bajó,
    // y no es un olvido: `excel-encabezados-fila-1.test.ts` mantiene esa puerta
    // cerrada a propósito — solo DOS exports del sistema la usan, y las dos las
    // aprobó Daniel una por una porque frenan un error concreto. Acá no hay
    // ninguno que frenar: los filtros están a la vista en la pantalla desde la
    // que se aprieta el botón, y el nombre del archivo lleva el año.
  });
}

export async function exportClientesToExcel(opts: ClientesExcelOpts): Promise<void> {
  const ws = await buildClientesSheet(opts);
  const { workbookFromSheets, downloadWorkbook } = await import("@/lib/excel-export");
  const sufijo = opts.periodo.tipo === "ultimos" ? `ultimos-${opts.periodo.n}-meses` : String(opts.year);
  downloadWorkbook(
    workbookFromSheets([{ name: "Clientes", ws }]),
    `ventas-clientes-${sufijo}.xlsx`,
  );
}
