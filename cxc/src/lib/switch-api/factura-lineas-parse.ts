// ─────────────────────────────────────────────────────────────────────────────
// El detalle de línea de un documento de Switch → filas de la tabla.
// Módulo PURO: ni Supabase, ni red, ni reloj. Todo lo que decide qué se guarda
// vive acá para que se pueda probar sin credenciales y sin tocar producción.
// ─────────────────────────────────────────────────────────────────────────────

import { B2B_EMPRESA_KEYS, type EmpresaKey } from "@/lib/empresa-mapping";

/**
 * Las 6 empresas de Fashion Group. NO se escribe a mano: se DERIVA.
 *
 * ⚠️ POR QUÉ NO ENTRAN LAS OTRAS DOS, y no es un olvido:
 *
 *  · `american_classic` (Multifashion) es RETAIL. Sus 27.938 facturas son
 *    tiquetes de mostrador a nombre del cliente `Contado` (código TCKCTA), así
 *    que "qué producto le vendo a cada cliente" no tiene respuesta ahí — y
 *    bajarlas serían 29.000 peticiones a Switch para poblar una columna que
 *    diría siempre lo mismo. Su análisis por producto ya existe y vive en
 *    Multifashion › Productos, sobre `switch_articulo_diario`.
 *
 *  · `confecciones_boston` se lleva fuera de este sistema (su CXC va por Brand
 *    It). Es la misma exclusión que ya aplican recibos y utilidad.
 *
 * Si algún día hace falta una de las dos, se agrega acá con su motivo escrito
 * — no ampliando la lista en silencio.
 *
 * Vive en el módulo PURO a propósito: así el candado que la vigila corre sin
 * credenciales y sin arrastrar Supabase.
 */
export function empresasConDetalleDeLinea(): EmpresaKey[] {
  return [...B2B_EMPRESA_KEYS];
}

/** Los dos tipos que tienen endpoint de detalle. Un tiquete o una transacción
 *  NO lo tienen: pedirlo devuelve vacío, y guardar eso como "documento sin
 *  líneas" sería inventar que no se vendió nada. */
export const TIPOS_CON_DETALLE = ["Factura", "Nota de Crédito"] as const;
export type TipoConDetalle = (typeof TIPOS_CON_DETALLE)[number];

export function tieneDetalle(tipo: string | null | undefined): tipo is TipoConDetalle {
  return TIPOS_CON_DETALLE.includes(tipo as TipoConDetalle);
}

/** La cabecera que ya vive en `switch_facturas` — no se vuelve a pedir. */
export interface CabeceraDocumento {
  empresa_key: string;
  tipo_comprobante: string;
  switch_factura_id: number;
  secuencial: string | null;
  fecha: string;
  cliente_switch_id: number | null;
  cliente_nombre: string | null;
  vendedor_switch_id: number | null;
  vendedor_nombre: string | null;
}

export interface LineaFactura {
  empresa_key: string;
  tipo_comprobante: string;
  switch_factura_id: number;
  linea_orden: number;
  secuencial: string | null;
  fecha: string;
  cliente_switch_id: number | null;
  cliente_nombre: string | null;
  vendedor_switch_id: number | null;
  vendedor_nombre: string | null;
  articulo_switch_id: number | null;
  codigo: string | null;
  descripcion: string | null;
  rubro: string | null;
  subrubro: string | null;
  marca: string | null;
  cantidad: number;
  precio: number | null;
  descuento_pct: number | null;
  subtotal_con_descuento: number;
}

/**
 * Los montos de Switch llegan como texto y a veces con coma de miles
 * ("78,270.0000"). `Number("78,270.0000")` da **NaN**, y un NaN que entra a una
 * suma la vuelve NaN entera sin un solo error a la vista. Se limpia acá, una
 * sola vez, para que ningún llamador tenga que acordarse.
 */
