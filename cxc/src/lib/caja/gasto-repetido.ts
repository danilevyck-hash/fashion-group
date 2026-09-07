/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — EL MISMO RECIBO CARGADO DOS VECES (7-sep-2026).
 *
 * 🩸 Medido sobre los 77 recibos vivos, hay DOS pares que son un doble toque al
 * guardar, no dos compras:
 *   · Super 99, 9-jul, $10.59, factura 196854200 — las dos filas creadas con
 *     39 segundos de diferencia;
 *   · La Parrillada, 13-ago, $5.00, sin factura — 6 segundos de diferencia.
 *
 * 🔴 **Avisa, NUNCA bloquea.** A veces se compra dos veces en el mismo lugar el
 * mismo día — y eso está medido también: Market Fresh tiene CUATRO recibos de
 * $5.00 el 9 de julio, y son cuatro compras reales, cada una con SU número de
 * factura (00016528 · 00016706 · 00016500 · 00016579). Por eso el criterio no
 * puede ser «mismo día, mismo proveedor, mismo monto» a secas: eso acusaría a
 * esos cuatro.
 *
 * 🔴 EL CRITERIO, medido contra los 77:
 *   · Si los DOS traen número de factura → es repetido cuando coinciden **el
 *     día y el número de factura**. Dos compras distintas no comparten factura.
 *   · Si a alguno le falta la factura (34 de 77 no la tienen) → es repetido
 *     cuando coinciden **día, proveedor y monto**.
 * Con esa regla, de los 77 recibos vivos suenan exactamente los 2 pares de
 * arriba y ni uno de los 4 de Market Fresh.
 *
 * El pareo es EXACTO y normalizado, nunca por parecido: «Market Fresh» y
 * «Market Fresch» son dos escrituras y aquí cuentan como dos proveedores
 * distintos — inventar que son el mismo es cómo nace un aviso que miente.
 *
 * Módulo PURO: sin I/O, sin React, sin `new Date()`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { centavos } from "./dinero";

export interface GastoComparable {
  id?: string | null;
  fecha?: string | null;
  proveedor?: string | null;
  nro_factura?: string | null;
  total?: number | string | null;
  descripcion?: string | null;
}

/**
 * Normaliza un nombre de proveedor para comparar: sin bordes, sin acentos, en
 * minúsculas y con los espacios de adentro colapsados. Nada más — ni recortes,
 * ni distancia de edición.
 */
export function proveedorNormalizado(valor: string | null | undefined): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Normaliza un número de factura: solo letras y dígitos, en mayúsculas, sin los
 * ceros de adelante (Switch y los recibos de tienda escriben «00016528» y
 * «16528» para el mismo papel).
 *
 * Devuelve cadena VACÍA cuando lo escrito no identifica nada — vacío, «0», o
 * puro relleno. Medido: 34 de 77 recibos no tienen factura y 3 la tienen con
 * basura («Comida», «0», «1»). Una factura vacía nunca parea con otra vacía por
 * el número: para esos casos manda el proveedor y el monto.
 */
export function facturaNormalizada(valor: string | null | undefined): string {
  const limpio = String(valor ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const sinCeros = limpio.replace(/^0+/, "");
  return sinCeros;
}

/** ¿Este recibo trae un número de factura que sirva para reconocerlo? */
export function tieneFacturaUtil(g: GastoComparable): boolean {
  return facturaNormalizada(g.nro_factura).length > 0;
}

/**
 * ¿Estos dos recibos son el mismo cargado dos veces? Aplica el criterio de
 * arriba. Nunca compara la descripción: «Comida» está en 47 de los 77.
 */
export function esElMismoRecibo(a: GastoComparable, b: GastoComparable): boolean {
  const mismoDia = String(a.fecha ?? "") === String(b.fecha ?? "") && !!a.fecha;
  if (!mismoDia) return false;

  if (tieneFacturaUtil(a) && tieneFacturaUtil(b)) {
    return facturaNormalizada(a.nro_factura) === facturaNormalizada(b.nro_factura);
  }

  const mismoProveedor =
    proveedorNormalizado(a.proveedor) === proveedorNormalizado(b.proveedor) &&
    proveedorNormalizado(a.proveedor).length > 0;
  return mismoProveedor && centavos(a.total) === centavos(b.total);
}

/**
 * Busca en los gastos ya cargados uno que sea el mismo que `nuevo`. Devuelve el
 * primero que encuentra, o `null`. Un gasto no se parea consigo mismo (al
 * editar, el `id` que viene se salta).
 */
export function buscarGastoRepetido(
  nuevo: GastoComparable,
  existentes: GastoComparable[],
): GastoComparable | null {
  for (const g of existentes) {
    if (nuevo.id && g.id && nuevo.id === g.id) continue;
    if (esElMismoRecibo(nuevo, g)) return g;
  }
  return null;
}

/** Día en palabras, para el aviso: «9 de julio». Sin `new Date()`. */
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
export function diaEnPalabras(fecha: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha ?? ""));
  if (!m) return String(fecha ?? "");
  const mes = MESES[Number(m[2]) - 1];
  if (!mes) return String(fecha ?? "");
  return `${Number(m[3])} de ${mes}`;
}

/**
 * El aviso, tal como se lee en pantalla. Dice CUÁL es el gasto que ya está
 * cargado, para que Angela decida sin ir a buscarlo.
 *
 * «Ya hay un gasto igual el 9 de julio: Super 99, $10.59, factura 196854200».
 */
export function mensajeGastoRepetido(g: GastoComparable): string {
  const partes: string[] = [];
  const proveedor = String(g.proveedor ?? "").trim();
  if (proveedor) partes.push(proveedor);
  partes.push(`$${centavos(g.total).toFixed(2)}`);
  const factura = String(g.nro_factura ?? "").trim();
  if (tieneFacturaUtil(g)) partes.push(`factura ${factura}`);
  return `Ya hay un gasto igual el ${diaEnPalabras(g.fecha)}: ${partes.join(", ")}.`;
}
