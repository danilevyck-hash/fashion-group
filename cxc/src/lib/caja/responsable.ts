/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — LA RESPONSABLE ES DEL PERÍODO, Y SE RECONOCE POR SU CÓDIGO
 * (7-sep-2026).
 *
 * Daniel, textual: *«no debería de haber responsable, ya la responsable es
 * Angela la dueña del período… no deberían de haber 2 nombres en un gasto, solo
 * uno»* y *«si en el futuro ella no está, solo hay que poner el usuario
 * responsable ahora del período, amarrándolo con código de colaborador»*.
 *
 * 🩸 Lo que había: cada gasto guardaba el NOMBRE como texto al lado de un
 * identificador. Los 77 apuntan a la misma persona y aun así el texto tiene
 * TRES formas — «Angela Garcia» 59 · «Angela garcia» 17 · «Angela garciia» 1 —
 * y el papel impreso las listaba como tres personas distintas. Un dato guardado
 * dos veces solo puede contradecirse.
 *
 * 🔴 LA REGLA:
 *   · el GASTO no lleva responsable;
 *   · el PERÍODO lleva a la suya por `empleado_codigo` de Asistencia
 *     (Angela = 7), que es la identidad de un colaborador en toda la casa;
 *   · el NOMBRE no se guarda: se LEE de Asistencia por ese código.
 *
 * Módulo PURO: sin I/O, sin React.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface PersonaDeAsistencia {
  empleado_codigo: string;
  nombre: string;
}

export interface PeriodoConResponsable {
  responsable_empleado_codigo?: string | null;
}

/** Normaliza un código de colaborador para comparar: sin bordes, en mayúsculas. */
export function codigoNormalizado(codigo: string | null | undefined): string {
  return String(codigo ?? "").trim().toUpperCase();
}

/**
 * Cómo se escribe un nombre en pantalla: Asistencia los guarda en MAYÚSCULAS
 * («ANGELA GARCIA») y un reporte impreso no grita. Solo cambia cómo se MUESTRA;
 * la identidad sigue siendo el código.
 */
export function nombreEnPantalla(nombre: string | null | undefined): string {
  const limpio = String(nombre ?? "").trim().replace(/\s+/g, " ");
  if (!limpio) return "";
  // Si quien lo escribió ya usó minúsculas, se respeta tal cual.
  if (limpio !== limpio.toUpperCase()) return limpio;
  return limpio
    .toLowerCase()
    .split(" ")
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(" ");
}

/**
 * Quién es la responsable de un período: su código y su nombre leído de
 * Asistencia. Devuelve `null` cuando el período todavía no tiene código puesto
 * — los 3 períodos de hoy nacieron antes de que existiera la columna, y sin ella
 * la pantalla se comporta como siempre en vez de mentir un nombre.
 *
 * Un código que no está en Asistencia devuelve el código sin nombre: se dice lo
 * que se sabe, nunca se inventa a quién pertenece.
 */
export function responsableDelPeriodo(
  periodo: PeriodoConResponsable | null | undefined,
  personas: PersonaDeAsistencia[],
): { codigo: string; nombre: string } | null {
  const codigo = codigoNormalizado(periodo?.responsable_empleado_codigo);
  if (!codigo) return null;
  const persona = personas.find((p) => codigoNormalizado(p.empleado_codigo) === codigo);
  return { codigo, nombre: persona ? nombreEnPantalla(persona.nombre) : "" };
}

/** Cómo se rotula en el encabezado y en el papel. Sin responsable, no se dice nada. */
export function etiquetaResponsable(
  responsable: { codigo: string; nombre: string } | null,
): string | null {
  if (!responsable) return null;
  return responsable.nombre || `Colaborador ${responsable.codigo}`;
}
