// ============================================================================
// EL PAPEL DE LA GUÍA, HACIA ADELANTE (24-sep-2026).
//
// Daniel pidió seis arreglos sobre el papel que se imprime y se comparte: las
// firmas derechas, el título que diga de qué guía se trata, «DESTINO» en vez de
// «DIRECCIÓN», los renglones juntos por cliente, las firmas pegadas debajo de
// las observaciones y el pie legal al pie de la hoja.
//
// 🔴 SOLO HACIA ADELANTE. Esto cambia el DIBUJO del PDF que se genera desde
// ahora. Las guías ya guardadas y sus firmas NO se tocan: no hay migración, no
// hay UPDATE, no se mueve una sola columna. El papel viejo que alguien tenga
// impreso o en el celular sigue siendo el que se firmó.
//
// 🔴 TODO CUELGA DE UN INTERRUPTOR. Con `GUIA_PAPEL_2026_09` en `false` el
// documento vuelve a salir EXACTAMENTE como salía: mismo título, misma fila
// «TIPO», misma columna «DIRECCIÓN», mismo orden de renglones y las firmas en
// las mismas cajas. Es la red para que Daniel lo pruebe en producción con su
// secretaria y, si algo no le cuadra, se apague sin desarmar nada.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🩸 EL DEFECTO CENTRAL: LAS DOS FIRMAS SALÍAN CRUZADAS EN TRANSPORTISTA
// EXTERNO.
//
// El recorrido, verificado en el código el 24-sep-2026:
//   · `DespachoForm.tsx` dibuja DOS cuadros. El primero (`canvas1` → `firma1`)
//     se rotula «Firma del transportista» cuando el despacho es externo, y
//     «Firma del chofer» cuando es entrega directa. Lo que se firma ahí se
//     guarda en la columna `firma_base64`.
//   · El segundo (`canvas2` → `firma2`) se rotula «Firma del entregador» en
//     externo y «Firma del cliente» en directa, y se guarda en
//     `firma_entregador_base64`.
//   · El papel (este PDF y la hoja `PrintDocument.tsx`) dibuja `firma_base64`
//     en la caja IZQUIERDA, titulada «Despachado por» (externo) o «Chofer»
//     (directa), y `firma_entregador_base64` en la caja DERECHA, titulada
//     «Recibido Conforme — Transportista» (externo) o «Recibido por — Cliente»
//     (directa).
//
// ⇒ En ENTREGA DIRECTA está bien: el chofer firma el cuadro que sale bajo
//   «Chofer» y el cliente el que sale bajo «Cliente».
// ⇒ En TRANSPORTISTA EXTERNO está CRUZADO: la firma del TRANSPORTISTA sale
//   impresa bajo «Despachado por» y la de quien DESPACHA sale bajo «Recibido
//   Conforme — Transportista». O sea que el papel le atribuye a cada uno la
//   firma del otro, justo en el documento que sirve de respaldo si hay un
//   reclamo por mercancía que no llegó.
//
// 📏 MEDIDO CONTRA PRODUCCIÓN el 24-sep-2026 (`guia_transporte`, filas vivas):
//   · 239 guías vivas · 222 en modo externo efectivo · **157 de esas 222 traen
//     las DOS firmas**, o sea 157 papeles con las firmas cambiadas de caja.
//   · 17 son entrega directa, las 17 con las dos firmas, y esas salían bien.
//   (La auditoría del 23-sep hablaba de «169 de 237»; contando hoy, por
//   cualquiera de los caminos razonables, da 157 vivas — 161 si se cuentan
//   también las borradas. Se deja el número medido, no el heredado.)
//
// 🔴 NADA SE REESCRIBE EN LA BASE. El arreglo es de DIBUJO: cada firma se
// imprime bajo su rótulo. Cambiar las columnas de las 157 guías firmadas sería
// reescribir historia firmada por otra gente.
// ============================================================================

import { esEntregaDirecta, type GuiaModo } from "./modo-despacho";

/**
 * 🔴 EL INTERRUPTOR. `true` = el papel nuevo; `false` = el papel de siempre,
 * sin una sola diferencia.
 */
export const GUIA_PAPEL_2026_09 = true;

// 🔑 TODAS LAS FUNCIONES DE ABAJO RECIBEN EL INTERRUPTOR COMO ÚLTIMO
// PARÁMETRO, con el valor de hoy por defecto (el mismo patrón que
// `PAPEL_SOLO_PAGABLE` en Comisiones). Así el candado prueba las DOS formas del
// papel corriendo el código de verdad, sin una segunda implementación
// «apagada» que sería justo lo que hay que vigilar.

