/* ─────────────────────────────────────────────────────────────────────────────
 * EDITAR EL DÍA COMPLETO, EN LA MISMA FILA — el motor, PURO.
 *
 * Sin base, sin red, sin `new Date()`. Decide QUÉ se va a escribir a partir de
 * lo que había y lo que la persona tecleó; escribirlo es del servidor.
 *
 * ── QUÉ DECIDIÓ DANIEL (19-sep-2026) ────────────────────────────────────────
 *
 * Hasta hoy corregir un día era **una ventana por cada marca**, y para cambiar
 * una hora ya corregida había que **deshacer primero y volver a escribir el
 * motivo**. Medido contra producción: **232 correcciones sobre 141 días de 33
 * personas**; **58 días necesitaron 2, 3 y hasta 7 ventanas**; **58
 * correcciones se anularon** y **44 de ellas fueron seguidas de otra del mismo
 * día en menos de 10 minutos** — o sea, deshacer-para-reescribir.
 *
 * Daniel eligió **sin ventana**: se edita en la misma fila del Reporte. Al
 * tocar una hora (o un hueco) esa celda se vuelve escribible ahí mismo, se
 * arreglan **las cuatro marcas del día a la vez**, y abajo de la fila va **un
 * solo campo de motivo** y **un solo botón «Guardar el día»**.
 *
 * ── 🔴 LO QUE NO CAMBIA, Y NO SE NEGOCIA ────────────────────────────────────
 *
 *   · `asistencia_marcaciones` NUNCA se edita ni se borra. La corrección sigue
 *     yendo ENCIMA, en `asistencia_correcciones`, con motivo obligatorio y
 *     firma. Hay barrido estático que prohíbe `update`/`delete`/`upsert` sobre
 *     la tabla del reloj, y este módulo no escribe nada.
 *   · **NADA SE APLICA SOLO.** Una casilla que nadie tocó no produce ni un
 *     cambio; una hora igual a la que ya vale, tampoco. No se rellenan huecos,
 *     no se inventan horas, no se «completa» el día.
 *   · El motivo sigue siendo OBLIGATORIO, y es el mismo para todo lo que se
 *     guarde en ese golpe: es la razón por la que ese día se tocó.
 *   · **«Deshacer» se queda para lo ya guardado**, donde siempre estuvo: en la
 *     línea de la corrección, debajo del día. Editar es editar — no hace falta
 *     deshacer antes—, pero volver a la hora del reloj sigue siendo deshacer.
 *
 * ── 🔑 REEMPLAZAR NO ES PISAR ───────────────────────────────────────────────
 *
 * La base tiene un único parcial: **UNA corrección viva por marcación**. Así
 * que cambiar la hora de una marca ya corregida es **anular la anterior y
 * escribir una nueva** — las dos filas quedan, con su firma y su motivo. Lo que
 * se ahorra es el viaje: la persona no tiene que deshacer, cerrar, volver a
 * abrir y volver a escribir el porqué. `reemplaza` es esa corrección vieja.
 * ────────────────────────────────────────────────────────────────────────── */

import { completarSegundos, normalizarHora, type CorreccionVisible } from "./correcciones";
// 🔴 LA ENTRADA AUTORIZADA DEL DÍA (24-sep-2026) viaja en el MISMO plan y se
// guarda en el mismo golpe, con el mismo porqué. Su regla vive en su módulo.
import { resumenCambioEntrada, type CambioEntradaAutorizada } from "./entrada-autorizada";

/**
 * 🔴 EL INTERRUPTOR. En `false` el Reporte es EXACTAMENTE el de antes: cada
 * hora abre `CorregirMarcacionModal` y no hay edición en la fila. Es la regla
 * de la casa para lo que cambia una pantalla que se usa a diario — se apaga
 * acá, sin migración y sin tocar nada de lo que se guarda.
 */
export const EDITAR_EL_DIA = true;

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE HAY
// ─────────────────────────────────────────────────────────────────────────────

/** Una casilla del día: una marca que existe, con lo que la explica. */
export interface CasillaDelDia {
  /** Identifica la casilla dentro del día. `m<i>` = la marca número i. */
  clave: string;
  /** La posición dentro de las marcas del día. */
  idx: number;
  /** La marcación del RELOJ detrás. `null` = se agregó a mano. */
  marcacionId: string | null;
  /** Lo que dijo el reloj. `null` cuando la marca se agregó a mano. */
  relojHora: string | null;
  /** La hora que VALE hoy para el cálculo. "HH:MM:SS". */
  hora: string;
  /** La corrección viva que produjo esta hora, si la hay. */
  correccionId: string | null;
}

