// ─────────────────────────────────────────────────────────────────────────────
// Revisión 110 (14-nov-2026) — Asistencia, Marcación, Préstamos y Reclamos.
// Solo PANTALLA: ningún cálculo, cierre ni dato guardado cambia. Cada número de
// la revisión con su interruptor; `false` = la pantalla de antes.
// ─────────────────────────────────────────────────────────────────────────────

import { hm } from "@/lib/asistencia/aprobaciones-vistas";

/** 73 · Celular: se entra directo a Asistencia; los números de la portada van en el selector del título. */
export const ASIS_SIN_PORTADA_R110 = true;
/** 74 · «36 colaboradores · 118 días · 586:52 h» en la portada y en Aprobaciones. */
export const ASIS_PENDIENTES_CON_UNIDAD_R110 = true;
/** 75 · Celular › Asistencia: «Actualizado ↻» a la derecha de la empresa, no en su fila. */
export const ASIS_ACTUALIZADO_JUNTO_A_EMPRESA_R110 = true;
/** 76 · Celular › Asistencia: horas como «5:48 h», sin segundos (igual que la computadora). */
export const ASIS_HORAS_SIN_SEGUNDOS_R110 = true;
/** 77 · Celular › Asistencia: la casilla recibe el dedo en 44 × 44. */
export const ASIS_CASILLA_44_R110 = true;
/** 78 · Computadora › Asistencia: «Código 67 · sin ficha · Crear ficha ›». */
export const ASIS_SIN_FICHA_R110 = true;
/** 79 · Celular: la pastilla dice «Todas las empresas ▾» y, si no cabe, baja de línea. */
export const ASIS_PASTILLA_EMPRESA_R110 = true;
/** 81 · Celular › Planilla: «15 sin decidir» y debajo «121:36 h». */
export const ASIS_PENDIENTES_DOS_RENGLONES_R110 = true;
/** 86 · Computadora › Marcación: el botón debajo de las marcas y del mismo ancho. */
export const MARCACION_BOTON_PEGADO_R110 = true;
/**
 * 86 · En la computadora el cajón del botón deja de ir fijo abajo: va debajo de
 * las marcas, del ancho del cuadro. Se pone en el CONTENEDOR (apunta al cajón
 * por `data-boton-fijo`): el cajón conserva sus clases de siempre.
 */
export const CAJON_PEGADO_EN_COMPUTADORA_R110 =
  "sm:[&_[data-boton-fijo]]:static sm:[&_[data-boton-fijo]]:z-auto sm:[&_[data-boton-fijo]]:bg-transparent sm:[&_[data-boton-fijo]]:px-0 sm:[&_[data-boton-fijo]]:pt-4 sm:[&_[data-boton-fijo]]:!pb-0";
/** 96 · Celular › ficha de préstamo: «‹ Préstamos» en el título, solo «Editar» a la derecha. */
export const PRESTAMOS_VOLVER_EN_TITULO_R110 = true;
/** 97 · Celular › ficha de préstamo: cuota y prestado en una línea cada uno. */
export const PRESTAMOS_LINEAS_ENTERAS_R110 = true;
/** 106 · Registrar abono desde la pestaña: la fecha propuesta es hoy, como en la ficha. */
export const PRESTAMOS_ABONO_HOY_R110 = true;
/** 107 · Nuevo préstamo: los nombres del selector con mayúscula inicial (solo se dibuja así). */
export const PRESTAMOS_NOMBRES_CAPITALIZADOS_R110 = true;
/** 83 · Celular › detalle del reclamo: «5 facturas · fecha · marca · días»; los números al tocar. */
export const RECLAMOS_FACTURAS_PLEGADAS_R110 = true;
/** 84 · Computadora › una empresa: la columna «Reclamado» solo con la fecha. */
export const RECLAMOS_RECLAMADO_SOLO_FECHA_R110 = true;
/** 85 · Computadora › una empresa: «Buscar» a la izquierda llenando el ancho, botones a la derecha. */
export const RECLAMOS_BUSCADOR_ANCHO_R110 = true;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** 74 · «36 colaboradores · 118 días · 586:52 h». */
export function pendientesConUnidad(colaboradores: number, dias: number, minutos: number): string {
  return `${plural(colaboradores, "colaborador", "colaboradores")} · ${plural(dias, "día", "días")} · ${hm(minutos)} h`;
}

/** 74 · Lo que va al lado del número grande de Aprobaciones: «colaboradores · 118 días · 586:52 h». */
export function colaColaboradores(colaboradores: number, dias: number, minutos: number): string {
  return pendientesConUnidad(colaboradores, dias, minutos).replace(/^\d+ /, "");
}

/** 79 · El texto de la pastilla: «Todas» dice qué filtra. */
export function textoPastillaEmpresa(etiqueta: string): string {
  return etiqueta === "Todas" ? "Todas las empresas" : etiqueta;
}

/** 81 · «15 con horas extra sin decidir · 121:36 h» → ["15 sin decidir", "121:36 h"]. Otro texto, igual. */
export function pendientesEnDosRenglones(texto: string): [string, string] | null {
  const m = /^(\d+) con horas extra sin decidir · (.+)$/.exec(texto.trim());
  return m ? [`${m[1]} sin decidir`, m[2]] : null;
}
