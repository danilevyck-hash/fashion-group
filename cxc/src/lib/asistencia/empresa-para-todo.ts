// ─────────────────────────────────────────────────────────────────────────────
// UN SELECTOR DE EMPRESA PARA TODO EL MÓDULO DE ASISTENCIA (10-sep-2026). Módulo PURO.
//
// Daniel, textual: *«que reporte se pueda filtrar también por empresa y sacar un
// excel filtrado para revisar tardanzas, ausencia, etc. Aprobaciones también se
// debería de poder ver por empresa, todo por empresa no?»* → sí: UN selector
// arriba de las pestañas («Todas» + las cuatro), en la URL (`?empresa=`,
// `replace`) y recordado por usuario (`fg_last_asistencia_empresa`).
//
// 🔴 ES UN FILTRO DE LECTURA. Nada de lo que se guarda cambia. Lo que sí: la
// ruta de Aprobaciones con `empresa=` NO aprueba nada de otra empresa.
// 🔴 Las opciones se DERIVAN del rol: David (`gerente_boston`) solo ve Boston,
// y sin «Todas» (con una sola empresa, «Todas» no ofrece nada).
// 🔴 Planilla lo REUSA como su selector, pero ahí «Todas» no vale: pide elegir.
// ─────────────────────────────────────────────────────────────────────────────
import { EMPRESAS_ASISTENCIA } from "./config";
import { EMPRESA_BOSTON, esGerenteBoston } from "@/lib/boston/rol";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";

export const PARAM_EMPRESA = "empresa";
export const TODAS = "todas";
/** La llave de `useLastUsed` (queda como `fg_last_asistencia_empresa`). */
export const RECORDAR_EMPRESA = "asistencia_empresa";

/**
 * El alcance que el SERVIDOR le reconoce a esta persona (`GET /api/asistencia/alcance`):
 * `null` = las cuatro; una lista = exactamente ésas. `undefined` = todavía no
 * se preguntó (se ofrece lo del rol, como siempre).
 */
export type AlcanceDeEmpresas = readonly string[] | null | undefined;

/**
 * Las empresas que este rol puede mirar. Derivado, nunca escrito a mano.
 *
 * 🔴 CON EL ALCANCE DEL SERVIDOR, SOLO LAS SUYAS (11-sep-2026). 🩸 A `bodega`
 * (Julio) el selector le ofrecía las 4 y el servidor le recortaba a fashion_wear
 * + vistana (`asistencia_aprobador_empresa`): eligiendo Boston o Multifashion
 * la pestaña quedaba vacía sin decir por qué. Las opciones salían solo de
 * `esGerenteBoston`, no del alcance real. Ahora el alcance lo dice la MISMA
 * lectura que recorta en el servidor, y acá solo se intersecta.
 */
export function empresasQueVe(rol: string | null | undefined, alcance?: AlcanceDeEmpresas): readonly string[] {
  if (esGerenteBoston(rol)) return [EMPRESA_BOSTON];
  if (alcance == null) return EMPRESAS_ASISTENCIA;
  const mias = EMPRESAS_ASISTENCIA.filter((k) => alcance.includes(k));
  // Un alcance que no cruza con ninguna (tabla vacía para este usuario, o
  // basura) no deja el selector sin opciones: se ofrece lo del rol y el
  // servidor sigue recortando, como hasta hoy.
  return mias.length ? mias : EMPRESAS_ASISTENCIA;
}

export interface OpcionEmpresa { clave: string; etiqueta: string }

/** «Todas» + las suyas. Con UNA sola, solo ésa. */
export function opcionesDeEmpresa(rol: string | null | undefined, alcance?: AlcanceDeEmpresas): OpcionEmpresa[] {
  const mias = empresasQueVe(rol, alcance);
  const propias = mias.map((k) => ({ clave: k, etiqueta: nombreCortoEmpresa(k) }));
  return mias.length > 1 ? [{ clave: TODAS, etiqueta: "Todas" }, ...propias] : propias;
}

export const esTodas = (e: string | null | undefined): boolean =>
  !e || String(e).trim() === "" || String(e).trim() === TODAS;

/**
 * Lo que de verdad se filtra, a partir de lo que trae la URL o lo recordado.
 * Basura o una empresa que el rol no ve → la primera opción (Todas, o la única).
 */
export function empresaElegida(cruda: string | null | undefined, rol: string | null | undefined, alcance?: AlcanceDeEmpresas): string {
  const opciones = opcionesDeEmpresa(rol, alcance);
  const k = String(cruda ?? "").trim();
  return opciones.some((o) => o.clave === k) ? k : opciones[0].clave;
}

/** `null` con «Todas»: es lo que se le pasa a una ruta como `empresa=`. */
export function empresaParaPedir(e: string | null | undefined): string | null {
  return esTodas(e) ? null : String(e).trim();
}

/** Filtra lo que trae `empresa`. Con «Todas», todo — incluido quien no tiene empresa. */
export function filtrarPorEmpresa<T extends { empresa?: string | null }>(lista: readonly T[], e: string | null | undefined): T[] {
  if (esTodas(e)) return [...lista];
  return lista.filter((x) => x.empresa === e);
}

/** «Todas» o el nombre corto, para la pantalla y el nombre del archivo. */
export function etiquetaDeFiltro(e: string | null | undefined): string {
  return esTodas(e) ? "Todas" : nombreCortoEmpresa(String(e));
}

const limpio = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** `Asistencia-Boston-2026-09-01_2026-09-15.xlsx`. La empresa (o «Todas») va en el nombre. */
export function nombreArchivoPorEmpresa(base: string, e: string | null | undefined, desde: string, hasta: string, ext: string): string {
  return `${limpio(base)}-${limpio(etiquetaDeFiltro(e))}-${desde}_${hasta}.${ext}`;
}