/** La clave de una casilla VACÍA de la columna `c` (0..3): una marca que falta. */
export function claveVacia(columna: number): string {
  return `v${columna}`;
}

/** La clave de la marca número `idx`. */
export function claveMarca(idx: number): string {
  return `m${idx}`;
}

/** Lo mínimo que este módulo le pide a un día del Reporte. */
export interface DiaParaEditar {
  marcas: readonly string[];
  marcasIds: readonly (string | null)[];
  correcciones: readonly CorreccionVisible[];
}

/**
 * Las casillas del día, una por marca que HOY cuenta.
 *
 * ⚠️ Las marcas QUITADAS no están acá, porque no están en `marcas`: dejaron de
 * contar. Se deshacen desde su línea de corrección, como siempre.
 */
export function casillasDelDia(d: DiaParaEditar): CasillaDelDia[] {
  const salida: CasillaDelDia[] = [];
  for (let i = 0; i < d.marcas.length; i += 1) {
    const hora = d.marcas[i];
    // La corrección de ESTA marca es la que produjo su hora. Es la misma
    // búsqueda que ya hacía la pantalla para pintarla de azul.
    const c = d.correcciones.find((x) => !x.quitada && x.hora === hora) ?? null;
    salida.push({
      clave: claveMarca(i),
      idx: i,
      marcacionId: d.marcasIds[i] ?? null,
      relojHora: c ? c.relojHora : (hora ?? null),
      hora,
      correccionId: c?.id ?? null,
    });
  }
  return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SE TECLEÓ
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que la persona dejó en una casilla. */
export interface EscritoEnCasilla {
  /** Lo que dice el selector de hora. "" = vacío. */
  hora: string;
  /** Marcó «quitar esta marcación». Solo vale sobre una marca del RELOJ. */
  quitar?: boolean;
}

export type TipoCambio = "corregir" | "agregar" | "quitar";

/** Un cambio que el servidor va a escribir. Uno por casilla que se tocó. */
export interface CambioDelDia {
  clave: string;
  tipo: TipoCambio;
  /** La marcación del reloj detrás. `null` = una marca que no existe en el reloj. */
  marcacionId: string | null;
  /**
   * 🔴 La corrección VIVA que hay que anular antes de escribir la nueva. Es
   * todo el punto de «editar es editar»: la persona no la deshace a mano.
   */
  reemplaza: string | null;
  /** "HH:MM:SS". `null` SOLO al quitar: ahí no vale ninguna hora. */
  hora: string | null;
}

export interface PlanDelDia {
  cambios: CambioDelDia[];
  /**
   * Las casillas cuya hora no sirve. 🔴 Se DICEN y frenan el guardado: una hora
   * ilegible que se descarta en silencio es una corrección que nadie hizo y
   * nadie sabe que no se hizo.
   */
  invalidas: string[];
  /**
   * 🔴 El cambio de la ENTRADA AUTORIZADA del día (24-sep-2026): ponerla o
   * quitarla. Ausente o `null` = no se tocó. Cuenta como cambio para poder
   * guardar, y va en el mismo cuerpo que las horas.
   */
  entradaAutorizada?: CambioEntradaAutorizada | null;
}

/** El plan de las horas, con el cambio de la entrada autorizada encima. */
export function conEntradaAutorizada(
  plan: PlanDelDia,
  entrada: { cambio: CambioEntradaAutorizada | null; invalida: boolean },
): PlanDelDia {
  return {
    ...plan,
    invalidas: entrada.invalida ? [...plan.invalidas, "entrada"].sort() : plan.invalidas,
    entradaAutorizada: entrada.cambio,
  };
}

/**
 * Qué se va a escribir.
 *
 * 🔴 UNA CASILLA QUE NO CAMBIÓ NO PRODUCE NADA. Ni la que quedó igual, ni la
 * que sigue vacía. Se guarda exactamente lo que la persona escribió.
 *
 * @param casillas  las marcas que el día tiene hoy (`casillasDelDia`)
 * @param escrito   `clave → lo tecleado`. Lo que no esté, no se tocó.
 */
export function planDelDia(
  casillas: readonly CasillaDelDia[],
  escrito: ReadonlyMap<string, EscritoEnCasilla>,
): PlanDelDia {
  const cambios: CambioDelDia[] = [];
  const invalidas: string[] = [];
  const porClave = new Map(casillas.map((c) => [c.clave, c]));

  for (const [clave, e] of escrito) {
    const casilla = porClave.get(clave) ?? null;

    // ── QUITAR ────────────────────────────────────────────────────────────
    if (e.quitar) {
      // 🔴 Solo se quita una marcación que el RELOJ registró. Una agregada a
      // mano no se quita: se deshace la corrección que la creó.
      if (!casilla?.marcacionId) continue;
      cambios.push({
        clave,
        tipo: "quitar",
        marcacionId: casilla.marcacionId,
        reemplaza: casilla.correccionId,
        hora: null,
      });
      continue;
    }

    const crudo = String(e.hora ?? "").trim();

    // Una casilla vacía que sigue vacía: no pasó nada.
    if (crudo === "") {
      if (!casilla) continue;
      // Vaciar una casilla que tenía hora NO borra nada: quitar es otra cosa y
      // se pide explícitamente. Se deja como estaba.
      continue;
    }

    const hora = completarSegundos(crudo, casilla?.relojHora ?? null);
    if (!hora) {
      invalidas.push(clave);
      continue;
    }

    // ── AGREGAR — el reloj nunca registró esta marca ───────────────────────
    if (!casilla) {
      cambios.push({ clave, tipo: "agregar", marcacionId: null, reemplaza: null, hora });
      continue;
    }

    // 🔴 LA MISMA HORA NO ES UN CAMBIO. Volver a guardar lo que ya valía
    // dejaría una corrección nueva por nada, con su firma y su motivo.
    if (normalizarHora(casilla.hora) === hora) continue;

    cambios.push({
      clave,
      // Una marca agregada a mano que cambia de hora sigue siendo una marca que
      // el reloj no registró: se anula la anterior y se agrega la nueva.
      tipo: casilla.marcacionId ? "corregir" : "agregar",
      marcacionId: casilla.marcacionId,
      reemplaza: casilla.correccionId,
      hora,
    });
  }

  // Orden estable por clave: el servidor las aplica en un orden repetible y los
  // tests no dependen del orden en que se tecleó.
  cambios.sort((a, b) => a.clave.localeCompare(b.clave));
  invalidas.sort();
  return { cambios, invalidas };
}

// ─────────────────────────────────────────────────────────────────────────────
// SI SE PUEDE GUARDAR, Y QUÉ FALTA
//
// La MISMA función la usan la pantalla (para apagar el botón y decir qué falta)
// y el servidor (para rechazar). Dos reglas serían dos verdades.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que dice el botón. Se lee tal cual, sin adornos alrededor. */
export const GUARDAR_EL_DIA = "Guardar el día";

/** Lo que dice al pasar el cursor sobre una hora o un hueco del día. */
export const TITULO_EDITAR_EL_DIA = "Arreglar las marcas de este día";

/** El rótulo del campo del porqué, el mismo de siempre. */
export const PORQUE = "Por qué";

/**
 * Qué falta para poder guardar. `null` = se puede.
 *
 * ⚠️ El orden importa: primero lo que está MAL (una hora que no sirve), después
 * lo que FALTA (el porqué), y al final «no cambiaste nada» — que no es un error
 * sino que no hay nada que hacer.
 */
export function faltaParaGuardarElDia(plan: PlanDelDia, motivo: unknown): string | null {
  if (plan.invalidas.length > 0) {
    return plan.invalidas.length === 1
      ? "Hay una hora que no sirve"
      : `Hay ${plan.invalidas.length} horas que no sirven`;
  }
  if (plan.cambios.length === 0 && !plan.entradaAutorizada) return "Todavía no cambiaste nada";
  if (!(typeof motivo === "string" && motivo.trim().length > 0)) return "Falta: el porqué";
  return null;
}

/** «2 horas corregidas · 1 agregada · 1 quitada». `null` sin cambios. */
export function resumenDelPlan(plan: PlanDelDia): string | null {
  const cuenta = { corregir: 0, agregar: 0, quitar: 0 };
  for (const c of plan.cambios) cuenta[c.tipo] += 1;
  const partes: string[] = [];
  if (cuenta.corregir > 0) {
    partes.push(`${cuenta.corregir} ${cuenta.corregir === 1 ? "hora corregida" : "horas corregidas"}`);
  }
  if (cuenta.agregar > 0) {
    partes.push(`${cuenta.agregar} ${cuenta.agregar === 1 ? "agregada" : "agregadas"}`);
  }
  if (cuenta.quitar > 0) {
    partes.push(`${cuenta.quitar} ${cuenta.quitar === 1 ? "quitada" : "quitadas"}`);
  }
  const entrada = resumenCambioEntrada(plan.entradaAutorizada ?? null);
  if (entrada) partes.push(entrada);
  return partes.length ? partes.join(" · ") : null;
}

/** Lo que se le dice a la persona cuando el día se guardó. */
export function textoGuardado(plan: PlanDelDia): string {
  const r = resumenDelPlan(plan);
  return r ? `Listo, guardado — ${r}` : "Listo, guardado";
}
