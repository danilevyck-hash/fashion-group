// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — EL PAPEL: LO QUE SE DIBUJA, EN EL MISMO ORDEN QUE LA PANTALLA
// (11-sep-2026, mockup aprobado por Daniel).
//
// El PDF y el Excel del reclamo decían lo mismo de tres formas distintas: el
// PDF abría con CUATRO cajas de totales y una rejilla de metadatos en tres
// columnas; el Excel con cinco renglones de ficha; y la pantalla, desde el
// rediseño del 10/11-sep, con una sola línea. Este módulo es la ÚNICA fuente
// de qué columnas salen, en qué orden y con qué totales al pie — y lo usan las
// dos superficies, así que no se pueden volver a separar.
//
// 🔴 LAS COLUMNAS VACÍAS NO SE DIBUJAN. Género, Factura y PO desaparecen si
// NINGUNA fila las trae, exactamente como en la pantalla (`conGenero`,
// `conFactura`, `conPO` de `ReclamoDetail`). Una columna de guiones ocupa el
// ancho que necesita la descripción y no dice nada.
//
// 🔴 EL GÉNERO VIAJA EN INGLÉS y eso no se toca: `reclamo_items.genero` tiene
// un CHECK que solo admite Men/Women/Kids/Accessories, y el papel se le manda a
// marcas extranjeras. Lo que se traduce es la PANTALLA, no el papel.
//
// 🔴 EL TOTAL SE CALCULA UNA SOLA VEZ, en `reclamoTaxes`. Acá no hay ninguna
// multiplicación de impuestos: se pide y se acomoda. Un papel que recalcula es
// un papel que un día dice otra cosa que la pantalla.
//
// Módulo PURO: ni jsPDF, ni xlsx, ni Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { impLabel, itbmsLabel, ocultaPedido, reclamoTaxes } from "./tax";
import { facturasEnPantalla } from "./facturas";
import { motivoEnPantalla } from "./texto";

/** Pie de los papeles de la casa — el mismo del estado de cuenta del CXC. */
export const PIE_PAPEL = "Confidencial · fashiongr.com";

export interface ItemDePapel {
  referencia?: string | null;
  descripcion?: string | null;
  talla?: string | null;
  genero?: string | null;
  cantidad?: number | null;
  precio_unitario?: number | null;
  motivo?: string | null;
  nro_factura?: string | null;
  nro_orden_compra?: string | null;
  deleted?: boolean | null;
}

export interface ReclamoDePapel {
  nro_reclamo?: string | null;
  empresa?: string | null;
  proveedor?: string | null;
  marca?: string | null;
  nro_factura?: string | null;
  nro_orden_compra?: string | null;
  fecha_factura?: string | null;
  fecha_reclamo?: string | null;
  reclamo_items?: ItemDePapel[] | null;
}

export interface ContactoDePapel {
  nombre_contacto?: string | null;
}

export type ClaveColumna =
  | "referencia"
  | "descripcion"
  | "talla"
  | "genero"
  | "cantidad"
  | "precio_unitario"
  | "subtotal"
  | "motivo"
  | "nro_factura"
  | "nro_orden_compra";

export type TipoColumna = "texto" | "entero" | "dinero";

export interface ColumnaPapel {
  clave: ClaveColumna;
  rotulo: string;
  tipo: TipoColumna;
  /** Ancho de la columna en el Excel (caracteres). */
  wch: number;
  /** Ancho de la columna en el PDF (mm). `null` = la que se estira. */
  mm: number | null;
}

/**
 * El orden es el de la PANTALLA (`ReclamoDetail`, tabla de solo lectura):
 * Estilo · Descripción · Talla · [Género] · Cant. · Precio · Subtotal · Motivo
 * · [Factura] · [PO]. Las tres entre corchetes son las condicionales.
 */
const TODAS: ColumnaPapel[] = [
  { clave: "referencia", rotulo: "Estilo", tipo: "texto", wch: 14, mm: 24 },
  { clave: "descripcion", rotulo: "Descripción", tipo: "texto", wch: 28, mm: null },
  { clave: "talla", rotulo: "Talla", tipo: "texto", wch: 8, mm: 13 },
  { clave: "genero", rotulo: "Género", tipo: "texto", wch: 11, mm: 18 },
  { clave: "cantidad", rotulo: "Cant.", tipo: "entero", wch: 7, mm: 12 },
  { clave: "precio_unitario", rotulo: "Precio", tipo: "dinero", wch: 12, mm: 18 },
  { clave: "subtotal", rotulo: "Subtotal", tipo: "dinero", wch: 13, mm: 20 },
  { clave: "motivo", rotulo: "Motivo", tipo: "texto", wch: 20, mm: 26 },
  { clave: "nro_factura", rotulo: "Factura", tipo: "texto", wch: 16, mm: 24 },
  { clave: "nro_orden_compra", rotulo: "PO", tipo: "texto", wch: 12, mm: 18 },
];

