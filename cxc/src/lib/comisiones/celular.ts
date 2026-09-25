// ─────────────────────────────────────────────────────────────────────────────
// 🔴 COMISIONES EN EL CELULAR (25-sep-2026). Daniel aprobó el mockup letra por
// letra: 1b · 2d · 3h · 4j · 5t/5u · 6o · 7p · 8 · 9r.
//
// 🩸 QUÉ REEMPLAZA, medido el 25-sep-2026 contra producción a 390 px:
//   · **La portada gastaba 265 px (31 % del teléfono) en 7 controles repartidos
//     en 4 renglones** antes del primer vendedor, y los dos botones de descarga
//     se llevaban **100 px en dos renglones sueltos, en zig-zag** —PDF pegado a
//     la derecha, Excel a la izquierda—. Lo que Daniel mira vive entre y=265 y
//     y=527: **262 px**, y debajo quedaban **393 px de blanco**.
//   · **El detalle de una comisión no enseñaba ni un monto**: la tabla mide
//     557–568 px en un cajón de 324, así que «% UTIL.» y «COMISIÓN» se veían
//     **0 px de 69 y de 93**, y «SUBTOTAL» 31 de 104. Es lo único que el modal
//     existe para enseñar.
//   · **El ☰ se comía el total**: con una fila abierta la barra negra quedaba
//     en y≈760 y el botón empezaba en y=772 — se leía **«TOTAL A PAGAR
//     $5,97…»**. Y en Configuración se sentaba ENTERO sobre la columna COBRO
//     (x 318–374 dentro de x 298–386): tapaba justo la casilla que decide si un
//     cliente comisiona al cobrar (sus fotos IMG_3190 e IMG_3191).
//   · **Configuración medía 3.106 px con OCHO tablas, y las ocho se salían**
//     (89 px · 76–97 px · **265 px**, el 45 % de la de Descuentos, con QUITAR
//     entera afuera). La fila de Reynaldo medía **165 px contra 57** de las
//     otras dos: 108 px de hueco por una columna que estaba fuera de pantalla.
//   · **«Multi Fashion Holding D-108 · Todos los vendedores» salía 6 veces**,
//     una por empresa: 6 de las 18 filas para UNA sola regla, con su encabezado
//     de cinco columnas repetido seis veces.
//   · **Multifashion nunca decía su total** ($255,27 en agosto): Fashion Group
//     cerraba con «TOTAL A PAGAR $5.978,55» y la séptima no cerraba con nada.
//
// 🔴 NINGÚN NÚMERO CAMBIA. Las RPC son las mismas (`comision_b2b_v9`,
// `multifashion_vendedoras_v5`), los alias, los retirados y `VENDEDORES_SIN_PAGO`
// siguen decidiendo lo mismo, y el total a pagar de **agosto 2026 es
// $5.978,55** antes y después. Este archivo no suma nada: da la FORMA.
//
// 🔴 MULTIFASHION NUNCA SE SUMA CON EL GRUPO. Su total va en su **propia**
// barra, rotulada «TOTAL A PAGAR · Multifashion», y hay barrido que lo prueba.
//
// ⚠️ SOLO CAMBIA HASTA `sm`, salvo las dos cosas que Daniel pidió también para
// la computadora: la tabla de tres columnas de Tasas (4j) y la lista en
// palabras de «Clientes que no comisionan» (5u).
//
// ⚠️ Es un interruptor de CÓDIGO, no de variable de entorno.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 Hoy PRENDIDO. `false` = el módulo de antes, intacto. */
export const COMISIONES_CELULAR = true;

/** Hasta qué ancho manda esta pantalla: el mismo corte `sm` de Tailwind. */
export const HASTA_SM_COMISIONES = "(max-width: 639px)";

/**
 * ¿Quien mira está en un celular?
 *
 * 🔑 SE MONTA UN SOLO ÁRBOL, NO DOS ESCONDIDOS CON CSS: con las dos vistas
 * dibujadas a la vez cada nombre de vendedor saldría DOS veces en el documento
 * y el candado `iphone-comisiones-encabezado` empezaría a ver el doble. Es el
 * mismo patrón de Marketing y de Asistencia.
 *
 * ⚠️ En el servidor no hay `matchMedia`: ante la duda, COMPUTADORA.
 */
export function esPantallaDeCelularComisiones(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const mq = window.matchMedia?.(HASTA_SM_COMISIONES);
    if (mq) return mq.matches;
  } catch {
    /* un navegador sin matchMedia se porta como computadora */
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1b · El total del mes arriba, chico; debajo la fila de vendedores
// ─────────────────────────────────────────────────────────────────────────────

/** El rótulo del total del grupo. Se dice UNA vez, arriba. */
export const ROTULO_TOTAL_A_PAGAR = "a pagar";

/**
 * 🔴 EL TOTAL DE MULTIFASHION TIENE SU PROPIA BARRA Y SU PROPIO RÓTULO.
 *
 * Daniel, 25-sep-2026: su total va **«separada y sin mezclarse nunca con la del
 * grupo»**. El rótulo lleva el nombre adentro para que no exista una pantalla
 * donde dos barras negras digan lo mismo y parezcan sumables.
 */
export const ROTULO_TOTAL_MULTIFASHION = "TOTAL A PAGAR · Multifashion";

/** El rótulo de la barra del grupo, cuando va abajo (una empresa). */
export const ROTULO_TOTAL_GRUPO = "TOTAL A PAGAR";

// ─────────────────────────────────────────────────────────────────────────────
// El mes con flechas: «‹ Ago 2026 ›»
// ─────────────────────────────────────────────────────────────────────────────

const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
] as const;

