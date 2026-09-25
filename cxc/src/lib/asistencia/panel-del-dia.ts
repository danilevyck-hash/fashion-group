/* ─────────────────────────────────────────────────────────────────────────────
 * EL PANEL DEL DÍA ABRE SOLO LA CASILLA QUE SE TOCÓ (25-sep-2026). Módulo PURO:
 * sin base, sin red, sin `new Date()` y sin un solo número de plata.
 *
 * ── 🩸 LO QUE HABÍA ─────────────────────────────────────────────────────────
 *
 * Desde el 19-sep-2026 el día se arregla en la fila (`editar-el-dia.ts`), y eso
 * no se toca. Lo que pasaba es que **tocar UNA hora abría TODO**: las cuatro
 * casillas escribibles, dos «Quitar», «Hoy entraba a las __:__» con su frase de
 * once palabras, cuatro chips de motivo, el campo libre, «Guardar el día»,
 * «Cancelar», «Todavía no cambiaste nada», la nota de tres renglones «No se
 * borra nada…», y debajo «Teléfono · sin señal, enviada 13 h 12 min después ·
 * ver fotos».
 *
 * Daniel, mirando el miércoles 23 de septiembre de Ana Trejos, textual:
 * *«al hacer clic en una hora, que solo se abra el panel de esa casilla y no
 * toda»*; *«¿es necesario saber ahí Teléfono · sin señal…? ¿y ver fotos si ya
 * está en Marcaciones?»*; *«también hay botón de Arreglar día, ¿doble
 * entrada?»*.
 *
 * ── 🔴 LAS SIETE REGLAS ─────────────────────────────────────────────────────
 *
 *   1. **Una casilla a la vez.** Se toca una hora (o un hueco) y SOLO esa celda
 *      se vuelve escribible, en su lugar. Las otras tres siguen tocables: tocar
 *      otra cambia de casilla. «Quitar» sale solo en la casilla abierta.
 *   2. **El motivo que aplica a ESA casilla, y nada más** (`motivoDeLaCasilla`):
 *      «No marcó entrada · No marcó salida a almuerzo · No marcó vuelta de
 *      almuerzo · No marcó salida». Rótulos parejos, en el orden de las cuatro
 *      columnas. Más «Otro…», que abre el campo libre con los motivos más
 *      usados de 90 días (`motivos-frecuentes.ts`, que NO se retira).
 *      🩸 Los cuatro chips que Daniel vio juntos eran justamente esos motivos
 *      frecuentes, mal escritos y desordenados: se ofrecían los cuatro sin
 *      importar qué casilla se tocó.
 *   3. **«Hoy entraba a las» es de la ENTRADA** (`seMuestraEntradaAutorizada`):
 *      sale al tocar la primera columna y solo cuando ese día hay algo que
 *      decidir — el aviso de entrada temprana (≥ `avisoEntradaTempranaMin`, hoy
 *      30 min; la regla ya construida vive en `entrada-autorizada.ts`) o una
 *      autorización ya puesta, para poder cambiarla o quitarla ahí mismo.
 *   4. **La línea del teléfono se va del Reporte** (`lineaDelReporte`): «sin
 *      señal», «enviada N después», el reloj corrido y «ver fotos» viven en
 *      **Marcaciones**, que es la pestaña de eso. 🔴 Lo que NO está en ninguna
 *      otra pantalla se queda: cuántas marcas se olvidaron por repetidas y
 *      cuántas se deshicieron.
 *   5. **UN chip «Revisar»** (`chipRevisar`), no dos. «Revisar» y «Revisar
 *      salida» decían lo mismo con distinto nombre; el porqué entero se lee al
 *      pasar el cursor.
 *   6. **La nota «No se borra nada…» es un ⓘ** al lado de «Guardar», no un
 *      párrafo. El texto no cambia una letra.
 *   7. **«Arreglar el día» solo donde no hay hora que tocar**
 *      (`seOfreceArreglarElDia`): la fila gris de quien no marcó nada ese día.
 *      Donde hay horas y huecos, el botón era una SEGUNDA PUERTA a lo mismo
 *      —los dos llamaban a `abrirEditor()`— y se retira.
 *
 * ── 🔑 LO QUE NO CAMBIA ─────────────────────────────────────────────────────
 *
 * **Nada de lo que se guarda.** La ruta sigue siendo `POST
 * /api/asistencia/correcciones/dia` con el MISMO cuerpo: el día, el porqué y
 * los cambios que salen de `planDelDia` —que ya solo emitía las casillas
 * tocadas—. Editar sigue siendo anular y escribir, las dos filas quedan, el
 * motivo sigue siendo obligatorio y nada se aplica solo.
 * ────────────────────────────────────────────────────────────────────────── */

import { GUARDAR_EL_DIA } from "./editar-el-dia";
import { claveMotivo, MAX_MOTIVOS_FRECUENTES } from "./motivos-frecuentes";
import { lineaDelDia, textoDeshechas, textoRepetidas, type LineaDelDia, type MarcaParaResumir } from "./linea-del-dia";

