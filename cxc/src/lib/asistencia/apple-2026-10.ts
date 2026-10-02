/* ─────────────────────────────────────────────────────────────────────────────
 * ASISTENCIA Y PLANILLA, ESTILO APPLE (1-oct-2026). PURO: sin base ni red.
 *
 * Una sola idea: **el módulo abre en el trabajo y las pestañas van en el orden
 * del trabajo** (docs/diseno.md, reglas 1 y 2).
 *
 * ── 🩸 LO QUE SE MIDIÓ (1-oct-2026, contra producción, solo lectura) ─────────
 *
 *   · Correcciones de marcas: **529**, 527 de Contabilidad, todas en la pestaña
 *     Asistencia («no marcó salida», «no marcó salida a almuerzo»…).
 *   · Horas extra decididas en Aprobaciones: **1.000**.
 *   · Planillas cerradas: 9. Justificaciones: 72.
 *   · Fichas de colaborador modificadas en septiembre: 41, casi todas del 11 al
 *     17-sep (la carga inicial); 3 en la última semana.
 *   · Y el módulo ABRE en Colaboradores: una lista de 42 fichas que casi no se
 *     toca, con Asistencia en el segundo lugar.
 *
 * ── 🔴 LA REGLA ─────────────────────────────────────────────────────────────
 *
 *   1. Sin `?tab=`, abre en **Asistencia** (era Colaboradores).
 *   2. Orden: Asistencia · Aprobaciones · Planilla · Préstamos · Colaboradores ·
 *      Marcaciones. Es el orden de la quincena: corregir, aprobar, pagar.
 *   3. 🔑 No se quita ninguna pestaña, no cambia quién ve qué (`vePestana`), ni
 *      una ruta, ni un cálculo. Los enlaces `?tab=` siguen abriendo lo mismo.
 *
 * `false` = la pantalla de hoy, al pie de la letra.
 * Candado: `src/__tests__/asistencia/apple-2026-10.test.ts`.
 * ──────────────────────────────────────────────────────────────────────────── */

import type { ClavePestana, Pestana } from "@/lib/asistencia/persona-en-el-centro";
import type { DiaAprobacion } from "@/lib/asistencia/aprobaciones";
import { capitalizarNombre, esGritado } from "@/lib/nombre-en-pantalla";

export const ASISTENCIA_APPLE_2026_10 = false;

/** El orden de la quincena. Lo que no esté aquí queda al final, en su orden. */
export const ORDEN_DEL_TRABAJO: readonly ClavePestana[] = [
  "asistencia",
  "aprobaciones",
  "planilla",
  "prestamos",
  "colaboradores",
  "marcaciones",
];

/** Reordena las pestañas; con el interruptor apagado devuelve la MISMA lista. */
export function pestanasEnOrdenDelTrabajo(pestanas: readonly Pestana[], prendido: boolean): readonly Pestana[] {
  if (!prendido) return pestanas;
  const lugar = (k: ClavePestana) => {
    const i = ORDEN_DEL_TRABAJO.indexOf(k);
    return i === -1 ? ORDEN_DEL_TRABAJO.length : i;
  };
  return pestanas
    .map((p, i) => [p, i] as const)
    .sort(([a, ia], [b, ib]) => lugar(a[0]) - lugar(b[0]) || ia - ib)
    .map(([p]) => p);
}

/** Con qué pestaña abre. Solo cambia «colaboradores» por «asistencia», y solo prendido. */
export function pestanaAlAbrir(deHoy: ClavePestana, prendido: boolean): ClavePestana {
  return prendido && deHoy === "colaboradores" ? "asistencia" : deHoy;
}

/* ── 🔴 EN EL CELULAR, LA SECCIÓN ES EL TÍTULO Y SE CAMBIA DESDE AHÍ (2-oct-2026) ──
 *
 * Daniel: «mira cómo se ven las pestañas en el celular, cómo cambio cuando
 * estoy por ejemplo dentro de asistencia, o colaboradores». 🩸 Medido a 390 px:
 * la tira de seis pestañas comparte la fila con la empresa, ⚙ y «?», le quedan
 * ~110 px y se ve UNA sola pestaña — la primera—, aunque estés en Planilla. No
 * se sabe dónde estás y para cambiar hay que arrastrar a ciegas.
 *
 * Se eligió UNA forma: el nombre de la sección, grande, ES el selector («Planilla
 * ▾»), con la lista nativa del teléfono. Dice dónde estás, cambia en dos toques
 * sin volver atrás, y la lista del sistema ya es grande y tocable. Elegir sigue
 * escribiendo `?tab=` con `push`: «una pestaña es una pantalla» y el Atrás
 * devuelve la portada. En la computadora la tira no cambia: ahí cabe entera.
 */
export function selectorDeSeccionEnCelular(celular: boolean, prendido: boolean = ASISTENCIA_APPLE_2026_10): boolean {
  return prendido && celular;
}

/* ── 🔴 NOMBRES COMO SE ESCRIBEN: «Daniel Levy», NUNCA «DANIEL LEVY» (2-oct-2026) ──
 *
 * docs/diseno.md › «Detalles aprendidos». 🩸 Medido en pantalla el 2-oct-2026:
 * Aprobaciones (las dos vistas y su Excel), ⚙ Horarios y el Excel/PDF de
 * Asistencia salían en MAYÚSCULAS, mientras Planilla, Préstamos y la ficha ya
 * los capitalizaban. Solo cambia lo que se MUESTRA: el dato de la base, la llave
 * (`codigo`) y lo que se envía al servidor no se tocan.
 *
 * 🔑 Solo se tocan los nombres GRITADOS (`esGritado`): uno ya bien escrito
 * («Luz López») se deja tal cual. Un CÓDIGO que se muestra porque falta el
 * nombre («V-EG») no pasa por aquí: lo decide quien llama, que sabe si hay
 * nombre. El capitalizador es UNO solo y no inventa acentos.
 */
export function nombreDePersona(nombre: string, prendido: boolean = ASISTENCIA_APPLE_2026_10): string {
  return prendido && esGritado(nombre) ? capitalizarNombre(nombre) : nombre;
}

/**
 * Los días de Aprobaciones con el nombre de cada colaborador como se muestra.
 * Solo cambia la `etiqueta` de la gente, y no cuando la etiqueta es el código
 * (no hay nombre). Apagado devuelve la MISMA lista.
 */
export function aprobacionesConNombres(dias: DiaAprobacion[], prendido: boolean = ASISTENCIA_APPLE_2026_10): DiaAprobacion[] {
  if (!prendido) return dias;
  return dias.map((d) => ({
    ...d,
    gente: d.gente.map((g) => (g.etiqueta === g.codigo ? g : { ...g, etiqueta: nombreDePersona(g.etiqueta, true) })),
  }));
}