/** «Ago 2026» a partir de `2026-08`. Un valor raro vuelve tal cual. */
export function mesEnPalabras(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec((mes ?? "").trim());
  if (!m) return mes ?? "";
  const i = Number(m[2]) - 1;
  if (i < 0 || i > 11) return mes;
  return `${MESES_CORTOS[i]} ${m[1]}`;
}

/**
 * El mes anterior y el siguiente, para las flechas.
 *
 * 🔴 NUNCA AL FUTURO: si el mes elegido ya es el de Panamá, la flecha de la
 * derecha viene en `null` y no se dibuja. Es la misma regla que el celular de
 * Multifashion, y por el mismo motivo: un mes que todavía no empezó no tiene
 * comisión que pagar.
 */
export function mesesAlrededor(
  mes: string,
  mesTope: string,
): { anterior: string | null; siguiente: string | null } {
  const m = /^(\d{4})-(\d{2})$/.exec((mes ?? "").trim());
  if (!m) return { anterior: null, siguiente: null };
  const anio = Number(m[1]);
  const num = Number(m[2]);
  const anterior = num === 1 ? `${anio - 1}-12` : `${anio}-${String(num - 1).padStart(2, "0")}`;
  const siguiente = num === 12 ? `${anio + 1}-01` : `${anio}-${String(num + 1).padStart(2, "0")}`;
  return { anterior, siguiente: siguiente > mesTope ? null : siguiente };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3h · El detalle: las seis columnas deslizando, con Subtotal y Comisión a la vista
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 EL ORDEN DE LAS COLUMNAS DEL DETALLE, EN UN SOLO LUGAR.
 *
 * Daniel eligió la **3h** —las seis columnas, deslizando de lado— y en la misma
 * frase pidió que **Subtotal y Comisión se vean**. Las dos cosas a la vez solo
 * salen de una manera: la plata va PRIMERO y lo que describe la factura
 * —fecha, cliente, número, % de utilidad— queda a la derecha, que es lo que se
 * desliza a buscar. Medido: hoy COMISIÓN se ve **0 px de 93**.
 *
 * ⚠️ NO se quita ninguna columna y no se recalcula ni un número: es el MISMO
 * renglón de `comision_b2b_v9`, en otro orden.
 */
export const COLUMNAS_DETALLE_VENTA = [
  { clave: "comision", rotulo: "Comisión", alineado: "der" },
  { clave: "subtotal", rotulo: "Subtotal", alineado: "der" },
  { clave: "fecha", rotulo: "Fecha", alineado: "izq" },
  { clave: "cliente", rotulo: "Cliente", alineado: "izq" },
  { clave: "factura", rotulo: "Factura", alineado: "izq" },
  { clave: "utilidad", rotulo: "% Util.", alineado: "der" },
] as const;

/**
 * ⚠️ COBROS tiene CUATRO columnas y no cinco: **el API de Switch no expone el
 * número de recibo**, y por eso esa columna nunca existió. Acá tampoco se
 * inventa.
 */
export const COLUMNAS_DETALLE_COBRO = [
  { clave: "comision", rotulo: "Comisión", alineado: "der" },
  { clave: "monto", rotulo: "Monto", alineado: "der" },
  { clave: "fecha", rotulo: "Fecha", alineado: "izq" },
  { clave: "cliente", rotulo: "Cliente", alineado: "izq" },
] as const;

/** El aviso de que la tabla se desliza. Se dice una vez por tabla. */
export const AVISO_DESLIZA = "desliza para el lado →";

// ─────────────────────────────────────────────────────────────────────────────
// 8 · «Descargar» es UN solo botón
// ─────────────────────────────────────────────────────────────────────────────

/** Qué se baja cuando se toca «Descargar». */
export type QueSeBaja = "pdf-mes" | "excel-mes" | "pdf-vendedor";

export const OPCIONES_DESCARGA: { clave: QueSeBaja; rotulo: string }[] = [
  { clave: "pdf-mes", rotulo: "PDF del mes" },
  { clave: "excel-mes", rotulo: "Excel del mes" },
  { clave: "pdf-vendedor", rotulo: "PDF de un vendedor…" },
];

/** El rótulo del único botón de papel del módulo. */
export const ROTULO_DESCARGAR_COMISIONES = "Descargar";

// ─────────────────────────────────────────────────────────────────────────────
// 9r · «Mandar» desde el detalle del vendedor
// ─────────────────────────────────────────────────────────────────────────────

/** Las tres salidas, las MISMAS del estado de cuenta de Cuentas por Cobrar. */
export type ComoSeManda = "correo" | "whatsapp" | "link";

export const OPCIONES_MANDAR: { clave: ComoSeManda; rotulo: string }[] = [
  { clave: "correo", rotulo: "Correo" },
  { clave: "whatsapp", rotulo: "WhatsApp" },
  { clave: "link", rotulo: "Copiar el link" },
];

export const ROTULO_MANDAR = "Mandar";

/** «Mandar la comisión de agosto a Reynaldo Espinosa» — el título de la hoja. */
export function tituloDeLaHojaMandar(mes: string, vendedor: string): string {
  return `Mandar la comisión de ${mesEnPalabras(mes)} a ${vendedor}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cosas de orden · van sin preguntar y no cambian ningún número
// ─────────────────────────────────────────────────────────────────────────────

/** «1 ticket», no «1 tickets». */
export function tickets(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "ticket" : "tickets"}`;
}

/**
 * 🔴 «SOLO LA VENTA DE LA TIENDA», NO «RETAIL CONTRA RETAIL».
 *
 * «Retail» es jerga del sistema, no del negocio: la línea del bono la lee
 * Daniel, no el código.
 */
export const SOLO_VENTA_DE_LA_TIENDA = "por la venta de la tienda";
