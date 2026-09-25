/* ─────────────────────────────────────────────────────────────────────────────
 * ARRASTRAR UNA HORA DE COLUMNA (25-sep-2026). Módulo PURO: sin base, sin red,
 * sin `new Date()` y sin un solo número de plata.
 *
 * ── QUÉ APROBÓ DANIEL ───────────────────────────────────────────────────────
 *
 * En el detalle del colaborador, dentro de la fila del día: **la hora se agarra
 * y se suelta en su columna**. Dos casos, los dos del mockup:
 *
 *   1. una **marca suelta** —la que hoy baja a la línea «Otra marca del día:
 *      13:14:49» porque no entra en las cuatro columnas— se lleva a una columna
 *      VACÍA (Entrada · Sale almz. · Vuelve · Salida);
 *   2. una hora que **ya está en una columna** se lleva a otra (la 13:48:07 de
 *      «Salida» a «Vuelve»). La de origen queda vacía.
 *
 * Al soltar, la casilla de destino se abre con esa hora puesta, el porqué se
 * escribe solo —`MOTIVO_ARRASTRE`— y quedan «Guardar · Cancelar». **Soltar no
 * guarda**: guardar sigue siendo un toque aparte.
 *
 * ── 🔴 LO QUE NO CAMBIA ─────────────────────────────────────────────────────
 *
 * **Nada de lo que se guarda.** Arrastrar no es una manera nueva de escribir:
 * es una manera nueva de CAPTURAR lo mismo. Lo que sale de acá son entradas del
 * MISMO mapa `escrito` que ya llena el teclado (`EscritoEnCasilla`), que
 * `planDelDia` convierte en el MISMO plan y la pantalla manda por el MISMO
 * `POST /api/asistencia/correcciones/dia`. Ni una columna nueva en la base, ni
 * un campo nuevo en el cuerpo. La marcación del reloj sigue sin editarse ni
 * borrarse: la corrección va encima, firmada, y editar sigue siendo anular y
 * escribir.
 *
 * ── 🔑 LO QUE ESTE MÓDULO SÍ DECIDE: QUÉ MOVIMIENTO ES VÁLIDO ───────────────
 *
 *   · **una hora por columna** — no se suelta en una columna que ya tiene hora;
 *   · **no se suelta donde ya está** — mover a la misma columna no es mover;
 *   · **el día tiene que quedar en orden** — entrada ≤ sale a almorzar ≤ vuelve
 *     ≤ salida. Soltar la 13:48 en «Vuelve» cuando «Salida» dice 13:14 se
 *     rechaza con aviso, y no se escribe nada;
 *   · **solo se mueve una hora del RELOJ.** Una hora AGREGADA a mano no se
 *     puede vaciar de su casilla —«Quitar» solo existe sobre una marcación del
 *     reloj—, así que moverla dejaría la hora repetida en dos columnas. Se
 *     rechaza y se dice qué hacer: deshacer su corrección abajo.
 *
 * ── ⚠️ LO QUE HAY QUE SABER ANTES DE LEER UN NÚMERO ─────────────────────────
 *
 * **Las cuatro columnas de la pantalla son POSICIONALES**: `columnasClasicas`
 * reparte las marcas del día por su ORDEN (la 1.ª es la entrada, la última la
 * salida), y las marcas vienen ordenadas por hora. O sea: el sistema NO guarda
 * a qué columna pertenece cada marca, la deduce. Por eso mover una hora de una
 * columna a otra deja el día leyéndose igual —se anula la marca del reloj y se
 * escribe una a mano con la misma hora, con su firma y su motivo— y lo que
 * realmente cambia el día sigue siendo la HORA, no la columna.
 *
 * 🔑 Se construye igual porque es lo que Daniel aprobó y porque el gesto ahorra
 * teclear la hora, pero **está dicho acá y en el postmortem**: si él quiere que
 * la columna sea un dato guardado, eso es otra decisión y otra migración.
 * ────────────────────────────────────────────────────────────────────────── */

import { claveVacia, type EscritoEnCasilla } from "./editar-el-dia";
import { segundosDeHora } from "./marcas-del-dia";
import { COLUMNAS_DEL_DIA } from "./panel-del-dia";

/**
 * 🔴 EL INTERRUPTOR. En `false` no hay arrastre: las horas se tocan y se
 * teclean como hoy, y el panel del día queda EXACTAMENTE igual.
 */
export const ARRASTRAR_HORA = true;

/** El porqué que se escribe solo al soltar. Se puede cambiar antes de guardar. */
export const MOTIVO_ARRASTRE = "Marca movida de columna";

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SE ARRASTRA
// ─────────────────────────────────────────────────────────────────────────────

/** La hora que se agarró, con lo poco que hace falta saber de ella. */
export interface HoraArrastrada {
  /** La casilla de donde sale: `m<i>`, la marca número i del día. */
  clave: string;
  /** "HH:MM:SS". */
  hora: string;
  /** En qué columna se ve hoy (0..3). `null` = es una marca SUELTA. */
  columna: number | null;
  /** ¿Hay una marcación del RELOJ detrás? Solo ésas se pueden vaciar. */
  esDelReloj: boolean;
}

