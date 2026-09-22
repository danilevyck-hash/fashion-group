// Workbook compartido del export de Comprobantes de catálogos (las 4 marcas).
// Todos usan la MISMA estructura estándar del helper (I11), pero cada uno con
// la paleta de SU marca (paletaDeMarca) — antes las 3 salían con el navy de
// Reebok. Reebok agrega la columna Origen (pedidos "del vendedor" vs del link
// público); Joybees no la tiene.

import type XLSX from "xlsx-js-style";
import {
  textoEnSwitch,
  textoNumeroPedido,
  tipoComprobante,
  estaEnSwitch,
  PANEL_COMPROBANTES,
  type NumerosDePedido,
  type TipoComprobante,
} from "@/lib/catalogo/numeros-pedido";
import { ORIGEN_LABEL } from "@/lib/catalogo/origen-comprobante";
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
  /**
   * `status` de la tabla de orders ('borrador' | 'confirmado'). Ausente en el
   * pedido del link, que todavía no tiene fila ahí. Solo alimenta la columna
   * «Tipo»: sin él, un borrador se lee como pedido, igual que en la pantalla.
   */
  status?: string | null;
  /** ¿Tiene envío ACTIVO en Switch? Cuando viene, MANDA sobre el número. */
  en_switch?: boolean;
}

export interface PedidosWorkbookOpts {
  /** Marca del catálogo — define la paleta del libro. */
  marca: string;
  /** true = incluye la columna Origen (solo Reebok). */
  conOrigen: boolean;
  /**
   * false = el libro sale SIN las cuatro columnas que dependen del envío,
   * exactamente como salía antes del 25-ago-2026. Es el escalón por si la vista
   * de la marca no pudiera dar `id_natural`/`fuente`: sin esos datos, escribir
   * «No se ha mandado a Switch» en las 42 filas sería una MENTIRA, y una
   * mentira en una planilla es peor que una columna que no está. Default: true.
   */
  conNumeros?: boolean;
  pedidos: PedidoExportRow[];
}

/**
 * 🔴 LA HOJA SE LLAMA COMO EL PANEL: «Comprobantes» (22-sep-2026).
 *
 * 🩸 Se llamaba «Pedidos», y en el archivo real de Tommy bajado el 20-sep-2026
 * había **5 cotizaciones adentro de las 48 filas**. Una cotización NO aparta
 * mercancía: una hoja que se llama «Pedidos» y las lleva adentro dice que sí.
 * El panel cambió de nombre el 25-ago-2026 por esta misma razón; el Excel que
 * se baja de él se quedó con el viejo.
 *
 * ⚠️ El NOMBRE DEL ARCHIVO no cambia (`pedidos-<marca>-<fecha>.xlsx`): lo arma
 * la ruta y Daniel puede tener algo enganchado a él.
 */
export const HOJA_COMPROBANTES = PANEL_COMPROBANTES;

/**
 * 🔴 QUÉ ES CADA FILA, EN SU PROPIA COLUMNA (22-sep-2026).
 *
 * 🩸 Que un comprobante fuera pedido o cotización estaba ESCONDIDO adentro del
 * texto de la última columna («Pedido en Switch: 16-…» contra «Cotización en
 * Switch: 15-…»), así que en Excel no se podía filtrar ni contar. Los mismos
 * tres valores de los chips de la pantalla, del MISMO módulo: no hay una
 * segunda definición de qué es un borrador.
 */
export const TIPO_LABEL: Record<TipoComprobante, string> = {
  pedido: "Pedido",
  cotizacion: "Cotización",
  borrador: "Borrador",
};

/**
 * 🔴 EL QUE NO SALIÓ SE VE A LA PRIMERA (22-sep-2026).
 *
 * 🩸 «No se ha mandado a Switch» era una frase más adentro de la columna de
 * texto más larga de la hoja. Medido en el archivo real de Reebok: **6 de 21
 * filas, por $31.116**, mezcladas entre las demás sin que nada las distinguiera.
 * Ahora es una columna de una palabra —se filtra— y la palabra va en ROJO.
 */
export const EN_SWITCH_SI = "Sí";
export const EN_SWITCH_NO = "No";
/** Rojo del sistema para lo que falta (#B91C1C). */
export const ROJO_FALTA = "B91C1C";

/**
 * 🔴 EL VENDEDOR DE UN PEDIDO DEL LINK NO ES UN BLANCO (22-sep-2026).
 *
 * 🩸 En el Excel real de Reebok había 6 filas con la columna «Vendedor» vacía,
 * y no es un dato que se perdió: son los pedidos que armó el CLIENTE desde el
 * link, donde no hubo vendedor. Una celda en blanco se lee como «falta
 * cargarlo». Se dice lo que es, con la misma palabra de la pantalla.
 */
export const VENDEDOR_DEL_CLIENTE = "Lo armó el cliente";
/** Un pedido interno sin vendedor sí es un dato que falta, y se dice distinto. */
export const VENDEDOR_SIN_DATO = "Sin vendedor";

