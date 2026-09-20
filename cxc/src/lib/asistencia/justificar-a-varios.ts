/* ─────────────────────────────────────────────────────────────────────────────
 * JUSTIFICAR A VARIOS DESDE EL REPORTE — el motor, PURO.
 *
 * Sin base, sin red, sin `new Date()`.
 *
 * ── 🩸 DE DÓNDE SALIÓ (19-sep-2026) ─────────────────────────────────────────
 *
 * El día de lluvia del **17-ago-2026** son **13 justificaciones cargadas una por
 * una con la misma nota** — 13 de las 29 de toda la historia del módulo. Cada
 * una pedía abrir la ficha de esa persona, elegir el motivo, escribir la nota y
 * guardar. Trece veces lo mismo.
 *
 * Daniel eligió **seleccionar varias filas de un día en el Reporte** y
 * justificarlas de una vez, en vez de un formulario con un selector de personas.
 *
 * ── 🔴 LO QUE NO CAMBIA ─────────────────────────────────────────────────────
 *
 *   · **Justificar significa que se paga.** La lista de motivos sigue siendo
 *     CERRADA (`motivos.ts`): no nace ninguno, y a Multifashion se le sigue sin
 *     ofrecer el día libre de la empresa.
 *   · **El guardado usa la MISMA ruta y la MISMA validación de hoy**
 *     (`POST /api/asistencia/justificaciones`), una petición por persona. No hay
 *     una ruta «en lote» con reglas propias: eso sería una segunda verdad sobre
 *     qué se puede justificar y quién puede hacerlo.
 *   · **Lo que no se guarda SE DICE, con nombre.** Un lote que falla a medias en
 *     silencio deja gente sin justificar y a nadie enterado.
 * ────────────────────────────────────────────────────────────────────────── */

import { motivosParaElegir } from "./motivos";

/**
 * Los motivos que se pueden ofrecer cuando hay VARIAS personas seleccionadas.
 *
 * 🔴 ES LA INTERSECCIÓN, nunca la unión: se ofrece solo lo que vale para TODAS.
 * Con alguien de Multifashion en la selección, «Día libre de la empresa» no se
 * ofrece — porque para esa persona el servidor lo rechazaría (400) y el lote
 * quedaría a medias. Ofrecer algo que se sabe que va a fallar es peor que no
 * ofrecerlo.
 *
 * Sin ninguna empresa conocida se ofrecen todos, igual que con una persona
 * sola: el servidor lo vuelve a preguntar con la ficha en la mano.
 */
export function motivosParaVarios(
  empresas: readonly (string | null | undefined)[],
): readonly string[] {
  if (empresas.length === 0) return motivosParaElegir(null);
  let comunes = [...motivosParaElegir(empresas[0])];
  for (const e of empresas.slice(1)) {
    const suyos = new Set(motivosParaElegir(e));
    comunes = comunes.filter((m) => suyos.has(m));
  }
  return comunes;
}

/** «3 colaboradores seleccionados». El singular es solo para el 1 exacto. */
export function textoDeLaSeleccion(cuantos: number): string {
  const n = Math.max(0, Math.trunc(cuantos));
  return n === 1 ? "1 colaborador seleccionado" : `${n} colaboradores seleccionados`;
}

/** Lo que dice el botón que abre la ventana. */
export const JUSTIFICAR_A_VARIOS = "Justificar a varios";

/** Lo que dice el botón que suelta la selección. */
export const QUITAR_LA_SELECCION = "Quitar la selección";

/** ¿Hay algo que justificar en lote? Con uno solo también vale: es el mismo camino. */
export function hayAQuienJustificar(cuantos: number): boolean {
  return Math.max(0, Math.trunc(cuantos)) > 0;
}

/** Cómo le fue a cada persona del lote. */
export interface FalloDelLote {
  /** El nombre con el que se le habla a quien mira, nunca el código pelado. */
  etiqueta: string;
  error: string;
}

/**
 * Lo que se le dice al terminar el lote.
 *
 * 🔴 LO QUE NO SE GUARDÓ SE NOMBRA. Un «Listo, guardado» después de que dos de
 * trece fallaron es la peor respuesta posible: nadie vuelve a mirar.
 */
export function resumenDelLote(guardados: number, fallos: readonly FalloDelLote[]): {
  texto: string;
  tipo: "success" | "error";
} {
  const ok = Math.max(0, Math.trunc(guardados));
  if (fallos.length === 0) {
    return {
      texto: ok === 1 ? "Listo, 1 justificado" : `Listo, ${ok} justificados`,
      tipo: "success",
    };
  }
  const nombres = fallos.map((f) => f.etiqueta).join(" · ");
  if (ok === 0) {
    return { texto: `No se guardó ninguno. ${fallos[0].error}`, tipo: "error" };
  }
  return {
    texto: `Se guardaron ${ok} de ${ok + fallos.length}. Faltó: ${nombres}.`,
    tipo: "error",
  };
}
