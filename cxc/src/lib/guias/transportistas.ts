// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS — LOS TRANSPORTISTAS QUE OFRECE EL DESPLEGABLE (módulo PURO).
//
// Daniel, textual (9-sep-2026): *«Ponme opción en configuración de guía para
// poder agregar un transportista nuevo.»*
//
// 🩸 Los SEIS de la lista se sembraron el 26-may-2026 y desde entonces nadie
// pudo agregar uno: no había pantalla, ni botón, ni ruta de alta. Medido sobre
// las 227 guías vivas: RedNblue 53 · Boston 30 · Edwin 29 · Mojica 17 ·
// Transporte Sol 16 · Sanjur 14. Y por no poder agregarlos, se escribieron A
// MANO en el campo de texto de la guía, saltándose la lista: «NUÑEZ GLOBAL
// SOLUTIONS», «CITY MODA», «SPORTING SHOES», «LUTY LUI» y uno que dice «no».
// Es el mismo cuento del destino «hola» que vivía en un solo navegador.
//
// 🔴 Ninguno de esos cinco entra a la lista: cuatro son nombres de CLIENTE y el
// quinto dice «no». Y sus guías viejas no se tocan.
//
// ⚠️ Las guías con el transportista VACÍO son las de **Entrega directa**
// (nuestro propio camión). Están bien así: no les falta nada.
//
// Este módulo solo DECIDE. Quién toca la base es `transportistas-server.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { claveDestino } from "@/lib/guias/destinos-clientes";

/**
 * Quién puede AGREGAR un transportista: **todos los que arman guías**.
 * Daniel, textual, al preguntarle quién: *«Todos»*. Por eso bodega está
 * adentro — el ＋ vive al lado del desplegable, en la guía misma, y quien la
 * está armando es quien se entera de que el transportista nuevo no está.
 *
 * ⚠️ QUITAR es de admin y secretaria, en Guías › Configuración
 * (`CONFIG_GUIAS_ROLES`): agregar es un atajo, quitar es una decisión que le
 * cambia la lista a todo el equipo. Misma repartición que la lista de destinos.
 */
export const TRANSPORTISTAS_ROLES_ESCRITURA = ["admin", "secretaria", "bodega"] as const;

/** Quién LEE la lista: todo el que puede abrir Guías. */
export const TRANSPORTISTAS_ROLES_LECTURA = ["admin", "secretaria", "bodega", "vendedor"] as const;

/** Tope del nombre (el más largo de hoy, «Transporte Sol», tiene 14). */
export const MAX_LARGO_TRANSPORTISTA = 80;

/** Una fila de `transportistas`, como la lee el desplegable de la guía. */
export interface Transportista {
  id: string;
  nombre: string;
  activo: boolean;
}

/** Lo mismo, con cuántas guías lleva — para Guías › Configuración. */
export interface TransportistaConfigurado extends Transportista {
  /** 🔴 El dato que dice si se puede quitar sin dudar. */
  guias: number;
}

/**
 * ¿Estos dos nombres son el mismo transportista?
 *
 * 🔴 Comparación EXACTA y normalizada, **jamás por parecido**: ni distancia de
 * edición, ni trigramas, ni fonética. Es la MISMA regla de los destinos
 * (`claveDestino`) y por eso se llama a esa función en vez de escribir una
 * segunda: minúsculas, sin acentos, sin puntuación ni espacios, con los dígitos
 * aparte. Así «RedNblue», «REDNBLUE» y « Red N Blue » son uno solo, y
 * «Transporte Sol» no se confunde con nada más.
 *
 * ⚠️ La regla ignora la «s» final, así que «Transporte Sol» y «Transportes Sol»
 * cuentan como el mismo — que es justo lo que se quiere: es la misma empresa
 * escrita de dos formas.
 */
export function claveTransportista(nombre: string | null | undefined): string {
  return claveDestino(nombre);
}

/** ¿Este nombre ya está en la lista? Por clave, nunca por parecido. */
export function yaEsUnTransportista(nombre: string, lista: readonly string[]): boolean {
  const k = claveTransportista(nombre);
  return lista.some((n) => claveTransportista(n) === k);
}

export type ValidacionTransportista =
  | { ok: true; valor: string }
  | { ok: false; error: string };

/**
 * Valida lo que llega por POST. Fail-closed: cualquier duda es un error con
 * texto para la pantalla, nunca una fila «más o menos».
 *
 * 🔴 Solo el NOMBRE. Daniel: nada de teléfono ni campos extra — es lo único que
 * la guía usa y lo único que se imprime.
 */
export function validarTransportistaNuevo(body: unknown): ValidacionTransportista {
  const b = (body ?? {}) as Record<string, unknown>;
  const nombre = typeof b.nombre === "string" ? b.nombre.trim() : "";
  if (!nombre) return { ok: false, error: "Escribe el nombre del transportista" };
  if (nombre.length > MAX_LARGO_TRANSPORTISTA) {
    return { ok: false, error: "El nombre es demasiado largo" };
  }
  return { ok: true, valor: nombre };
}

/**
 * Cuántas guías lleva cada transportista.
 *
 * ⚠️ Solo se cuentan las guías VIVAS y solo las que apuntan a una fila por id;
 * las de **Entrega directa** no tienen transportista y no cuentan para nadie.
 */
export function contarGuiasPorTransportista(
  guias: readonly { transportista_id: string | null }[],
): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const g of guias) {
    const id = g?.transportista_id;
    if (!id) continue;
    cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }
  return cuenta;
}

/** Pega la cuenta a cada fila, de más usado a menos, y el resto por nombre. */
export function conCuentaDeGuias(
  filas: readonly Transportista[],
  cuenta: ReadonlyMap<string, number>,
): TransportistaConfigurado[] {
  return filas
    .map((t) => ({ ...t, guias: cuenta.get(t.id) ?? 0 }))
    .sort((a, b) => b.guias - a.guias || a.nombre.localeCompare(b.nombre, "es"));
}

/** «53 guías» / «1 guía» / «Todavía sin guías» — nunca un «0» pelado. */
export function textoGuiasDelTransportista(guias: number): string {
  if (guias <= 0) return "Todavía sin guías";
  return guias === 1 ? "1 guía" : `${guias} guías`;
}

/** El texto de la confirmación al quitar: dice en palabras qué cambia. */
export function textoQuitarTransportista(nombre: string, guias: number): string {
  const cola =
    guias > 0
      ? ` Las ${guias === 1 ? "guía que lo usa" : `${guias} guías que lo usan`} no cambian: siguen diciendo su nombre.`
      : "";
  return `El desplegable de la guía dejará de ofrecer «${nombre}» a todo el equipo.${cola}`;
}