// ── El título ───────────────────────────────────────────────────────────────

/** Lo que decía el papel hasta el 24-sep-2026, para las dos hojas. */
export const TITULO_VIEJO = "GUÍA DE TRANSPORTE INTERIOR";
export const TITULO_EXTERNO = "GUÍA DE TRANSPORTE EXTERNO";
export const TITULO_DIRECTA = "GUÍA DE ENTREGA DIRECTA";

/**
 * El título de la hoja.
 *
 * 🔴 El modo sale de `tipoDespachoEfectivo` (vía `esEntregaDirecta`) y de
 * ningún otro lado: es la MISMA pregunta que ya deciden el resto del papel, la
 * placa y la columna del transportista. Una segunda forma de decidirlo sería un
 * papel que se contradice consigo mismo.
 */
export function tituloDelPapel(g: GuiaModo, nuevo: boolean = GUIA_PAPEL_2026_09): string {
  if (!nuevo) return TITULO_VIEJO;
  return esEntregaDirecta(g) ? TITULO_DIRECTA : TITULO_EXTERNO;
}

/**
 * La fila «TIPO:» del bloque de campos se retira: el título ya dice de qué guía
 * se trata, y repetirlo dos veces en la misma hoja es ruido.
 */
export function seDibujaLaFilaTipo(nuevo: boolean = GUIA_PAPEL_2026_09): boolean {
  return !nuevo;
}

// ── Los rótulos ─────────────────────────────────────────────────────────────

/**
 * La columna de la tabla se llama DESTINO. Lo que va ahí es a dónde se manda el
 * envío —no la dirección del cliente, que vive en el directorio—, y esa
 * confusión ya costó guías mandadas al lugar equivocado.
 */
export const ROTULO_DESTINO_VIEJO = "DIRECCIÓN";
export const ROTULO_DESTINO_NUEVO = "DESTINO";

export function rotuloDestino(nuevo: boolean = GUIA_PAPEL_2026_09): string {
  return nuevo ? ROTULO_DESTINO_NUEVO : ROTULO_DESTINO_VIEJO;
}

/** «N°», con el signo de grado, como se escribe un número en español. */
export function rotuloNumeroGuia(nuevo: boolean = GUIA_PAPEL_2026_09): string {
  return nuevo ? "N° GUÍA:" : "N GUÍA:";
}

export function rotuloNumeroTransp(nuevo: boolean = GUIA_PAPEL_2026_09): string {
  return nuevo ? "N° GUÍA TRANSP.:" : "N GUÍA TRANSP.:";
}

/** El mismo rótulo, sin los dos puntos, para el encabezado de la columna. */
export function rotuloColumnaNumeroTransp(nuevo: boolean = GUIA_PAPEL_2026_09): string {
  return nuevo ? "N° GUÍA TRANSP." : "N GUÍA TRANSP.";
}

// ── Los renglones, por cliente ──────────────────────────────────────────────

export interface RenglonDelPapel<T> {
  item: T;
  /**
   * Primero de su cliente. La primera fila de cada grupo —menos la primera de
   * toda la tabla— lleva la raya gris que separa un cliente del siguiente.
   */
  primeroDeSuGrupo: boolean;
}

/** La clave de agrupación: igualdad exacta normalizada, JAMÁS por parecido. */
export function claveDeCliente(cliente: string | null | undefined): string {
  return String(cliente ?? "").trim().toUpperCase();
}

/**
 * 🔴 LOS RENGLONES DEL MISMO CLIENTE, JUNTOS — y el nombre repetido en TODOS.
 *
 * Daniel, textual: *«que se repita para que no haya confusión»*. Una guía lleva
 * facturas de varios clientes (un renglón por cliente-empresa), y quien recibe
 * en bodega lee la hoja de arriba abajo: con los renglones de un mismo cliente
 * salteados, se entregaba de menos.
 *
 * 🔑 EL ORDEN ES ESTABLE, no alfabético. Los grupos salen en el orden en que el
 * cliente APARECE por primera vez, y adentro de cada grupo los renglones
 * conservan su orden original. Ordenar alfabéticamente le cambiaría el orden a
 * quien armó la guía, que es quien sabe cómo se cargó el camión.
 *
 * Con el interruptor apagado devuelve los renglones tal como vinieron y sin una
 * sola raya: el papel de antes, byte por byte.
 */