/**
 * 🔴 EL INTERRUPTOR. En `false` el panel es EXACTAMENTE el de hoy: tocar una
 * hora abre las cuatro casillas, con sus chips, su nota y la línea del
 * teléfono. Se apaga acá, sin migración y sin tocar nada de lo que se guarda.
 */
export const PANEL_DEL_DIA_2026_09 = true;

// ─────────────────────────────────────────────────────────────────────────────
// 1 · LAS CUATRO CASILLAS
// ─────────────────────────────────────────────────────────────────────────────

/** Los rótulos de las cuatro columnas del día, en su orden. */
export const COLUMNAS_DEL_DIA = ["Entrada", "Sale almz.", "Vuelve", "Salida"] as const;

/**
 * 🔴 EL MOTIVO DE CADA CASILLA. Rótulos parejos —todos «No marcó …»— y en el
 * orden de las columnas. Es una lista CERRADA de cuatro: la quinta casilla (una
 * marca suelta que no entra en las cuatro columnas) no tiene motivo propio.
 */
export const MOTIVO_DE_LA_CASILLA = [
  "No marcó entrada",
  "No marcó salida a almuerzo",
  "No marcó vuelta de almuerzo",
  "No marcó salida",
] as const;

/** Lo que dice el chip que abre el campo libre. */
export const OTRO_MOTIVO = "Otro…";

/** El motivo que aplica a la columna `c` (0..3). `null` fuera de las cuatro. */
export function motivoDeLaCasilla(columna: number | null | undefined): string | null {
  if (typeof columna !== "number" || !Number.isInteger(columna)) return null;
  return MOTIVO_DE_LA_CASILLA[columna] ?? null;
}

/**
 * Los motivos que se ofrecen bajo «Otro…»: los más usados de 90 días, sin
 * repetir el que ya sale como chip propio de la casilla.
 *
 * 🔑 La comparación es por CLAVE (`claveMotivo`): minúsculas, sin acentos, un
 * solo espacio. «No marcó salida» y «no marco salida» son el mismo motivo, y no
 * se ofrece dos veces. Igualdad exacta sobre la clave, nunca por parecido.
 */
export function motivosLibres(
  frecuentes: readonly string[] | null | undefined,
  propio: string | null,
): string[] {
  const clavePropia = propio ? claveMotivo(propio) : null;
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const m of frecuentes ?? []) {
    const k = claveMotivo(m);
    if (!k || k === clavePropia || vistos.has(k)) continue;
    vistos.add(k);
    salida.push(m);
    if (salida.length >= MAX_MOTIVOS_FRECUENTES) break;
  }
  return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · «HOY ENTRABA A LAS»
// ─────────────────────────────────────────────────────────────────────────────

/** La columna de la Entrada. El único lugar donde se autoriza entrar antes. */
export const COLUMNA_ENTRADA = 0;

/**
 * ¿Se dibuja «Hoy entraba a las __:__» en esta casilla?
 *
 * 🔴 SOLO en la Entrada, y solo cuando hay algo que decidir ahí:
 *   · el día trae el aviso de entrada temprana (`entradaTempranaMin`, que el
 *     motor ya recorta con el umbral de las reglas: 29 min no, 30 sí), o
 *   · el día ya tiene una entrada autorizada, para poder cambiarla o quitarla
 *     desde el mismo lugar donde se puso.
 *
 * En cualquier otra casilla, y en un día normal, **no se dibuja nada**.
 */
