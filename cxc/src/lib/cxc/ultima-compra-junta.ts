// «Última compra» = TODO lo que el cliente compró ese día en esa empresa
// (17-nov-2026, propuesta para Daniel: «a veces los clientes me compran en
// varias facturas y quisiera que se pueda juntar todas»).
//
// Medido contra producción (6 empresas del grupo, 12 meses, sin TCKCTA):
//   · mismo cliente + misma empresa + mismo día → 292 compras de 2 o más
//     facturas (787 facturas), en el 29,6 % de los clientes;
//   · mismo N.º de pedido → 0: en Switch cada pedido sale en UNA factura; lo
//     que se parte son varios PEDIDOS facturados el mismo día;
//   · ventana de 3 días → encadena compras distintas (Multi Fashion juntaba
//     del 6 al 19-oct en una sola).
//   · ventana de 1 a 14 días → sin corte natural; con el N.º de pedido, la
//     mitad de lo que se pega al día siguiente ya es OTRA compra (≈80 % a 4-7 d).
//     Daniel aprobó el MISMO DÍA el 17-nov-2026.
// Las notas de crédito del MISMO día RESTAN: 95 anulan exacta una factura de
// ese día (se factura, se anula y se vuelve a facturar).
// 🔴 Si el día da cero o negativo (una NC que anula algo de otro día), la
// compra que se muestra es la del último día con neto POSITIVO.
//
// 🔴 Interruptor PRENDIDO (17-nov-2026): con `false` la ruta y la pantalla
// quedan como antes (la última factura sola).
import { fechaPanamaDe } from "@/lib/fecha-panama";

export const ULTIMA_COMPRA_JUNTA_2026_11 = true;

export const TIPOS_DE_LA_COMPRA = ["Factura", "Nota de Crédito"] as const;

export interface DocumentoDeCompra {
  secuencial: string;
  tipo: string;
  /** Positivo siempre, como llega de Switch; la nota de crédito RESTA. */
  total: number;
}

export interface DocumentoLeido extends DocumentoDeCompra {
  empresa_key: string;
  cliente_switch_id: number;
  fecha: string;
}

/** La llave de la compra: empresa · cliente · día de Panamá. */
export const llaveDeCompra = (empresa: string, clienteSwitchId: number, dia: string) =>
  `${empresa}|${clienteSwitchId}|${dia}`;

/** Agrupa lo leído de `switch_facturas` por empresa · cliente · día de Panamá. */
export function agruparPorDia(docs: DocumentoLeido[]): Map<string, DocumentoDeCompra[]> {
  const m = new Map<string, DocumentoDeCompra[]>();
  for (const d of docs) {
    const k = llaveDeCompra(d.empresa_key, d.cliente_switch_id, fechaPanamaDe(d.fecha));
    const lista = m.get(k) ?? [];
    lista.push({ secuencial: d.secuencial, tipo: d.tipo, total: Number(d.total) || 0 });
    m.set(k, lista);
  }
  return m;
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

/** Facturas primero (por número), después las notas de crédito. */
export function ordenarDocumentos(docs: DocumentoDeCompra[]): DocumentoDeCompra[] {
  return [...docs].sort(
    (a, b) =>
      Number(a.tipo !== "Factura") - Number(b.tipo !== "Factura") ||
      a.secuencial.localeCompare(b.secuencial),
  );
}

/** Rango UTC de un día de Panamá (UTC−5 fijo): [d 05:00Z, d+1 05:00Z). */
export function rangoDelDia(dia: string): [string, string] {
  const ini = new Date(`${dia}T05:00:00.000Z`);
  const fin = new Date(ini.getTime() + 86_400_000);
  return [ini.toISOString(), fin.toISOString()];
}

export interface CompraJunta {
  dia: string;
  monto: number;
  documentos: DocumentoDeCompra[];
}

/**
 * La última compra de UN cliente en UNA empresa: el día de Panamá más reciente
 * con alguna factura cuyo neto (facturas − notas de crédito del día) sea
 * POSITIVO. Un día que da cero o negativo se salta. `null` = ninguno positivo.
 */
export function ultimaCompraPositiva(docs: DocumentoLeido[]): CompraJunta | null {
  const porDia = new Map<string, DocumentoDeCompra[]>();
  for (const d of docs) {
    const dia = fechaPanamaDe(d.fecha);
    const lista = porDia.get(dia) ?? [];
    lista.push({ secuencial: d.secuencial, tipo: d.tipo, total: Number(d.total) || 0 });
    porDia.set(dia, lista);
  }
  for (const dia of [...porDia.keys()].sort().reverse()) {
    const delDia = porDia.get(dia)!;
    if (!delDia.some((d) => d.tipo === "Factura")) continue;
    const monto = montoDeLaCompra(delDia);
    if (monto > 0) return { dia, monto, documentos: ordenarDocumentos(delDia) };
  }
  return null;
}

/** Del grupo: el día más reciente, y si varias empresas compraron ese día, la suma. */
export function juntarDelDiaMasReciente(compras: CompraJunta[]): CompraJunta | null {
  if (compras.length === 0) return null;
  const dia = compras.map((c) => c.dia).sort().at(-1)!;
  const delDia = compras.filter((c) => c.dia === dia);
  return {
    dia,
    monto: delDia.reduce((s, c) => s + Math.round(c.monto * 100), 0) / 100,
    documentos: delDia.flatMap((c) => c.documentos),
  };
}