/** dd/mm/yyyy en hora local desde un timestamp ISO (created_at es timestamptz). */
export function fmtFechaPedido(iso: string): string {
  const d = fechaPedido(iso);
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** El mismo día calendario que imprimía `fmtFechaPedido`, como Date. */
export function fechaPedido(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Los campos con los que `numeros-pedido.ts` decide qué es y dónde está. */
function numerosDe(p: PedidoExportRow): NumerosDePedido {
  return {
    numeroPedido: p.numero_pedido ?? null,
    switchNumero: p.switch_numero ?? null,
    switchDocumento: p.switch_documento ?? null,
    fuente: p.fuente,
    status: p.status ?? null,
    ...(typeof p.en_switch === "boolean" ? { enSwitch: p.en_switch } : {}),
  };
}

/** El vendedor tal como se lee: nunca una celda en blanco sin explicación. */
export function textoVendedor(p: PedidoExportRow): string {
  const v = (p.vendor || "").trim();
  if (v) return v;
  const delCliente = p.origen === "link" || p.fuente === "publicos";
  return delCliente ? VENDEDOR_DEL_CLIENTE : VENDEDOR_SIN_DATO;
}

/** Construye el workbook de comprobantes. Función pura, testeable. */
export function buildPedidosWorkbook(opts: PedidosWorkbookOpts): XLSX.WorkBook {
  const { marca, conOrigen, pedidos, conNumeros = true } = opts;

  // 🔴 LAS COLUMNAS NUEVAS VAN AL FINAL, NO INTERCALADAS. Daniel puede tener
  // una planilla enganchada a este archivo: mover una columna existente se la
  // corre entera. Las 6 de siempre quedan donde estaban, en su orden.
  const columns: ReportColumn[] = [
    ...(conOrigen ? [{ header: "Origen", wch: 14 } as ReportColumn] : []),
    { header: "Cliente", wch: 28 },
    { header: "Vendedor", wch: 20 },
    { header: "Items", wch: 8, align: "right", fmt: "0" },
    { header: "Total", wch: 13, align: "right", fmt: MONEY_FMT },
    { header: "Fecha", wch: 12 },
    ...(conNumeros
      ? ([
          { header: "N° pedido", wch: 14 },
          { header: "Switch", wch: 30 },
          { header: "Tipo", wch: 12 },
          { header: "En Switch", wch: 10, align: "center" },
        ] as ReportColumn[])
      : []),
  ];

  let grandTotal = 0;
  let grandItems = 0;
  const rows: ReportCell[][] = pedidos.map((p) => {
    grandTotal += p.total;
    grandItems += p.item_count;
    // 🔴 EL QUE NO SALIÓ DICE QUE NO SALIÓ, NO UN GUION. Un guion en la columna
    // de un número se lee como un cero o como un dato que no cargó. Y el que sí
    // salió dice SIEMPRE si fue pedido o COTIZACIÓN: una cotización NO aparta
    // mercancía y con el número solo las dos se ven iguales. Criterio EXACTO de
    // la pantalla — es el mismo módulo, no una copia.
    const numeros = numerosDe(p);
    const salio = estaEnSwitch(numeros);
    return [
      ...(conOrigen ? [ORIGEN_LABEL[p.origen === "link" ? "link" : "mio"]] : []),
      p.cliente || "Sin nombre",
      textoVendedor(p),
      p.item_count,
      { v: p.total, bold: true },
      // 🔴 Fecha DE VERDAD: número con formato de fecha, no un texto que se le
      // parece. Se sigue leyendo 14/09/2026 y encima se filtra por rango.
      { fecha: fechaPedido(p.created_at) },
      ...(conNumeros
        ? [
            textoNumeroPedido(numeros),
            textoEnSwitch(numeros),
            TIPO_LABEL[tipoComprobante(numeros)],
            salio
              ? EN_SWITCH_SI
              : { v: EN_SWITCH_NO, fg: ROJO_FALTA, bold: true },
          ]
        : []),
    ];
  });

  // 🔴 «TOTAL» NO SE PONE ENCIMA DE UNA COLUMNA DE NÚMEROS. Estaba justo arriba
  // de «Items», así que el gran total de dinero ($19.362 en el archivo real de
  // Calvin) se leía como si fueran items. La palabra baja a la primera columna
  // —que es texto— y la de Items ahora SÍ suma, que es lo que una columna de
  // cantidades tiene que hacer en la fila de totales.
  const totals: ReportCell[] = [
    ...(conOrigen ? ["TOTAL"] : []),
    conOrigen ? null : "TOTAL",
    null,
    grandItems,
    grandTotal,
    null,
    ...(conNumeros ? [null, null, null, null] : []),
  ];

  const ws = buildReportSheet({
    columns,
    rows,
    totals,
    palette: paletaDeMarca(marca),
  });

  return workbookFromSheets([{ name: HOJA_COMPROBANTES, ws }]);
}