export function seMuestraEntradaAutorizada(opts: {
  columna: number | null | undefined;
  /** Minutos que llegó antes, ya pasados por el umbral. `null` = sin aviso. */
  entradaTempranaMin?: number | null;
  tieneEntradaAutorizada?: boolean;
  activo?: boolean;
}): boolean {
  const activo = opts.activo ?? PANEL_DEL_DIA_2026_09;
  // Con el panel apagado el campo sale como siempre: una vez por día, arriba.
  if (!activo) return true;
  if (opts.columna !== COLUMNA_ENTRADA) return false;
  const hayAviso = typeof opts.entradaTempranaMin === "number" && Number.isFinite(opts.entradaTempranaMin);
  return hayAviso || opts.tieneEntradaAutorizada === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · LA LÍNEA DEBAJO DEL DÍA, SIN EL TELÉFONO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La línea gris debajo del día, tal como la ve el REPORTE.
 *
 * 🔴 Con el panel prendido, lo del teléfono no se dice acá: «sin señal»,
 * «enviada N después», el reloj corrido y «ver fotos» son la pestaña
 * **Marcaciones**, donde están las fotos y el mapa. Queda lo que no vive en
 * ninguna otra pantalla: las marcas que el motor olvidó por repetidas y las que
 * la persona deshizo desde su teléfono.
 *
 * `null` = no se dibuja NADA, que es el caso normal.
 */
export function lineaDelReporte(opts: {
  marcas?: readonly MarcaParaResumir[] | null;
  repetidas?: number | null;
  activo?: boolean;
}): LineaDelDia | null {
  const activo = opts.activo ?? PANEL_DEL_DIA_2026_09;
  if (!activo) return lineaDelDia(opts);

  const repetidas = Math.max(0, Math.trunc(opts.repetidas ?? 0));
  const deshechas = (opts.marcas ?? []).filter((m) => m && m.quitada).length;
  if (repetidas === 0 && deshechas === 0) return null;

  const partes: string[] = [];
  if (deshechas > 0) partes.push(textoDeshechas(deshechas));
  if (repetidas > 0) partes.push(textoRepetidas(repetidas));
  return {
    texto: partes.join(" · "),
    // 🔴 «ver fotos» NO sale del Reporte: está en Marcaciones.
    verFotos: false,
    llamaLaAtencion: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · UN SOLO CHIP «REVISAR»
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que dice el chip. Uno solo, siempre el mismo texto. */
export const TEXTO_REVISAR = "Revisar";

/** Por qué un día está a revisar. El mismo texto que explica la columna. */
export const TITULO_REVISAR =
  "Es un día terminado que no tiene exactamente 4 marcas —le falta alguna, o marcó de más—. "
  + "Los minutos igual cuentan: toca la hora o el hueco para arreglarlo.";

export interface ChipRevisar {
  texto: string;
  /** Todo el porqué, al pasar el cursor o al tocarlo. */
  titulo: string;
}

/**
 * El chip del día, o `null` si no hay nada que revisar.
 *
 * 🩸 Hasta hoy salían DOS chips ámbar pegados —«Revisar» y «Revisar salida»—
 * que se leían como dos problemas distintos y eran el mismo: ese día hay que
 * mirarlo. Ahora es UNO, y el título junta los dos porqués.
 *
 * 🔑 Acá no se decide nada: `revisar` y `salidaSospechosa` los pone el motor, y
 * ni un minuto cambia.
 */
export function chipRevisar(opts: {
  revisar?: boolean;
  salidaSospechosa?: boolean;
  /** El título largo de la salida sospechosa, que arma su propio módulo. */
  tituloSalida?: string | null;
  activo?: boolean;
}): ChipRevisar | null {
  const activo = opts.activo ?? PANEL_DEL_DIA_2026_09;
  const revisar = opts.revisar === true;
  const salida = opts.salidaSospechosa === true;
  if (!revisar && !salida) return null;
  if (!activo) return null; // apagado, la pantalla dibuja los dos chips de antes
  const porques: string[] = [];
  if (revisar) porques.push(TITULO_REVISAR);
  if (salida && opts.tituloSalida) porques.push(opts.tituloSalida);
  return { texto: TEXTO_REVISAR, titulo: porques.join("\n\n") };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 · LA NOTA, EN UN ⓘ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que dice el botón con el panel prendido. 🔑 Se guarda **una casilla**, no
 * el día entero: llamarlo «Guardar el día» sería prometer más de lo que hace.
 * Con el interruptor apagado sigue diciendo `GUARDAR_EL_DIA`, palabra por
 * palabra.
 */
export const GUARDAR = "Guardar";

/** El rótulo del botón que corresponde al estado del interruptor. */
export function rotuloGuardar(activo = PANEL_DEL_DIA_2026_09): string {
  return activo ? GUARDAR : GUARDAR_EL_DIA;
}

/**
 * 🔴 El texto NO cambia una letra: cambia dónde vive. Era un párrafo de tres
 * renglones debajo de los botones; ahora es lo que dice el ⓘ al lado de
 * «Guardar», que se lee cuando hace falta y no ocupa la pantalla el resto del
 * tiempo.
 */
export const NOTA_NO_SE_BORRA_NADA =
  "No se borra nada: lo que marcó el reloj queda guardado y la corrección va encima, "
  + "con tu nombre y este motivo.";

/** El nombre accesible del ⓘ. Se lee solo, sin ver el ícono. */
export const ROTULO_NOTA = "Qué pasa al guardar";

// ─────────────────────────────────────────────────────────────────────────────
// 7 · «ARREGLAR EL DÍA» — ¿DOBLE ENTRADA?
// ─────────────────────────────────────────────────────────────────────────────

/** El rótulo, sin cambios: donde queda, se sigue llamando igual. */
export const ARREGLAR_EL_DIA = "Arreglar el día";

/**
 * ¿Se ofrece «Arreglar el día»?
 *
 * 🔴 **SOLO cuando el día no dibuja ni una hora ni un hueco que tocar**: la fila
 * gris de quien no marcó, la ausencia, el día en curso sin marcas. Ahí el día
 * ocupa una sola celda ancha y no hay dónde hacer clic, así que el botón es la
 * ÚNICA puerta.
 *
 * Donde el día tiene sus cuatro columnas —con horas, con huecos, o las dos
 * cosas— el botón era una SEGUNDA PUERTA a exactamente lo mismo: tocarlo y
 * tocar una hora llamaban a la misma función. Se retira.
 */
export function seOfreceArreglarElDia(opts: {
  /** Cuántas marcas tiene el día. 0 = la fila gris de una sola celda. */
  marcas: number;
  activo?: boolean;
}): boolean {
  const activo = opts.activo ?? PANEL_DEL_DIA_2026_09;
  if (!activo) return true;
  return (opts.marcas ?? 0) === 0;
}