export function numeroDeSwitch(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const limpio = String(v).replace(/,/g, "").trim();
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Convierte el `detalle[]` que devuelve Switch en filas de la tabla.
 *
 * 🔴 SE GUARDAN MAGNITUDES. El dato crudo NO es homogéneo, y esto está medido
 * contra producción el 24-ago-2026:
 *
 *     factura  →  cantidad "24.0000"   subTotalConDescuento "720.0000"
 *     NC       →  cantidad "-1.0000"   subTotalConDescuento "758.2700"
 *
 * O sea que en una nota de crédito la CANTIDAD viene negativa y el MONTO
 * positivo. Guardar eso tal cual metería dos convenciones en la misma tabla y
 * cualquiera que sumara sin mirar el tipo obtendría un número que no significa
 * nada. Se guarda `Math.abs()` de las dos y el signo lo pone la lectura, con
 * `signoDeTipo` — la misma convención de `switch_facturas` y
 * `switch_articulo_diario`.
 *
 * 🔴 EL ORDEN ES LA LLAVE. La línea de una FACTURA trae `id`; la de una NOTA DE
 * CRÉDITO **no trae ninguno** (verificado contra producción). Por eso la
 * identidad de una línea es su POSICIÓN en el documento: existe siempre, en los
 * dos tipos, y un documento ya emitido no se reordena. Si el orden se perdiera,
 * dos líneas del mismo artículo en el mismo documento colapsarían en una.
 */
export function lineasDeDocumento(
  cab: CabeceraDocumento,
  detalle: readonly unknown[],
): LineaFactura[] {
  return detalle.map((crudo, orden) => {
    const d = (crudo ?? {}) as Record<string, unknown>;
    const cantidad = numeroDeSwitch(d.cantidad) ?? 0;
    const subtotal = numeroDeSwitch(d.subTotalConDescuento) ?? 0;
    return {
      empresa_key: cab.empresa_key,
      tipo_comprobante: cab.tipo_comprobante,
      switch_factura_id: cab.switch_factura_id,
      linea_orden: orden,
      secuencial: cab.secuencial,
      fecha: cab.fecha,
      cliente_switch_id: cab.cliente_switch_id,
      cliente_nombre: cab.cliente_nombre,
      vendedor_switch_id: cab.vendedor_switch_id,
      vendedor_nombre: cab.vendedor_nombre,
      articulo_switch_id: numeroDeSwitch(d.articuloId),
      codigo: texto(d.codigoArticulo),
      descripcion: texto(d.descripcion),
      rubro: texto(d.rubro),
      subrubro: texto(d.subrubro),
      marca: texto(d.marca),
      cantidad: Math.abs(cantidad),
      precio: numeroDeSwitch(d.precio),
      descuento_pct: numeroDeSwitch(d.descuento),
      subtotal_con_descuento: Math.abs(subtotal),
    };
  });
}

/**
 * El signo con el que una línea entra en una suma.
 *
 * Es la regla #1 de este repo, escrita en CLAUDE.md: **una nota de crédito es
 * una factura que nunca debió existir, así que RESTA**. La firma del error
 * cuando alguien la suma es inconfundible — la diferencia da EXACTO el doble de
 * las notas de crédito.
 *
 * ⚠️ El `===` compara contra `'Nota de Crédito'` CON TILDE, que es como está
 * escrito en la base. Compararlo sin tilde no lanza ningún error: simplemente
 * el signo no se aplica nunca y el total queda mal en silencio.
 */
export function signoDeTipo(tipo: string): 1 | -1 {
  return tipo === "Nota de Crédito" ? -1 : 1;
}

/** Unidades netas de un conjunto de líneas: las NC restan. */
export function unidadesNetas(lineas: readonly LineaFactura[]): number {
  return lineas.reduce((t, l) => t + signoDeTipo(l.tipo_comprobante) * l.cantidad, 0);
}

/** Venta neta (sin ITBMS, con el descuento ya aplicado): las NC restan. */
export function ventaNeta(lineas: readonly LineaFactura[]): number {
  return lineas.reduce(
    (t, l) => t + signoDeTipo(l.tipo_comprobante) * l.subtotal_con_descuento,
    0,
  );
}