export function renglonesDelPapel<T extends { cliente?: string | null }>(
  items: readonly T[],
  nuevo: boolean = GUIA_PAPEL_2026_09,
): Array<RenglonDelPapel<T>> {
  if (!nuevo) {
    return items.map((item) => ({ item, primeroDeSuGrupo: false }));
  }
  const orden: string[] = [];
  const grupos = new Map<string, T[]>();
  for (const item of items) {
    const clave = claveDeCliente(item.cliente);
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = [];
      grupos.set(clave, grupo);
      orden.push(clave);
    }
    grupo.push(item);
  }
  return orden.flatMap((clave) =>
    (grupos.get(clave) ?? []).map((item, i) => ({ item, primeroDeSuGrupo: i === 0 })),
  );
}

// ── Las firmas ──────────────────────────────────────────────────────────────

export interface GuiaConFirmasDelPapel extends GuiaModo {
  /** Lo que se firmó en el PRIMER cuadro: transportista (externo) o chofer. */
  firma_base64?: string | null;
  /** Lo que se firmó en el SEGUNDO: entregador (externo) o cliente. */
  firma_entregador_base64?: string | null;
}

export interface FirmasDelPapel {
  /** La caja de la IZQUIERDA: «Despachado por» (externo) o «Chofer». */
  izquierda: string | null | undefined;
  /** La caja de la DERECHA: «Recibido Conforme…» o «Recibido por — Cliente». */
  derecha: string | null | undefined;
}

/**
 * 🔴 CADA FIRMA BAJO SU RÓTULO. Ver la cabecera del archivo para el recorrido
 * completo y la medición.
 *
 * · Entrega directa: NADA cambia. `firma_base64` es la del chofer y va bajo
 *   «Chofer»; `firma_entregador_base64` es la del cliente y va bajo «Recibido
 *   por — Cliente». Ya estaba bien y tocarlo sería estrenar el defecto ahí.
 * · Transportista externo: se cruzan al dibujar. `firma_base64` es la del
 *   TRANSPORTISTA y baja a la caja «Recibido Conforme — Transportista»;
 *   `firma_entregador_base64` es la de quien DESPACHA y sube a «Despachado
 *   por».
 *
 * ⚠️ Esto NO toca lo guardado: las columnas siguen queriendo decir lo mismo que
 * el día que se firmaron. Lo que se arregla es en qué caja se imprime cada una.
 */
export function firmasDelPapel(
  g: GuiaConFirmasDelPapel,
  nuevo: boolean = GUIA_PAPEL_2026_09,
): FirmasDelPapel {
  const delPrimerCuadro = g.firma_base64;
  const delSegundoCuadro = g.firma_entregador_base64;
  if (!nuevo || esEntregaDirecta(g)) {
    return { izquierda: delPrimerCuadro, derecha: delSegundoCuadro };
  }
  return { izquierda: delSegundoCuadro, derecha: delPrimerCuadro };
}

// ── El acomodo de la hoja ───────────────────────────────────────────────────

/** Alto de la hoja carta, en mm. */
export const ALTO_HOJA_MM = 279.4;

/**
 * Dónde empieza el pie legal: al PIE de la hoja, no a media página.
 *
 * 🩸 Estaba clavado en `y = 250` mientras las firmas caían donde terminara la
 * tabla: en una guía corta quedaba un hueco enorme entre las firmas y el pie, y
 * en una larga la tabla se le venía encima.
 */
export const PIE_LEGAL_Y = ALTO_HOJA_MM - 18;

/**
 * Lo que mide el bloque de las dos firmas, de punta a punta. Se usa para saber
 * si todavía entran en esta hoja o hay que abrir una.
 */
export const ALTO_FIRMAS_MM = 36;

/** Aire entre la caja de observaciones y las firmas: quedan PEGADAS debajo. */
export const AIRE_ANTES_DE_FIRMAS_MM = 8;

/** Arriba de dónde arrancan las firmas si hubo que abrir una hoja nueva. */
export const TOPE_HOJA_NUEVA_MM = 25;

/**
 * ¿Entran las firmas en lo que queda de esta hoja, sin pisar el pie legal?
 *
 * 🔴 Con varias hojas, las firmas y el pie legal van en la ÚLTIMA. Una guía de
 * 40 renglones paginaba sola y las firmas se dibujaban igual, encima de la
 * tabla o fuera del papel.
 */
export function cabenLasFirmas(y: number): boolean {
  return y + ALTO_FIRMAS_MM <= PIE_LEGAL_Y - 4;
}
