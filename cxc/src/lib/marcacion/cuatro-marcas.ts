// ─────────────────────────────────────────────────────────────────────────────
// CUATRO MARCAS TAMBIÉN EN EL TELÉFONO (24-sep-2026). Módulo PURO: sin React,
// sin red, sin base, sin `new Date()`.
//
// Daniel, textual: *«Cuatro marcas también en el teléfono»* y, al preguntarle
// si el botón las iba pidiendo en orden y si las cuatro llevaban foto:
// *«sí el botón va solo en orden, y sí va foto en las cuatro»*.
//
// Hasta hoy el teléfono era de DOS marcas —entrada y salida— y el reloj físico
// de cuatro. Quien deja el reloj y marca desde el teléfono perdía el almuerzo,
// y el reporte le quedaba con dos marcas donde la contadora espera cuatro.
//
// LAS REGLAS, todas de Daniel:
//
//   1. 🔴 EL BOTÓN VA SOLO EN ORDEN, COMO EL RELOJ. «Marcar entrada» →
//      «Marcar salida a almuerzo» → «Marcar vuelta de almuerzo» → «Marcar
//      salida», y tras la cuarta queda gris en «Listo por hoy».
//      🔴 LA PERSONA NUNCA ELIGE CUÁL MARCA ES: la decide el orden del día.
//      Es la MISMA regla que ya usaba el motor de Asistencia —la primera del
//      día es la entrada, la última la salida, las del medio el almuerzo—, y
//      por eso no hace falta que el teléfono se la explique a nadie.
//   2. 🔴 FOTO EN LA ENTRADA Y EN LA SALIDA; EL ALMUERZO VA SIN FOTO, DE UN
//      SOLO TOQUE (Daniel, 24-sep-2026). En la 1.ª y la 4.ª sigue valiendo
//      «aceptar la foto ES marcar»; la 2.ª y la 3.ª marcan al tocar el botón,
//      sin abrir la cámara. 🔴 LA UBICACIÓN SE GUARDA EN LAS CUATRO, igual, y
//      el «Deshacer» de 2 minutos también.
//      🔴 QUIÉN PIDE FOTO LO DECIDE EL SERVIDOR, no el teléfono: `pideFoto`
//      mira el ORDEN del día (las mismas marcas con las que se cuenta el
//      botón) y la ruta vuelve a validar con esa respuesta. Un teléfono no
//      puede saltarse la foto de la entrada diciendo que es el almuerzo.
//   3. La cola sin señal aguanta las cuatro del día: nunca hubo un tope de dos
//      en el teléfono (`cola-offline.ts` guarda por `eventoId`), y el del
//      SERVIDOR pasa de dos a cuatro por esta misma constante.
//
// 🔴 NADA DE LO QUE SE GUARDA CAMBIA. La marca viaja con el MISMO payload de
// siempre (candado `marcacion-payload-igual`) y cae en `asistencia_marcaciones`
// con las MISMAS columnas. El campo `tipo` sigue valiendo `entrada` o `salida`
// —lo único que `validarPayloadMarca` acepta— y se alterna por el orden del
// día: 1.ª entrada · 2.ª salida (a almuerzo) · 3.ª entrada (la vuelta) · 4.ª
// salida. No se inventa un valor nuevo, y no hace falta: el motor del reporte
// NI SIQUIERA LEE esa columna —selecciona `id, empleado_codigo,
// empleado_nombre, ocurrio_en, dispositivo`— y asigna por ORDEN. Lo que sí
// cambia son los RÓTULOS de la pantalla, que no se guardan en ningún lado.
//
// ⚠️ LO ÚNICO QUE SE VE DISTINTO EN LA BASE: las dos marcas del almuerzo caen
// con `foto_path` en NULL. La columna es `text` NULLABLE desde que nació
// (`20261127120000_marcacion_telefono.sql`) y ya venía en NULL en TODAS las
// marcas del reloj físico, que nunca tuvieron foto; el reporte de la contadora
// ya lo contempla (`en-el-reporte.ts` › `tieneFoto`). Ningún otro campo cambia:
// la ubicación, la hora, el origen y el `evento_id` viajan igual.
//
// ⚠️ Un día que quede en 2 o 3 marcas no se arregla desde el teléfono: el
// reporte lo marca «a revisar», igual que con el reloj físico.
// ─────────────────────────────────────────────────────────────────────────────

