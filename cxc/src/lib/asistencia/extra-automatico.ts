// ─────────────────────────────────────────────────────────────────────────────
// LOS MINUTOS DE HORA EXTRA QUE NO HAY QUE APROBAR. Por EMPRESA.
//
// Daniel, textual: *«ya by default allá trabajan hasta las 7pm, así que siempre
// sin aprobación ganan 30 mins de horas extras»*.
//
// La tienda de ACS cierra a las 7 p.m., y eso deja 30 minutos por encima de la
// jornada TODOS los días. Pedirle a Daniel que apruebe los mismos 30 minutos de
// cada persona cada día es pedirle que firme lo que ya decidió al poner el
// horario de la tienda — y una aprobación que siempre se da deja de ser una
// decisión y se vuelve un trámite que se aprueba sin mirar.
//
// 🔴 LO QUE PASE DE AHÍ SÍ SE APRUEBA. Es el punto: los 30 son el horario; el
// minuto 31 es una decisión, y sigue el camino de siempre (Aprobaciones, el
// aviso ámbar y el freno del cierre).
//
// 🔴 ES POR EMPRESA, NO POR PERSONA. Sale del horario de la TIENDA, no de un
// permiso que se le dé a alguien. Una excepción por persona sería un permiso
// permanente escondido en una ficha.
//
// ⚠️ CON 0 MINUTOS TODO SE COMPORTA EXACTAMENTE COMO ANTES, y las otras tres
// empresas están en 0: este archivo no puede mover un centavo de Boston,
// Vistana ni Fashion Wear. Hay candado que lo exige.
//
// ⚠️ NO VIVE EN `asistencia_reglas`: esa tabla es un SINGLETON sin `empresa_key`
// —sus números valen para el grupo entero— y meter ahí un valor que cambia por
// empresa obligaría a una migración y a un concepto nuevo («reglas por
// empresa») para un dato que hoy tiene un solo caso. Vive al lado de la lista
// única de empresas, que es de donde sale la pregunta.
// ─────────────────────────────────────────────────────────────────────────────

import { EMPRESAS_ASISTENCIA } from "./config";

/**
 * Minutos de hora extra por DÍA que se pagan sin aprobación, por empresa.
 *
 * 🔑 El `Record` sobre `EMPRESAS_ASISTENCIA` es el candado: la empresa que entre
 * mañana NO COMPILA hasta que alguien decida su número. Es la misma decisión que
 * no puede pasar en silencio.
 */
export const EXTRA_AUTOMATICO_POR_EMPRESA: Readonly<
  Record<(typeof EMPRESAS_ASISTENCIA)[number], number>
> = Object.freeze({
  confecciones_boston: 0,
  vistana: 0,
  fashion_wear: 0,
  // 🔴 La tienda cierra a las 7 p.m. Ver la nota de arriba.
  american_classic: 30,
});

/**
 * Cuántos minutos de extra por día se le pagan sin aprobación a alguien de esta
 * empresa. `0` para todo lo demás —incluida una empresa desconocida o `null`—,
 * que es el comportamiento de siempre.
 */
export function minutosExtraAutomaticos(empresa: string | null | undefined): number {
  const k = String(empresa ?? "").trim();
  const n = (EXTRA_AUTOMATICO_POR_EMPRESA as Record<string, number>)[k];
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Lo que se dice en pantalla de esos minutos. `null` cuando no hubo ninguno: un
 * renglón que dice «0 min automáticos» es ruido.
 *
 * 🔑 SE DICE DE DÓNDE SALEN. Sin esta frase, ver horas extra pagadas que nadie
 * aprobó se lee como un error del sistema — y ese es exactamente el susto que
 * este texto existe para evitar.
 */
export function textoExtraAutomatico(minutos: number, empresaEtiqueta?: string | null): string | null {
  const m = Math.round(Number(minutos) || 0);
  if (m <= 0) return null;
  const donde = String(empresaEtiqueta ?? "").trim();
  return `${m} min fijos${donde ? ` de ${donde}` : ""}`;
}
