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
//     Factura · Cliente (grande) · Destino (más grande todavía) · «BULTO» con
//     su número enorme abajo, separado por una raya.
//   SIN transportista, SIN piezas, SIN código de barras y SIN la dirección del
//   directorio — el candado `clientes-direccion-no-alimenta-guias` sigue
//   valiendo, y además 29 de 145 clientes no tienen dirección en ninguna parte.
//
// 🔴 EL REDISEÑO DEL 18-sep-2026 — el mockup lo hizo Daniel y es mejor que lo
// que había. Cuatro cosas, y NINGUNA mueve un número:
//   1. EL RÓTULO VA ARRIBA DEL DATO, chico y gris. Antes era «Factura 11-…» y
//      «Destino: Paso Canoas» pegados en una línea: el ojo tenía que leer la
//      palabra para llegar al dato. Ahora se salta el gris y se lee el dato.
//   2. EL DESTINO SE LEE DE LEJOS. Quien recibe lee el cliente; quien carga el
//      camión ordena por destino. (El 18-sep-2026 quedaron del mismo tamaño; el
//      20-sep-2026 el destino pasó a ser el más grande de los dos.)
//   3. EL RÓTULO Y SU NÚMERO, SEPARADOS POR UNA RAYA, centrados y abajo del
//      todo: el rótulo chico y espaciado, y debajo «3 de 14» enorme. Antes era
//      una sola línea «CAJA 1 de 4» flotando sin separador. (El rótulo pasó a
//      decir «BULTO» el 20-sep-2026.)
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
// 🔴 EL AGRANDE DEL 20-sep-2026 — la etiqueta se lee PARADO, A UN METRO, ENCIMA
// DE UNA CAJA, y cada dato se lee desde una distancia distinta. 🩸 Medido sobre
// el PDF real: entre el destino y la raya del bulto quedaban 130 pt (46 mm) de
// papel en blanco —un 33 % del alto del tiquete— y por ese hueco el cliente y
// el destino se imprimían a 4,8 mm de altura de mayúscula, justo en el límite.
//
// 🔴 LOS TAMAÑOS SE PIDEN EN MILÍMETROS DE ALTURA DE MAYÚSCULA, NO EN PUNTOS.
// La regla con la que se eligieron: cada milímetro de altura de mayúscula se
// lee cómodo desde unos 30 cm, así que cada dato crece hasta la distancia desde
// la que se lee de verdad:
//     el número del bulto 11 mm (se cuenta de lejos y de cerca) · el destino
//     7,5 mm y en NEGRITA (se ordena el camión de lejos) · el cliente 5,5 mm
//     (se entrega de cerca) · la factura 4 mm (se compara contra un papel) ·
//     la empresa y la fecha, como estaban.
// Los milímetros son lo aprobado; los puntos SE CALCULAN de ellos. Escribir el
// punto a mano es lo que permite que un cambio de fuente cambie el tamaño real
// sin que nadie se entere.
//
// El hueco se repartió entre los campos: no se movió nada de sitio, el rótulo
// chico y gris sigue arriba de su dato, el orden sigue siendo empresa ·
// factura · cliente · destino · bulto, y siguen siendo 4 por hoja.
//
// 🔴 EL DESTINO LARGO YA NO SE CORTA (22-sep-2026) — Daniel: *«los destino
// largos que se hagan en dos filas o achicar la letra»*. PRIMERO LAS FILAS,
// DESPUÉS LA LETRA, en ese orden: el criterio entero vive en el módulo puro
// `etiqueta-destino.ts` y acá solo se le presta la regla de medir. Los otros
// tres tamaños —bulto 11 · cliente 5,5 · factura 4— NO se tocaron.
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from "jspdf";
import {
  ROTULO_BULTO,
  fechaDeLaEtiqueta,
  hojasDeEtiquetas,
  partesDelNumeroDeBulto,
  type EtiquetaFila,
} from "@/lib/guias/etiquetas";
import { MAY_DESTINO_MINIMO, acomodarDestino } from "@/lib/guias/etiqueta-destino";

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

/**
 * 🔴 CUÁNTO DEL TAMAÑO DE LETRA ES LA MAYÚSCULA. Helvetica —la fuente estándar
 * del PDF, la que usa todo el papel de la casa— tiene `CapHeight 718` sobre un
 * em de 1000 en su propio AFM: una «A» de una letra de 10 pt mide 7,18 pt de
 * alto. Es lo que se MIDE con una regla encima de la caja, y por eso es la
 * unidad en la que se pidieron los tamaños.
 */
