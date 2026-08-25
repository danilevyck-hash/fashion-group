// Workbook compartido del export de pedidos de catálogos (las 4 marcas).
// Todos usan la MISMA estructura estándar del helper (I11), pero cada uno con
// la paleta de SU marca (paletaDeMarca) — antes las 3 salían con el navy de
// Reebok. Reebok agrega la columna Origen (pedidos "míos" vs del link
// público); Joybees no la tiene.

import type XLSX from "xlsx-js-style";
import { textoEnSwitch, textoNumeroPedido } from "@/lib/catalogo/numeros-pedido";
import {
  buildReportSheet,
  workbookFromSheets,
  paletaDeMarca,
  MONEY_FMT,
  type ReportCell,
  type ReportColumn,
} from "@/lib/excel-export";

export interface PedidoExportRow {
  /** Solo Reebok: pedido creado por vendedor ("mio") o por el link público ("link"). */
  origen?: "mio" | "link";
  cliente: string | null;
  vendor: string | null;
  item_count: number;
  total: number;
  created_at: string;
  // ── Los DOS números (25-ago-2026) ──────────────────────────────────────────
  // La pantalla ya los muestra desde el #593 y el Excel que se bajaba de la
  // MISMA lista no los llevaba: para cruzar contra Switch había que volver a la
  // pantalla. Los textos NO se arman acá: salen de `numeros-pedido.ts`, el
  // mismo módulo que pinta la lista — dos copias del criterio se separan solas
  // y la que quede vieja es la que le miente a alguien sobre si tiene la
  // mercancía apartada.
  /** `order_number` (PED-018). Null solo en el pedido del link sin convertir. */
  numero_pedido?: string | null;
  /** `numero_interno` del envío ACTIVO (16-000000506). Null si nunca salió. */
  switch_numero?: string | null;
  /** 'pedido' | 'cotizacion'. Null/ausente ⇒ pedido. */
  switch_documento?: string | null;
  /** Tabla física: `publicos` = del link sin convertir (todavía no tiene número). */
  fuente?: "orders" | "publicos";
}

export interface PedidosWorkbookOpts {
  /** Marca del catálogo — define la paleta del libro. */
  marca: string;
  /** Banda de título, ej. "REEBOK — Pedidos". */
  titulo: string;
  /** true = incluye la columna Origen (solo Reebok). */
  conOrigen: boolean;
  /**
   * false = el libro sale SIN las dos columnas de números, exactamente como
   * salía antes del 25-ago-2026. Es el escalón por si la vista de la marca no
   * pudiera dar `id_natural`/`fuente`: sin esos datos, escribir «No se ha
   * mandado a Switch» en las 42 filas sería una MENTIRA, y una mentira en una
   * planilla es peor que una columna que no está. Default: true.
   */
  conNumeros?: boolean;
  pedidos: PedidoExportRow[];
}

/** dd/mm/yyyy en hora local desde un timestamp ISO (created_at es timestamptz). */
export function fmtFechaPedido(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Construye el workbook de pedidos (hoja "Pedidos"). Función pura, testeable. */
export function buildPedidosWorkbook(opts: PedidosWorkbookOpts): XLSX.WorkBook {
  const { marca, titulo, conOrigen, pedidos, conNumeros = true } = opts;

  // 🔴 LAS DOS COLUMNAS NUEVAS VAN AL FINAL, NO INTERCALADAS. Daniel puede
  // tener una planilla enganchada a este archivo: mover una columna existente
  // se la corre entera. Las 6 de siempre quedan donde estaban, en su orden.
  const columns: ReportColumn[] = [
    ...(conOrigen ? [{ header: "Origen", wch: 10 } as ReportColumn] : []),
    { header: "Cliente", wch: 28 },
    { header: "Vendedor", wch: 20 },
    { header: "Items", wch: 8, align: "right", fmt: "0" },
    { header: "Total", wch: 13, align: "right", fmt: MONEY_FMT },
    { header: "Fecha", wch: 12 },
    ...(conNumeros
      ? ([
          { header: "N° pedido", wch: 14 },
          { header: "Switch", wch: 30 },
        ] as ReportColumn[])
      : []),
  ];

  let grandTotal = 0;
  const rows: ReportCell[][] = pedidos.map((p) => {
    grandTotal += p.total;
    // 🔴 EL QUE NO SALIÓ DICE QUE NO SALIÓ, NO UN GUION. Un guion en la columna
    // de un número se lee como un cero o como un dato que no cargó. Y el que sí
    // salió dice SIEMPRE si fue pedido o COTIZACIÓN: una cotización NO aparta
    // mercancía y con el número solo las dos se ven iguales. Criterio EXACTO de
    // la pantalla — es el mismo módulo, no una copia.
    const numeros = {
      numeroPedido: p.numero_pedido ?? null,
      switchNumero: p.switch_numero ?? null,
      switchDocumento: p.switch_documento ?? null,
      fuente: p.fuente,
    };
    return [
      ...(conOrigen ? [p.origen === "link" ? "Del link" : "Mío"] : []),
      p.cliente || "Sin nombre",
      p.vendor || "",
      p.item_count,
      { v: p.total, bold: true },
      fmtFechaPedido(p.created_at),
      ...(conNumeros ? [textoNumeroPedido(numeros), textoEnSwitch(numeros)] : []),
    ];
  });

  const totals: ReportCell[] = [
    ...(conOrigen ? [null] : []),
    null,
    null,
    { v: "TOTAL" },
    grandTotal,
    null,
    ...(conNumeros ? [null, null] : []),
  ];

  const ws = buildReportSheet({
    title: titulo,
    subtitle: `${pedidos.length} pedido${pedidos.length !== 1 ? "s" : ""}  ·  ${fmtFechaPedido(new Date().toISOString())}`,
    columns,
    rows,
    totals,
    palette: paletaDeMarca(marca),
  });

  return workbookFromSheets([{ name: "Pedidos", ws }]);
}