import {
  QUIEN_CORRIGE,
  diaPanamaDe,
  enDoceHoras,
  estadoDelBoton,
  horaCorta,
  type EstadoBoton,
  type MarcaSimple,
  type TipoMarca,
} from "./marcacion";

/** 🔴 El interruptor. `true` = cuatro marcas al día desde el teléfono.
 *  `false` = las dos de siempre, byte a byte. */
export const MARCACION_CUATRO_MARCAS = true;

/** Cuántas marcas tiene un día completo con el interruptor prendido. */
export const MARCAS_POR_DIA_CUATRO = 4;

/**
 * 🔴 LO QUE DICE EL BOTÓN, EN ORDEN. El índice es cuántas marcas lleva hoy:
 * con 0 dice la primera, con 1 la segunda, y así. Nadie elige de esta lista.
 */
export const ROTULOS_DEL_BOTON = [
  "Marcar entrada",
  "Marcar salida a almuerzo",
  "Marcar vuelta de almuerzo",
  "Marcar salida",
] as const;

/** Cómo se NOMBRA cada marca en una frase: «Deshacer la salida a almuerzo»,
 *  «Listo, se deshizo la vuelta de almuerzo». */
export const NOMBRES_DE_LA_MARCA = [
  "entrada",
  "salida a almuerzo",
  "vuelta de almuerzo",
  "salida",
] as const;

/** El rótulo corto de la pastilla verde, donde el espacio es de un renglón. */
export const ROTULOS_CORTOS = ["Entrada", "Almuerzo", "Vuelta", "Salida"] as const;

/**
 * 🔴 QUÉ MARCAS PIDEN FOTO. La entrada (0) y la salida (3); las dos del
 * ALMUERZO (1 y 2) no. Daniel, 24-sep-2026: el almuerzo es un solo toque.
 * Con el interruptor apagado la piden las dos marcas de siempre, como hasta
 * hoy. Fuera de las cuatro se pide: ante la duda, la foto.
 */
export const MARCAS_CON_FOTO = [true, false, false, true] as const;

export function pideFoto(indice: number): boolean {
  if (!MARCACION_CUATRO_MARCAS) return true;
  const i = Math.floor(Number.isFinite(indice) ? indice : 0);
  return MARCAS_CON_FOTO[i] ?? true;
}

/** Cuántas marcas entran en un día, según el interruptor. Lo lee el SERVIDOR
 *  para frenar la quinta, y la pantalla para apagar el botón. */
export function marcasPorDia(): number {
  return MARCACION_CUATRO_MARCAS ? MARCAS_POR_DIA_CUATRO : 2;
}

/**
 * 🔑 QUÉ ES LA MARCA NÚMERO `indice` PARA LO QUE SE GUARDA. Alterna, porque
 * eso es lo que de verdad pasa: se entra, se sale a almorzar, se vuelve a
 * entrar y se sale. El valor sigue siendo `entrada` o `salida`, los únicos dos
 * que la base y el validador conocen desde el 14-sep-2026.
 */
export function tipoDeLaMarca(indice: number): TipoMarca {
  return Math.max(0, Math.floor(indice)) % 2 === 0 ? "entrada" : "salida";
}

/**
 * La misma pregunta, honrando el interruptor: con las dos marcas de siempre, la
 * primera del día es la entrada y cualquier otra es la salida.
 */
export function tipoDeLaMarcaHoy(indice: number): TipoMarca {
  if (!MARCACION_CUATRO_MARCAS) return Math.floor(indice) <= 0 ? "entrada" : "salida";
  return tipoDeLaMarca(indice);
}

/** Cómo se llama la marca número `indice` en una frase. Fuera de las cuatro
 *  —o con el interruptor apagado— se dice lo de siempre: entrada o salida. */