const ALTURA_DE_MAYUSCULA = 0.718;

/** El tamaño de letra (pt) cuyas MAYÚSCULAS miden `mm` milímetros. */
const PT_PARA_MAYUSCULA = (mm: number): number => PT(mm) / ALTURA_DE_MAYUSCULA;

// ── Los tamaños, en MILÍMETROS DE ALTURA DE MAYÚSCULA ────────────────────────
// Los cuatro primeros no se tocaron el 20-sep-2026: son los milímetros exactos
// que ya salían de las proporciones del mockup (18,97 pt la empresa, 9,18 pt la
// fecha, 8,57 pt el rótulo gris y 9,79 pt el rótulo del bulto).
const MAY_EMPRESA = 4.8055;
const MAY_FECHA = 2.3252;
/** El rótulo gris que va ARRIBA del dato: «Factura», «Cliente», «Destino». */
const MAY_ROTULO = 2.1702;
/** «BULTO», chico y espaciado, encima del número. */
const MAY_BULTO_ROTULO = 2.4802;
/** Se compara contra un papel, de cerca: 4 mm. */
const MAY_FACTURA = 4.0;
/** Se lee al entregar, de cerca: 5,5 mm. */
const MAY_CLIENTE = 5.5;
/** 🔴 Se lee ordenando el camión, de lejos: 7,5 mm y en negrita. */
const MAY_DESTINO = 7.5;
/** 🔴 Se cuenta de lejos y de cerca: 11 mm, lo más grande del papel. */
const MAY_BULTO = 11.0;

const F_EMPRESA = PT_PARA_MAYUSCULA(MAY_EMPRESA);
const F_FECHA = PT_PARA_MAYUSCULA(MAY_FECHA);
const F_ROTULO = PT_PARA_MAYUSCULA(MAY_ROTULO);
const F_FACTURA = PT_PARA_MAYUSCULA(MAY_FACTURA);
const F_CLIENTE = PT_PARA_MAYUSCULA(MAY_CLIENTE);
const F_DESTINO = PT_PARA_MAYUSCULA(MAY_DESTINO);
const F_BULTO_ROTULO = PT_PARA_MAYUSCULA(MAY_BULTO_ROTULO);
const F_BULTO = PT_PARA_MAYUSCULA(MAY_BULTO);
/**
 * 🔴 «de 4» VA A LA MITAD DEL TAMAÑO DEL «1», en la misma línea. Lo que se
 * cuenta es el número de este bulto; el total acompaña. Y sigue diciendo
 * «1 de 4» y NUNCA «1/4»: con la etiqueta sucia o despegada de una esquina la
 * rayita se pierde y «1/4» queda leyéndose «14».
 */
const F_BULTO_TOTAL = F_BULTO / 2;

// ── Los saltos verticales, en milímetros ─────────────────────────────────────
/** De la raya del encabezado al primer rótulo. */
const ARRIBA_DE_LOS_CAMPOS = 10.0;
/**
 * Del rótulo gris al dato: la altura de la mayúscula del dato MÁS su aire, así
 * que agrandar un campo no le pisa el rótulo a nadie.
 */
const AIRE_BAJO_EL_ROTULO = 2.1;
const bajoElRotulo = (mayusculaMm: number): number => mayusculaMm + AIRE_BAJO_EL_ROTULO;
/**
 * La segunda línea de un nombre largo: la interlínea propia del tamaño del
 * campo (un destino de 7,5 mm no puede saltar lo mismo que una factura).
 */
const INTERLINEA = 1.10;
const interlinea = (tamanoPt: number): number => tamanoPt * 0.3527777778 * INTERLINEA;
/** Del último renglón de un bloque al rótulo del siguiente. */
const ENTRE_BLOQUES = 12.5;
/**
 * 🔴 EL AIRE QUE EL DESTINO NO PUEDE COMERSE: lo que queda entre su última
 * línea y la raya del bulto. Cubre el descolgado de la Helvetica (0,207 del em,
 * que en un destino de 7,5 mm son 2,2 mm — las comas y los paréntesis bajan de
 * la base) y deja el resto de respiro.
 *
 * 🔑 Los cinco números de arriba están CALZADOS: con el cliente en DOS líneas
 * —55 de los 148 clientes reales lo están a 5,5 mm— el destino todavía entra en
 * TRES, que es lo que hace falta para que «TIENDA 6 WESTLAND MALL» o
 * «ALBROOK, PASILLO DE DINOSAURIO» salgan enteros. Aflojar uno solo se los come.
 */
