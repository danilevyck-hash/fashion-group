// ─────────────────────────────────────────────────────────────────────────────
// EL ALCANCE DE DAVID EN ASISTENCIA — módulo PURO (23-sep-2026).
//
// Daniel, textual: *«Asistencia que pueda ver todo como yo»*. David ve el
// módulo COMPLETO —las mismas pestañas que el admin— y el SERVIDOR le recorta
// todo a Confecciones Boston: en cada ruta, lo que se lista se filtra por la
// empresa de la FICHA (`asistencia_personas.empresa`) y lo que se escribe se
// rechaza con 403 si la persona no es de Boston.
//
// 🔑 ES LA MISMA IDEA QUE `leerAlcanceAprobador` para las horas extra, dicha
// para TODO el módulo: «las suyas» son las de la lista, y para David la lista
// es Boston. No se lee ninguna tabla para saberlo: David ES Boston.
//
// 🔴 `null` = SIN RECORTE. Para admin, contabilidad y secretaria nada de esto
// aplica: las rutas se comportan exactamente como hasta hoy.
//
// ⚠️ Un código SIN FICHA no tiene empresa. Para un rol acotado no entra: no se
// puede afirmar que es de Boston, y ante la duda no se muestra ni se escribe.
// ─────────────────────────────────────────────────────────────────────────────

import { EMPRESA_BOSTON, esGerenteBoston } from "@/lib/boston/rol";
import { VENTAS_BOSTON } from "@/lib/boston/ventas-boston";

/** Las empresas que este rol puede mirar en Asistencia. `null` = todas. */
export type AlcanceEmpresas = readonly string[] | null;

/** El alcance de un rol. Solo David está acotado, y solo con el interruptor prendido. */
export function alcanceDelRol(rol: string | null | undefined, interruptor: boolean = VENTAS_BOSTON): AlcanceEmpresas {
  return interruptor && esGerenteBoston(rol) ? [EMPRESA_BOSTON] : null;
}

/** ¿Esta empresa entra en el alcance? Sin empresa (`null`) NO entra a un alcance acotado. */
export function empresaEnAlcance(alcance: AlcanceEmpresas, empresa: string | null | undefined): boolean {
  if (alcance === null) return true;
  return !!empresa && alcance.includes(empresa);
}

/** Lo que se escribe/lee de una empresa que no es la suya. */
export const MENSAJE_FUERA_DE_ALCANCE = "Ese colaborador no es de Confecciones Boston.";

/** Y de lo que es de TODO el sistema (feriados, reglas): no es de ninguna empresa. */
export const MENSAJE_ES_DEL_GRUPO = "Eso lo cambia contabilidad o un administrador: vale para todas las empresas.";

/**
 * Los códigos que SÍ entran, a partir de las fichas. `null` = sin recorte.
 * Una ficha sin empresa no entra a un alcance acotado.
 */
export function codigosPermitidos(
  fichas: readonly { empleado_codigo: string | number | null; empresa: string | null }[],
  alcance: AlcanceEmpresas,
): Set<string> | null {
  if (alcance === null) return null;
  const set = new Set<string>();
  for (const f of fichas) {
    const codigo = String(f.empleado_codigo ?? "").trim();
    if (codigo && empresaEnAlcance(alcance, f.empresa)) set.add(codigo);
  }
  return set;
}

/** ¿Este código está permitido? Sin recorte, siempre. */
export function codigoPermitido(permitidos: Set<string> | null, codigo: string | null | undefined): boolean {
  if (permitidos === null) return true;
  return !!codigo && permitidos.has(String(codigo).trim());
}

/** Los códigos de la lista que quedan AFUERA. Vacío = todos entran. */
export function codigosFuera(permitidos: Set<string> | null, codigos: readonly (string | null | undefined)[]): string[] {
  if (permitidos === null) return [];
  return [...new Set(codigos.map((c) => String(c ?? "").trim()))].filter((c) => !permitidos.has(c));
}

/** Filtra una lista por el código de cada fila. Sin recorte, la misma lista. */
export function soloPermitidos<T>(
  filas: readonly T[],
  codigoDe: (fila: T) => string | null | undefined,
  permitidos: Set<string> | null,
): T[] {
  if (permitidos === null) return [...filas];
  return filas.filter((f) => codigoPermitido(permitidos, codigoDe(f)));
}

/**
 * 🔴 La empresa que se PIDE, forzada al alcance. Con alcance de UNA empresa se
 * fuerza ésa, pase lo que pase en la URL (mismo criterio que la planilla:
 * «se fuerza, no se valida», para que un marcador viejo no deje la pantalla en
 * blanco). Sin recorte, lo pedido tal cual.
 */
export function empresaForzada(alcance: AlcanceEmpresas, pedida: string | null): string | null {
  if (alcance === null) return pedida;
  if (alcance.length === 1) return alcance[0];
  return pedida && alcance.includes(pedida) ? pedida : null;
}
