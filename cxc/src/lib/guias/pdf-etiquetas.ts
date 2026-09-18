// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › ETIQUETAS — EL PAPEL. Hoja carta partida en CUARTOS, cuatro etiquetas
// por hoja, con líneas de corte punteadas.
//
// jsPDF, como TODO el papel de la casa (la guía, los pedidos, las comisiones,
// los reclamos, la planilla). 🔴 No se estrenó ninguna librería: la auditoría
// del 18-sep-2026 confirmó que el proyecto no tiene ni una dependencia de
// código de barra ni de QR, y la etiqueta aprobada no lleva ninguno.
//
// 🔴 LO QUE LLEVA LA ETIQUETA, y nada más:
//     EMPRESA (grande, negrita, con línea debajo) · fecha (chica, a la derecha)
//     Factura · Cliente (grande) · Destino · «CAJA X de N» (muy grande, abajo).
//   SIN transportista, SIN piezas, SIN código de barras y SIN la dirección del
//   directorio — el candado `clientes-direccion-no-alimenta-guias` sigue
//   valiendo, y además 29 de 145 clientes no tienen dirección en ninguna parte.
//
// 🔴 UN SOLO GENERADOR. Reimprimir una caja sola es el MISMO dibujo con una
// lista de un elemento: una hoja, la etiqueta en la posición 1 (arriba
// izquierda) y el resto en blanco. Dos dibujos del mismo papel es uno que se
// corrige y otro que se queda viejo.
//
// Las proporciones salen del mockup aprobado, medidas sobre el ANCHO DE LA
// HOJA (215,9 mm): empresa 3,1 % · fecha 1,5 % · factura 1,85 % · cliente
// 3,3 % · destino 2,2 % · caja 5,4 %.
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from "jspdf";
import {
  fechaDeLaEtiqueta,
  hojasDeEtiquetas,
  textoCaja,
  type EtiquetaFila,
} from "@/lib/guias/etiquetas";

// Hoja carta en milímetros.
const HOJA_W = 215.9;
const HOJA_H = 279.4;
/** Los cuartos: dos columnas por dos filas. */
const CUARTO_W = HOJA_W / 2;
const CUARTO_H = HOJA_H / 2;

const PAD_X = 8.6;
const PAD_Y = 9.1;

/** mm → puntos, que es la unidad de `setFontSize` de jsPDF. */
const PT = (mm: number): number => mm / 0.3527777778;

// Los seis tamaños, derivados del ancho de la hoja (las proporciones del mockup).
const F_EMPRESA = PT(0.031 * HOJA_W);
const F_FECHA = PT(0.015 * HOJA_W);
const F_FACTURA = PT(0.0185 * HOJA_W);
const F_CLIENTE = PT(0.033 * HOJA_W);
const F_DESTINO = PT(0.022 * HOJA_W);
const F_CAJA = PT(0.054 * HOJA_W);

/** Lo que una etiqueta necesita saber para dibujarse. */
export interface DatosEtiqueta {
  empresa: string;
  fecha_factura: string;
  secuencial: string;
  cliente_nombre: string;
  destino: string;
  cajas: number;
}

export function datosDeEtiqueta(e: EtiquetaFila): DatosEtiqueta {
  return {
    empresa: e.empresa,
    fecha_factura: e.fecha_factura,
    secuencial: e.secuencial,
    cliente_nombre: e.cliente_nombre,
    destino: e.destino,
    cajas: e.cajas,
  };
}

function nuevoDocumento(): jsPDF {
  return new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });
}

/**
 * Las líneas de corte de UNA hoja: una horizontal por el medio y una vertical
 * por el medio, punteadas. ⚠️ Se dibujan SIEMPRE, aunque la hoja tenga cuartos
 * en blanco: el papel se parte siempre igual.
 */
function lineasDeCorte(doc: jsPDF): void {
  doc.setDrawColor(150);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1.6, 1.6], 0);
  doc.line(0, CUARTO_H, HOJA_W, CUARTO_H);
  doc.line(CUARTO_W, 0, CUARTO_W, HOJA_H);
  doc.setLineDashPattern([], 0);
}

/** Dibuja UNA etiqueta dentro del cuarto que arranca en (x0, y0). */
function dibujarEtiqueta(doc: jsPDF, d: DatosEtiqueta, caja: number, x0: number, y0: number): void {
  const izq = x0 + PAD_X;
  const der = x0 + CUARTO_W - PAD_X;
  const ancho = der - izq;

  doc.setTextColor(17);

  // ── EMPRESA, grande y en mayúsculas, con la fecha chica a la derecha ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(F_EMPRESA);
  const empresa = String(d.empresa ?? "").toUpperCase();
  let y = y0 + PAD_Y + 6.7;
  doc.text(empresa, izq, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(F_FECHA);
  doc.setTextColor(68);
  doc.text(fechaDeLaEtiqueta(d.fecha_factura), der, y, { align: "right" });
  doc.setTextColor(17);

  // La línea debajo del encabezado.
  y += 2.4;
  doc.setDrawColor(17);
  doc.setLineWidth(0.9);
  doc.line(izq, y, der, y);

  // ── Factura ──
  y += 8.6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(F_FACTURA);
  doc.setTextColor(51);
  doc.text(`Factura ${d.secuencial}`, izq, y);
  doc.setTextColor(17);

  // ── Cliente, grande. Se parte en varias líneas si el nombre es largo. ──
  y += 7.6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(F_CLIENTE);
  const lineas = doc.splitTextToSize(String(d.cliente_nombre ?? ""), ancho) as string[];
  // Dos líneas como mucho: un nombre larguísimo no puede empujar el destino
  // fuera del cuarto. La tercera se corta con puntos suspensivos.
  const visibles = lineas.slice(0, 2);
  if (lineas.length > 2) visibles[1] = `${visibles[1]}…`;
  for (const l of visibles) {
    doc.text(l, izq, y);
    y += 8.2;
  }

  // ── Destino ──
  y += 2.4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(F_DESTINO);
  doc.text(`Destino: ${d.destino}`, izq, y);

  // ── «CAJA X de N», lo más grande, pegado abajo ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(F_CAJA);
  doc.text(textoCaja(caja, d.cajas), izq, y0 + CUARTO_H - PAD_Y);
}

/**
 * El PDF de las etiquetas que se le pidan. `cajas` son los NÚMEROS de caja a
 * imprimir: el juego completo es `[1..N]`, y reimprimir una sola es `[7]`.
 *
 * ⚠️ Sin cajas devuelve el documento vacío y quien llama decide qué hacer:
 * inventar una hoja en blanco sería peor.
 */
export function construirPdfEtiquetas(d: DatosEtiqueta, cajas: readonly number[]): jsPDF {
  const doc = nuevoDocumento();
  const hojas = hojasDeEtiquetas(cajas);
  hojas.forEach((hoja, i) => {
    // La primera va en la página que el documento ya trae: una `addPage()` de
    // más deja una hoja en blanco al principio de todo lo que se imprima.
    if (i > 0) doc.addPage();
    lineasDeCorte(doc);
    hoja.forEach((caja, pos) => {
      if (caja == null) return; // cuarto en blanco, a propósito
      const x0 = (pos % 2) * CUARTO_W;
      const y0 = Math.floor(pos / 2) * CUARTO_H;
      dibujarEtiqueta(doc, d, caja, x0, y0);
    });
  });
  return doc;
}