const AIRE_SOBRE_LA_RAYA = 3.0;
/** Desde el borde de abajo: la raya, «BULTO» y el número. */
const BULTO_ROTULO_SOBRE_NUMERO = 14.0;
const BULTO_RAYA_SOBRE_ROTULO = 4.6;
/** Lo espaciado del rótulo «BULTO» (el `letter-spacing` del mockup). */
const BULTO_ESPACIADO = 0.5;
/** El aire entre el número grande y su «de N» chico. */
const BULTO_ANTES_DEL_TOTAL = 2.6;

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
  opciones: {
    izq: number;
    ancho: number;
    y: number;
    mayuscula: number;
    /** Las líneas que SIEMPRE tiene, salga lo que salga. */
    maxLineas: number;
    /**
     * 🔴 HASTA DÓNDE PUEDE BAJAR ESTE CAMPO. Con este piso, el bloque se queda
     * con las líneas que de verdad caben antes de él —ni una más— en vez de
     * cortar con puntos suspensivos teniendo papel en blanco debajo. Es lo que
     * le deja al DESTINO quedarse con el hueco cuando el cliente entra en una
     * sola línea: «TIENDA 6 WESTLAND MALL» sale entero, y con el cliente largo
     * el mismo cálculo le devuelve las dos líneas de siempre.
     */
    hastaY?: number;
    /**
     * 🔴 EL ACHIQUE, Y EN QUÉ ORDEN (22-sep-2026). Daniel: *«los destino largos
     * que se hagan en dos filas o achicar la letra»*. Con este piso el campo
     * PRIMERO se parte en cuantas filas quepan a su tamaño de siempre, y SOLO
     * si ni así entra se le baja la letra —de a un décimo de milímetro— hasta
     * este mínimo. Sin él, el campo se comporta como siempre: se corta con «…».
     * Hoy lo usa solo el DESTINO; los otros tres tamaños no se tocan.
     */
    achicarHasta?: number;
  },
): number {
  const { izq, ancho, mayuscula } = opciones;
  let y = opciones.y;

  // El rótulo: chico, gris, ARRIBA del dato.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(F_ROTULO);
  doc.setTextColor(102);
  doc.text(rotulo, izq, y);

  doc.setTextColor(17);
  doc.setFont("helvetica", "bold");

  if (opciones.achicarHasta != null && opciones.hastaY != null) {
    // 🔴 FILAS ANTES QUE LETRA CHICA. Todo el criterio vive en un módulo puro,
    // `etiqueta-destino.ts`, que no sabe nada de jsPDF: acá solo se le prestan
    // la regla de medir y la de saltar de línea.
    const anchoDeTexto = (texto: string, mm: number): number => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(PT_PARA_MAYUSCULA(mm));
      return doc.getTextWidth(texto);
    };
    const acomodo = acomodarDestino(
      valor,
      mayuscula,
      {
        ancho,
        desdeY: y,
        hastaY: opciones.hastaY,
        bajoElRotulo,
        interlinea: (mm) => interlinea(PT_PARA_MAYUSCULA(mm)),
        anchoDeTexto,
      },
      opciones.achicarHasta,
    );
    const tamanoAcomodado = PT_PARA_MAYUSCULA(acomodo.mayuscula);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(tamanoAcomodado);
    y += bajoElRotulo(acomodo.mayuscula);
    acomodo.lineas.forEach((l, i) => {
      if (i > 0) y += interlinea(tamanoAcomodado);
      doc.text(l, izq, y);
    });
    return y;
  }

  // El dato: negrita, grande, debajo.
  const tamano = PT_PARA_MAYUSCULA(mayuscula);
  doc.setFontSize(tamano);
  y += bajoElRotulo(mayuscula);
  const lineas = doc.splitTextToSize(valor, ancho) as string[];
  // Un texto larguísimo no puede empujar lo de abajo fuera del cuarto: se corta
  // con puntos suspensivos en vez de desbordarse.
  const cabenPorElPiso =
    opciones.hastaY == null ? 0 : 1 + Math.floor((opciones.hastaY - y) / interlinea(tamano));
  const maxLineas = Math.max(opciones.maxLineas, cabenPorElPiso);
  const visibles = lineas.slice(0, maxLineas);
  if (lineas.length > maxLineas) {
    // 🩸 Los puntos suspensivos NO son gratis: pegarlos al final de una línea que
    // ya llegaba al borde la empuja fuera del cuarto —en la Helvetica el «…»
    // mide un em entero, que en un destino de 7,5 mm son 10 mm de papel ajeno—.
    // Se le quitan letras a la última línea hasta que el corte QUEPA.
    let ultima = visibles[maxLineas - 1];
    while (ultima.length > 1 && doc.getTextWidth(`${ultima}…`) > ancho) ultima = ultima.slice(0, -1);
    visibles[maxLineas - 1] = `${ultima.trimEnd()}…`;
  }
  visibles.forEach((l, i) => {
    if (i > 0) y += interlinea(tamano);
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

  // 🔴 El bloque del bulto se ancla al BORDE DE ABAJO, así que su raya se sabe
  // ANTES de escribir un solo campo: es el piso hasta el que pueden bajar.
  const yNumero = y0 + CUARTO_H - PAD_Y;
  const yRotulo = yNumero - BULTO_ROTULO_SOBRE_NUMERO;
  const yRaya = yRotulo - BULTO_RAYA_SOBRE_ROTULO;

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
    mayuscula: MAY_FACTURA,
    maxLineas: 1,
  });
  y = bloqueDeCampo(doc, "Cliente", String(d.cliente_nombre ?? "").toUpperCase(), {
    ...campo,
    y: y + ENTRE_BLOQUES,
    mayuscula: MAY_CLIENTE,
    maxLineas: 2,
  });
  bloqueDeCampo(doc, "Destino", String(d.destino ?? "").toUpperCase(), {
    ...campo,
    y: y + ENTRE_BLOQUES,
    mayuscula: MAY_DESTINO,
    maxLineas: 2,
    hastaY: yRaya - AIRE_SOBRE_LA_RAYA,
    achicarHasta: MAY_DESTINO_MINIMO,
  });

  // ── «BULTO» y su número, abajo del todo, centrados y con su raya ──
  // 🔴 Se dibuja DESDE EL BORDE DE ABAJO, no desde donde terminó el destino: el
  // número queda siempre en el mismo sitio, lleve el cliente una línea o dos.
  doc.setDrawColor(17);
  doc.setLineWidth(0.9);
  doc.line(izq, yRaya, der, yRaya);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(F_BULTO_ROTULO);
  doc.setTextColor(51);
  doc.setCharSpace(BULTO_ESPACIADO);
  // ⚠️ jsPDF mide el ancho contando el espaciado del ÚLTIMO carácter, que no se
  // dibuja: sin descontarle medio espacio, «BULTO» queda 1 mm a la derecha del
  // centro y se nota al lado del número, que sí cae centrado.
  doc.text(ROTULO_BULTO, centro - BULTO_ESPACIADO / 2, yRotulo, { align: "center" });
  doc.setCharSpace(0);

  // 🔴 EL NÚMERO GRANDE Y SU «de N» A LA MITAD, EN LA MISMA LÍNEA. Son dos
  // `doc.text` porque son dos tamaños, pero comparten la base y se centran como
  // UN bloque: se mide el ancho de las dos piezas y se arranca a la izquierda
  // del centro, en vez de centrar cada una por su cuenta.
  const { numero, total } = partesDelNumeroDeBulto(caja, d.cajas);
  doc.setTextColor(17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(F_BULTO);
  const anchoNumero = doc.getTextWidth(numero);
  doc.setFontSize(F_BULTO_TOTAL);
  const anchoTotal = doc.getTextWidth(total);
  const xNumero = centro - (anchoNumero + BULTO_ANTES_DEL_TOTAL + anchoTotal) / 2;
  doc.setFontSize(F_BULTO);
  doc.text(numero, xNumero, yNumero);
  doc.setFontSize(F_BULTO_TOTAL);
  doc.text(total, xNumero + anchoNumero + BULTO_ANTES_DEL_TOTAL, yNumero);
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
