// «Última compra» = TODO lo facturado al cliente en esa empresa en los 7 DÍAS
// CORRIDOS que terminan en su última factura, menos las notas de crédito de
// esos días (Daniel, 17-nov-2026: «a veces los clientes me compran en varias
// facturas»; y al ver los casos: «Todas son la misma» → propuso 7 días).
//
// Medido contra producción (6 empresas, 12 meses, sin TCKCTA): el mismo día
// junta 292 compras; con 7 días la última compra de 72 de 243 clientes cambia.
// 🔴 La ventana se ANCLA en la última factura y NO se encadena hacia atrás:
// encadenando, Multi Fashion juntaba 35 días seguidos.
// 🔴 Si la ventana da cero o negativo (una NC que anula algo de antes), la
// compra que se muestra es la ventana anterior con neto POSITIVO, anclada en la
// última factura de antes de esa ventana.
//
// 🔴 Interruptor PRENDIDO: con `false` la ruta y la pantalla quedan como antes
// (la última factura sola).
import { fechaPanamaDe } from "@/lib/fecha-panama";

export const ULTIMA_COMPRA_JUNTA_2026_11 = true;

/** Los días corridos de la ventana, contando el de la última factura. */
export const DIAS_DE_LA_COMPRA = 7;

export const TIPOS_DE_LA_COMPRA = ["Factura", "Nota de Crédito"] as const;

export interface DocumentoDeCompra {
  secuencial: string;
  tipo: string;
  /** Positivo siempre, como llega de Switch; la nota de crédito RESTA. */
  total: number;
  /** Día de Panamá del documento (`YYYY-MM-DD`). */
  dia?: string;
}

export interface DocumentoLeido {
  empresa_key: string;
  cliente_switch_id: number;
  fecha: string;
  secuencial: string;
  tipo: string;
  total: number;
}

export interface CompraJunta {
  /** Primer y último día de la ventana (el último = la factura que la ancla). */
  desde: string;
  dia: string;
  monto: number;
  documentos: DocumentoDeCompra[];
}

/** El monto de la compra: facturas menos notas de crédito, en centavos enteros. */
export function montoDeLaCompra(docs: DocumentoDeCompra[]): number {
  let c = 0;
  for (const d of docs) {
    const v = Math.round(d.total * 100);
    if (d.tipo === "Factura") c += v;
    else if (d.tipo === "Nota de Crédito") c -= v;
  }
  return c / 100;
}

/** Por día; dentro del día, facturas primero (por número) y después las NC. */
export function ordenarDocumentos(docs: DocumentoDeCompra[]): DocumentoDeCompra[] {
  return [...docs].sort(
    (a, b) =>
      (a.dia ?? "").localeCompare(b.dia ?? "") ||
      Number(a.tipo !== "Factura") - Number(b.tipo !== "Factura") ||
      a.secuencial.localeCompare(b.secuencial),
  );
}

/** `YYYY-MM-DD` menos n días. */
export function restarDias(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
}

/** El primer día de la ventana que termina en `dia`. */
export const inicioDeVentana = (dia: string) => restarDias(dia, DIAS_DE_LA_COMPRA - 1);

/** Rango UTC de los días de Panamá [desde, hasta] (UTC−5 fijo). */
export function rangoDeDias(desde: string, hasta: string): [string, string] {
  const ini = new Date(`${desde}T05:00:00.000Z`);
  const fin = new Date(new Date(`${hasta}T05:00:00.000Z`).getTime() + 86_400_000);
  return [ini.toISOString(), fin.toISOString()];
}

/**
 * La última compra de UN cliente en UNA empresa: la ventana de 7 días que
 * termina en su última factura; si da cero o negativo, la ventana anclada en la
 * última factura ANTERIOR a esa ventana, y así. `null` = ninguna positiva.
 */
export function ultimaCompraPositiva(docs: DocumentoLeido[]): CompraJunta | null {
  const conDia: DocumentoDeCompra[] = docs.map((d) => ({
    secuencial: d.secuencial,
    tipo: d.tipo,
    total: Number(d.total) || 0,
    dia: fechaPanamaDe(d.fecha),
  }));
  const diasConFactura = [...new Set(conDia.filter((d) => d.tipo === "Factura").map((d) => d.dia!))]
    .sort()
    .reverse();
  let i = 0;
  while (i < diasConFactura.length) {
    const dia = diasConFactura[i];
    const desde = inicioDeVentana(dia);
    const ventana = conDia.filter((d) => d.dia! >= desde && d.dia! <= dia);
    const monto = montoDeLaCompra(ventana);
    if (monto > 0) return { desde, dia, monto, documentos: ordenarDocumentos(ventana) };
    while (i < diasConFactura.length && diasConFactura[i] >= desde) i++;
  }
  return null;
}

/** Del grupo (ficha): la ventana más reciente; si varias empresas terminan ese día, se suman. */
export function juntarDelDiaMasReciente(compras: CompraJunta[]): CompraJunta | null {
  if (compras.length === 0) return null;
  const dia = compras.map((c) => c.dia).sort().at(-1)!;
  const delDia = compras.filter((c) => c.dia === dia);
  return {
    desde: delDia.map((c) => c.desde).sort()[0],
    dia,
    monto: delDia.reduce((s, c) => s + Math.round(c.monto * 100), 0) / 100,
    documentos: ordenarDocumentos(delDia.flatMap((c) => c.documentos)),
  };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corto = (d: string) => `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}`;

/**
 * Los días que de verdad tienen documentos, en corto: «12 nov», «15–17 nov»,
 * «28 oct – 3 nov». El rango es del PRIMER al ÚLTIMO documento, no de la ventana.
 */
export function rangoDeLaCompra(docs: DocumentoDeCompra[]): string {
  const dias = docs.map((d) => d.dia).filter((d): d is string => !!d).sort();
  if (dias.length === 0) return "";
  const a = dias[0];
  const b = dias[dias.length - 1];
  if (a === b) return corto(a);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8, 10))}–${corto(b)}`;
  return `${corto(a)} – ${corto(b)}`;
}
