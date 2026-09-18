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
//     Factura · Cliente (grande) · Destino (igual de grande) · «CAJA» con su
//     número enorme abajo, separado por una raya.
//   SIN transportista, SIN piezas, SIN código de barras y SIN la dirección del
//   directorio — el candado `clientes-direccion-no-alimenta-guias` sigue
//   valiendo, y además 29 de 145 clientes no tienen dirección en ninguna parte.
//
// 🔴 EL REDISEÑO DEL 18-sep-2026 — el mockup lo hizo Daniel y es mejor que lo
// que había. Cuatro cosas, y NINGUNA mueve un número:
//   1. EL RÓTULO VA ARRIBA DEL DATO, chico y gris. Antes era «Factura 11-…» y
//      «Destino: Paso Canoas» pegados en una línea: el ojo tenía que leer la
//      palabra para llegar al dato. Ahora se salta el gris y se lee el dato.
//   2. EL DESTINO ES DEL MISMO TAMAÑO QUE EL CLIENTE. Quien recibe lee el
//      cliente; quien carga el camión ordena por destino. Los dos de lejos.
//   3. «CAJA» Y SU NÚMERO, SEPARADOS POR UNA RAYA, centrados y abajo del todo:
//      el rótulo chico y espaciado, y debajo «3 de 14» enorme. Antes era una
//      sola línea «CAJA 1 de 4» flotando sin separador.
//   4. LA FECHA EN EL FORMATO DE LA CASA («18 sept 2026»), que sale de `fmtDate`
//      — el MISMO que usa todo el papel del sistema. Antes era «18-09-2026».
//   Y el cliente y el destino se escriben en MAYÚSCULAS, como la empresa: la
//   etiqueta se lee parada, a un metro, encima de una caja.
//
// 🔴 UN SOLO GENERADOR. Reimprimir una caja sola es el MISMO dibujo con una
// lista de un elemento: una hoja, la etiqueta en la posición 1 (arriba
// izquierda) y el resto en blanco. Dos dibujos del mismo papel es uno que se
// corrige y otro que se queda viejo.
//
// Las proporciones salen del mockup aprobado, medidas sobre el ANCHO DE LA
// HOJA (215,9 mm): empresa 3,1 % · fecha 1,5 % · rótulo 1,4 % · factura 2,2 %
// · cliente 3,1 % · destino 3,1 % · «CAJA» 1,6 % · el número 5,6 %.
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from "jspdf";
import {
  ROTULO_CAJA,
  fechaDeLaEtiqueta,
  hojasDeEtiquetas,
  numeroDeCaja,
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

// Los tamaños, derivados del ancho de la hoja (las proporciones del mockup).
const F_EMPRESA = PT(0.031 * HOJA_W);
const F_FECHA = PT(0.015 * HOJA_W);
/** El rótulo gris que va ARRIBA del dato: «Factura», «Cliente», «Destino». */
const F_ROTULO = PT(0.014 * HOJA_W);
const F_FACTURA = PT(0.022 * HOJA_W);
const F_CLIENTE = PT(0.031 * HOJA_W);
/**
 * 🔴 EL DESTINO, DEL MISMO TAMAÑO QUE EL CLIENTE. No es una constante repetida:
 * es la MISMA, para que nadie achique uno sin achicar el otro.
 */
const F_DESTINO = F_CLIENTE;
/** «CAJA», chico y espaciado, encima del número. */
const F_CAJA_ROTULO = PT(0.016 * HOJA_W);
/** «3 de 14», lo más grande del papel. */
const F_CAJA = PT(0.056 * HOJA_W);

// ── Los saltos verticales, en milímetros ─────────────────────────────────────
/** De la raya del encabezado al primer rótulo. */
const ARRIBA_DE_LOS_CAMPOS = 8.0;
/** Del rótulo gris al dato, cuando el dato es chico (la factura). */
const ROTULO_A_DATO_CHICO = 5.4;
/** Del rótulo gris al dato, cuando el dato es grande (cliente y destino). */
const ROTULO_A_DATO_GRANDE = 7.0;
/** Del último renglón de un bloque al rótulo del siguiente. */
const ENTRE_BLOQUES = 11.0;
/** La segunda línea de un nombre largo. */
const SALTO_DE_LINEA = 8.2;
/** Desde el borde de abajo: la raya, «CAJA» y el número. */
const CAJA_ROTULO_SOBRE_NUMERO = 12.6;
const CAJA_RAYA_SOBRE_ROTULO = 4.6;
/** Lo espaciado del rótulo «CAJA» (el `letter-spacing` del mockup). */
const CAJA_ESPACIADO = 0.5;

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

/**
 * Un bloque de campo: el RÓTULO gris y chico arriba, el dato abajo. Devuelve la
 * `y` donde quedó la última línea escrita.
 *
 * 🔴 ÉSTA ES LA REGLA DEL REDISEÑO, y vive en UNA sola función: los tres campos
 * de la etiqueta se dibujan con ella, así que nadie puede volver a pegar un
 * rótulo al lado del dato en uno solo de los tres.
 */
function bloqueDeCampo(
  doc: jsPDF,
  rotulo: string,
  valor: string,
  opciones: { izq: number; ancho: number; y: number; tamano: number; salto: number; maxLineas: number },
): number {
  const { izq, ancho, tamano, salto, maxLineas } = opciones;
  let y = opciones.y;

  // El rótulo: chico, gris, ARRIBA del dato.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(F_ROTULO);
  doc.setTextColor(102);
  doc.text(rotulo, izq, y);

  // El dato: negrita, grande, debajo.
  doc.setTextColor(17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(tamano);
  y += salto;
  const lineas = doc.splitTextToSize(valor, ancho) as string[];
  // Un texto larguísimo no puede empujar lo de abajo fuera del cuarto: se corta
  // con puntos suspensivos en vez de desbordarse.
  const visibles = lineas.slice(0, maxLineas);
  if (lineas.length > maxLineas) visibles[maxLineas - 1] = `${visibles[maxLineas - 1]}…`;
  visibles.forEach((l, i) => {
    if (i > 0) y += SALTO_DE_LINEA;
    doc.text(l, izq, y);
  });
  return y;
}

/** Dibuja UNA etiqueta dentro del cuarto que arranca en (x0, y0). */
function dibujarEtiqueta(doc: jsPDF, d: DatosEtiqueta, caja: number, x0: number, y0: number): void {
  const izq = x0 + PAD_X;
  const der = x0 + CUARTO_W - PAD_X;
  const ancho = der - izq;
  const centro = x0 + CUARTO_W / 2;

  doc.setTextColor(17);

  // ── EMPRESA, grande y en mayúsculas, con la fecha chica a la derecha ──
  // (Esto NO cambió con el rediseño, salvo el formato de la fecha.)
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

  // ── Los tres campos: rótulo gris arriba, dato grande abajo ──
  const campo = { izq, ancho };
  y = bloqueDeCampo(doc, "Factura", String(d.secuencial ?? ""), {
    ...campo,
    y: y + ARRIBA_DE_LOS_CAMPOS,
    tamano: F_FACTURA,
    salto: ROTULO_A_DATO_CHICO,
    maxLineas: 1,
  });
  y = bloqueDeCampo(doc, "Cliente", String(d.cliente_nombre ?? "").toUpperCase(), {
    ...campo,
    y: y + ENTRE_BLOQUES,
    tamano: F_CLIENTE,
    salto: ROTULO_A_DATO_GRANDE,
    maxLineas: 2,
  });
  bloqueDeCampo(doc, "Destino", String(d.destino ?? "").toUpperCase(), {
    ...campo,
    y: y + ENTRE_BLOQUES,
    tamano: F_DESTINO,
    salto: ROTULO_A_DATO_GRANDE,
    maxLineas: 2,
  });

  // ── «CAJA» y su número, abajo del todo, centrados y con su raya ──
  // 🔴 Se dibuja DESDE EL BORDE DE ABAJO, no desde donde terminó el destino: el
  // número queda siempre en el mismo sitio, lleve el cliente una línea o dos.
  const yNumero = y0 + CUARTO_H - PAD_Y;
  const yRotulo = yNumero - CAJA_ROTULO_SOBRE_NUMERO;
  const yRaya = yRotulo - CAJA_RAYA_SOBRE_ROTULO;

  doc.setDrawColor(17);
  doc.setLineWidth(0.9);
  doc.line(izq, yRaya, der, yRaya);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(F_CAJA_ROTULO);
  doc.setTextColor(51);
  doc.setCharSpace(CAJA_ESPACIADO);
  // ⚠️ jsPDF mide el ancho contando el espaciado del ÚLTIMO carácter, que no se
  // dibuja: sin descontarle medio espacio, «CAJA» queda 1 mm a la derecha del
  // centro y se nota al lado del número, que sí cae centrado.
  doc.text(ROTULO_CAJA, centro - CAJA_ESPACIADO / 2, yRotulo, { align: "center" });
  doc.setCharSpace(0);

  doc.setTextColor(17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(F_CAJA);
  doc.text(numeroDeCaja(caja, d.cajas), centro, yNumero, { align: "center" });
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