export function nombreDeLaMarca(indice: number, tipo: TipoMarca): string {
  if (!MARCACION_CUATRO_MARCAS) return tipo;
  const i = Math.floor(indice);
  return i >= 0 && i < NOMBRES_DE_LA_MARCA.length ? NOMBRES_DE_LA_MARCA[i] : tipo;
}

/**
 * Qué dice el botón con `marcasHoy` marcas ya hechas — las del teléfono, las
 * del reloj físico y las que esperan señal, todas juntas, igual que siempre.
 */
export function botonCuatroMarcas(marcasHoy: number): EstadoBoton {
  const n = Math.max(0, Math.floor(Number.isFinite(marcasHoy) ? marcasHoy : 0));
  // 🔑 El día completo se dice con la MISMA respuesta de siempre —«Ya marcaste
  // hoy», apagado, sin tipo— y es `botonUnToque` quien la rebautiza «Listo por
  // hoy». Escribir el texto otra vez acá sería una segunda copia del rótulo.
  if (n >= MARCAS_POR_DIA_CUATRO) return estadoDelBoton(n);
  return { tipo: tipoDeLaMarca(n), texto: ROTULOS_DEL_BOTON[n], apagado: false };
}

/**
 * 🔴 LA REGLA DEL BOTÓN, UNA SOLA, PARA LA PANTALLA Y PARA EL SERVIDOR. Con el
 * interruptor apagado es `estadoDelBoton` tal cual — la de las dos marcas.
 */
export function estadoDelBotonHoy(marcasHoy: number): EstadoBoton {
  return MARCACION_CUATRO_MARCAS ? botonCuatroMarcas(marcasHoy) : estadoDelBoton(marcasHoy);
}

/** Lo que contesta el servidor cuando el día ya está completo. */
export function avisoDiaCompleto(): string {
  const que = MARCACION_CUATRO_MARCAS ? "sus cuatro marcas" : "su entrada y su salida";
  return `Ese día ya tiene ${que}. Si algo está mal, avísale a ${QUIEN_CORRIGE}.`;
}

/** «Deshacer la salida a almuerzo». Con el interruptor apagado dice lo de
 *  siempre («Deshacer la entrada» · «Deshacer la salida»). */
export function rotuloDeshacerDeLaMarca(indice: number, tipo: TipoMarca): string {
  return `Deshacer la ${nombreDeLaMarca(indice, tipo)}`;
}

/** «Listo, se deshizo la vuelta de almuerzo. Puedes marcar de nuevo.» */
export function avisoDeshechaDeLaMarca(indice: number, tipo: TipoMarca): string {
  return `Listo, se deshizo la ${nombreDeLaMarca(indice, tipo)}. Puedes marcar de nuevo.`;
}

/**
 * Las horas de UN día, en orden, como «HH:MM» de Panamá. Es la misma regla que
 * cuenta el botón (`diaPanamaDe`) y la misma que dibuja las horas (`horaCorta`):
 * la pastilla no puede decir una hora distinta de la que se guardó.
 */
export function horasDelDia(marcas: readonly MarcaSimple[], fecha: string): string[] {
  return marcas
    .filter((m) => Number.isFinite(Date.parse(m.ocurrioEn)) && diaPanamaDe(m.ocurrioEn) === fecha)
    .map((m) => Date.parse(m.ocurrioEn))
    .sort((a, b) => a - b)
    .map((t) => horaCorta(new Date(t).toISOString()));
}

/**
 * 🔴 LA PASTILLA DICE LAS MARCAS QUE HAY, CON SU NOMBRE. Antes decía «Entrada
 * 8:00 · Salida 12:00» con la primera y la última: a mediodía, con la salida a
 * almuerzo recién puesta, eso se lee como que ya salió del trabajo.
 * «Entrada 8:00 a. m. · Almuerzo 12:00 p. m.» dice lo que pasó.
 */
export function resumenDelDia(horas: readonly string[]): string {
  return horas
    .map((h, i) => `${ROTULOS_CORTOS[i] ?? "Marca"} ${enDoceHoras(h)}`)
    .join(" · ");
}