/** Las tres columnas que solo salen si alguna fila las trae. */
const CONDICIONALES: ClaveColumna[] = ["genero", "nro_factura", "nro_orden_compra"];

/** Los renglones vigentes (los borrados no se dibujan ni se suman). */
export function itemsDelPapel(rec: ReclamoDePapel): ItemDePapel[] {
  return (rec.reclamo_items ?? []).filter((i) => !i?.deleted);
}

/** Las columnas que de verdad se dibujan para este juego de renglones. */
export function columnasDelPapel(items: readonly ItemDePapel[]): ColumnaPapel[] {
  return TODAS.filter((c) => {
    if (!CONDICIONALES.includes(c.clave)) return true;
    return items.some((i) => !!String(i[c.clave as keyof ItemDePapel] ?? "").trim());
  });
}

/** El subtotal de UN renglón. */
export function subtotalDeItem(item: ItemDePapel): number {
  return (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0);
}

/** El subtotal del reclamo: la suma de los renglones vigentes. */
export function subtotalDelPapel(items: readonly ItemDePapel[]): number {
  return items.reduce((s, i) => s + subtotalDeItem(i), 0);
}

/**
 * El valor CRUDO de una celda: número donde es número (para que el Excel lo
 * pueda sumar) y texto donde es texto. Formatearlo es de quien dibuja.
 */
export function valorDeCelda(item: ItemDePapel, clave: ClaveColumna): string | number {
  switch (clave) {
    case "cantidad":
      return Number(item.cantidad) || 0;
    case "precio_unitario":
      return Number(item.precio_unitario) || 0;
    case "subtotal":
      return subtotalDeItem(item);
    // El motivo se tecleó de 14 formas para 5 problemas: se capitaliza al leer,
    // con la MISMA función que la pantalla. Lo guardado no se toca.
    case "motivo":
      return motivoEnPantalla(item.motivo);
    default:
      return String(item[clave as keyof ItemDePapel] ?? "");
  }
}

export interface TotalDePapel {
  rotulo: string;
  valor: number;
  /** true = la línea gruesa del final, con raya arriba. */
  fuerte: boolean;
}

/**
 * El pie de totales, a la derecha y uno debajo del otro, como el pie de la
 * factura del proveedor: Subtotal · Importación N% · ITBMS N% · Total.
 * Active Shoes no lleva ITBMS y su importación es 15% — lo decide `reclamoTaxes`.
 */
export function totalesDelPapel(empresa: string | null | undefined, subtotal: number): TotalDePapel[] {
  const tx = reclamoTaxes(empresa, subtotal);
  return [
    { rotulo: "Subtotal", valor: subtotal, fuerte: false },
    { rotulo: `Importación ${impLabel(empresa)}`, valor: tx.importacion, fuerte: false },
    ...(tx.hasItbms ? [{ rotulo: `ITBMS ${itbmsLabel(empresa)}`, valor: tx.itbms, fuerte: false }] : []),
    { rotulo: "Total", valor: tx.total, fuerte: true },
  ];
}

export interface DatoDePapel {
  rotulo: string;
  valor: string;
}

/**
 * La línea de datos bajo la cabecera: `Proveedor X · Marca Y · Factura Z ·
 * Contacto W`. Lo que no existe NO se escribe: un «Marca —» es un renglón para
 * decir que no hay nada que decir. El N° de pedido entra al final cuando la
 * empresa lo usa (Active Shoes no).
 */
export function datosDelPapel(rec: ReclamoDePapel, contacto?: ContactoDePapel | null): DatoDePapel[] {
  const facturas = facturasEnPantalla(rec.nro_factura ?? "");
  const pares: DatoDePapel[] = [
    { rotulo: "Proveedor", valor: String(rec.proveedor ?? "").trim() },
    { rotulo: "Marca", valor: String(rec.marca ?? "").trim() },
    { rotulo: facturas.includes("·") ? "Facturas" : "Factura", valor: facturas },
    ...(ocultaPedido(rec.empresa)
      ? []
      : [{ rotulo: "PO", valor: String(rec.nro_orden_compra ?? "").trim() }]),
    { rotulo: "Contacto", valor: String(contacto?.nombre_contacto ?? "").trim() },
  ];
  return pares.filter((p) => !!p.valor);
}

/**
 * La fecha que va a la derecha de la cabecera, al lado del N° de reclamo: la
 * de la FACTURA, que es la que mide los días desde el rediseño. Si ese reclamo
 * viejo todavía no la tiene, cae a la del reclamo — nunca a «hoy», que sería
 * inventar una fecha nueva cada vez que se imprime el mismo papel.
 */
export function fechaDeLaCabecera(rec: ReclamoDePapel): string | null {
  const f = (rec.fecha_factura ?? "").slice(0, 10);
  if (f) return f;
  const r = (rec.fecha_reclamo ?? "").slice(0, 10);
  return r || null;
}