/** Lo que hay hoy en cada una de las cuatro columnas. `null` = vacía. */
export type HorasPorColumna = readonly (string | null)[];

export type Veredicto = { ok: true } | { ok: false; aviso: string };

// ─────────────────────────────────────────────────────────────────────────────
// LOS AVISOS — se dicen, nunca se callan
// ─────────────────────────────────────────────────────────────────────────────

export const AVISO_MISMA_COLUMNA = "Esa hora ya está en esa columna.";

export const AVISO_NO_ES_DEL_RELOJ =
  "Esa hora se agregó a mano. Deshaz su corrección, abajo del día, y vuelve a ponerla donde va.";

export const AVISO_DESORDEN =
  "Ahí no va: el día quedaría desordenado. La entrada va antes de la salida a almorzar, "
  + "ésa antes de la vuelta, y la vuelta antes de la salida.";

/** «"Vuelve" ya tiene una hora…». El nombre sale de las columnas reales. */
export function avisoOcupada(columna: number): string {
  const nombre = COLUMNAS_DEL_DIA[columna] ?? "esa columna";
  return `«${nombre}» ya tiene una hora. Quítala o muévela antes de poner otra.`;
}

/** Lo que dice el botón que hace lo mismo sin ratón, dentro de la casilla. */
export function rotuloMoverAqui(hora: string, cuantasSueltas: number): string {
  return cuantasSueltas === 1 ? "Mover aquí la marca suelta" : `Mover aquí ${hora}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA REGLA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cómo quedarían las cuatro columnas después del movimiento.
 *
 * 🔑 Es lo que se MIRA para decidir, no lo que se guarda: lo que se guarda lo
 * arma `escritoDelArrastre` y lo convierte `planDelDia`.
 */
export function columnasDespues(
  horas: HorasPorColumna,
  origen: HoraArrastrada,
  destino: number,
): (string | null)[] {
  const out = [0, 1, 2, 3].map((c) => horas[c] ?? null);
  if (origen.columna !== null && origen.columna >= 0 && origen.columna <= 3) {
    out[origen.columna] = null;
  }
  out[destino] = origen.hora;
  return out;
}

/**
 * ¿Las cuatro columnas quedan en orden? Las vacías no dicen nada y se saltan;
 * una hora que no se entiende tampoco decide: se salta (nunca se rechaza por
 * algo que no se pudo leer).
 */
export function enOrden(horas: readonly (string | null)[]): boolean {
  let previa = -1;
  for (const h of horas) {
    if (h === null || h === undefined) continue;
    const s = segundosDeHora(h);
    if (s === null) continue;
    if (s < previa) return false;
    previa = s;
  }
  return true;
}

/**
 * ¿Se puede soltar esta hora en esta columna?
 *
 * 🔴 El orden de los frenos importa: primero lo que no es un movimiento, después
 * lo que la casilla no admite, y al final lo que dejaría el día desordenado.
 */
export function puedeSoltar(opts: {
  origen: HoraArrastrada;
  destino: number;
  horasPorColumna: HorasPorColumna;
  activo?: boolean;
}): Veredicto {
  const activo = opts.activo ?? ARRASTRAR_HORA;
  if (!activo) return { ok: false, aviso: AVISO_MISMA_COLUMNA };
  const { origen, destino } = opts;
  if (!Number.isInteger(destino) || destino < 0 || destino > 3) {
    return { ok: false, aviso: AVISO_MISMA_COLUMNA };
  }
  if (origen.columna === destino) return { ok: false, aviso: AVISO_MISMA_COLUMNA };
  if (!origen.esDelReloj) return { ok: false, aviso: AVISO_NO_ES_DEL_RELOJ };
  if ((opts.horasPorColumna[destino] ?? null) !== null) {
    return { ok: false, aviso: avisoOcupada(destino) };
  }
  if (!enOrden(columnasDespues(opts.horasPorColumna, origen, destino))) {
    return { ok: false, aviso: AVISO_DESORDEN };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SE ESCRIBE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las entradas del mapa `escrito` que produce el movimiento.
 *
 * 🔴 SON EXACTAMENTE LAS DOS COSAS QUE YA SE PUEDEN HACER A MANO, en un gesto:
 *
 *   · la casilla de DESTINO recibe la hora — **carácter por carácter lo mismo**
 *     que abrirla y teclearla: `{ hora, quitar: false }`;
 *   · la casilla de ORIGEN se vacía — **lo mismo** que abrirla y tocar
 *     «Quitar»: `{ hora: "", quitar: true }`.
 *
 * De ahí sale el MISMO plan y el MISMO cuerpo del POST. No hay un tercer tipo
 * de cambio, ni un campo nuevo, ni nada que el servidor tenga que aprender.
 */
export function escritoDelArrastre(
  origen: HoraArrastrada,
  destino: number,
): Array<[string, EscritoEnCasilla]> {
  return [
    [claveVacia(destino), { hora: origen.hora, quitar: false }],
    [origen.clave, { hora: "", quitar: true }],
  ];
}

/** El mismo movimiento, ya como `Map` para el estado de la pantalla. */
export function mapaDelArrastre(
  origen: HoraArrastrada,
  destino: number,
): Map<string, EscritoEnCasilla> {
  return new Map(escritoDelArrastre(origen, destino));
}
