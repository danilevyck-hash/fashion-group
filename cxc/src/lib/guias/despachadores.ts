// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS — LA LISTA DE «DESPACHADO POR» (módulo PURO: sin React, sin fetch).
//
// Daniel, textual (19-sep-2026): *«el + para agregar nombre debe de guardarse
// para todos los navegadores, o más fácil ponlo en configuraciones nada más y
// quita la opción de que sea en la creación de la guía»*.
//
// 🩸 La lista vivía mitad en una constante del código y mitad en el
// `localStorage` del navegador (`fg_entregadores`): un nombre que agregaba
// Angela con el ＋ NO lo veía Andrea, y no se podía quitar desde ninguna
// pantalla. Es el mismo cuento que la lista de destinos hasta el 7-sep-2026 y
// que los transportistas hasta el 9-sep-2026.
//
// 🔴 AHORA SE ADMINISTRA EN UN SOLO LUGAR: Guías › Configuración. El
// formulario de la guía se quedó con el desplegable PELADO — ni «＋», ni
// «Otro…», ni nada que escriba en esa lista desde ahí. Era lo que Daniel pidió
// («ponlo en configuraciones nada más»), y de paso es lo que hace que la lista
// sea de verdad del equipo: si se pudiera agregar al vuelo, volvería a
// ensuciarse sola.
//
// ⚠️ NO CAMBIA NADA DE LO QUE SE GUARDA: `guia_transporte.entregado_por` sigue
// siendo el TEXTO del nombre. Esta tabla solo dice qué OFRECE el desplegable.
//
// Este módulo solo DECIDE. Quién toca la base es `despachadores-server.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { claveDestino } from "@/lib/guias/destinos-clientes";
import { CONFIG_GUIAS_ROLES } from "@/lib/guias/destinos-config";

/**
 * 🔴 LA RED MIENTRAS LA MIGRACIÓN NO CORRA (y si la base no contesta): los
 * cuatro de siempre. El código NO degrada sin la DDL — el desplegable sigue
 * ofreciendo exactamente lo que ofrecía antes del cambio.
 *
 * Julio y Rodrigo son los dos que de verdad despachan (medido el 25-ago-2026
 * sobre las 212 guías vivas: `Julio ×178 · Rodrigo ×31 · vacío ×3`); Eloyn lo
 * pidió Daniel el 14-sep-2026 y Jorman el 19-sep-2026.
 */
export const DESPACHADORES_BASE: readonly string[] = ["Julio", "Rodrigo", "Eloyn", "Jorman"];

/**
 * 🔴 QUIÉN ADMINISTRA LA LISTA: admin y secretaria, y NADIE MÁS — los mismos
 * de Guías › Configuración.
 *
 * ⚠️ Acá NO se reparte «agregar de un lado, quitar del otro» como en los
 * destinos y los transportistas: Daniel pidió que agregar saliera de la guía
 * («quita la opción de que sea en la creación de la guía»), así que las dos
 * cosas viven en la misma pantalla y tienen los mismos roles.
 */
export const DESPACHADORES_ROLES_ESCRITURA = CONFIG_GUIAS_ROLES;

/** Quién LEE la lista: todo el que puede abrir Guías. */
export const DESPACHADORES_ROLES_LECTURA = ["admin", "secretaria", "bodega", "vendedor"] as const;

/** Tope del nombre. Es un nombre de pila, no una razón social. */
export const MAX_LARGO_DESPACHADOR = 80;

/** Una fila activa de `guias_despachadores`, como viaja a la pantalla. */
export interface Despachador {
  id: number;
  nombre: string;
  creado_por: string;
  creado_en: string;
}

/** Lo mismo, con cuántas guías despachó — para Guías › Configuración. */
export interface DespachadorConfigurado extends Despachador {
  /** 🔴 El dato que dice si se puede quitar sin dudar. */
  guias: number;
}

/**
 * ¿Estos dos nombres son la misma persona? Comparación EXACTA y normalizada,
 * **jamás por parecido** — la MISMA regla de los destinos y los transportistas
 * (`claveDestino`), por eso se llama a esa función en vez de escribir una
 * segunda: «Julio», «JULIO» y « julio » son uno solo.
 */
export function claveDespachador(nombre: string | null | undefined): string {
  return claveDestino(nombre);
}

/** ¿Este nombre ya está en la lista? Por clave, nunca por parecido. */
export function yaEsUnDespachador(nombre: string, lista: readonly string[]): boolean {
  const k = claveDespachador(nombre);
  return lista.some((n) => claveDespachador(n) === k);
}

export type ValidacionDespachador =
  | { ok: true; valor: string }
  | { ok: false; error: string };

/**
 * Valida lo que llega por POST. Fail-closed: cualquier duda es un error con
 * texto para la pantalla, nunca una fila «más o menos».
 *
 * 🔴 Solo el NOMBRE: es lo único que la guía usa y lo único que se imprime.
 */
export function validarDespachadorNuevo(body: unknown): ValidacionDespachador {
  const b = (body ?? {}) as Record<string, unknown>;
  const nombre = typeof b.nombre === "string" ? b.nombre.trim() : "";
  if (!nombre) return { ok: false, error: "Escribe el nombre de quien despacha" };
  if (nombre.length > MAX_LARGO_DESPACHADOR) {
    return { ok: false, error: "El nombre es demasiado largo" };
  }
  return { ok: true, valor: nombre };
}

/**
 * La lista que ve el desplegable: lo que trae la base y, si viniera vacía
 * (migración pendiente, base callada), los cuatro de siempre. Se descartan
 * repetidos por clave conservando el PRIMERO y nunca se inventa una grafía.
 */
export function listaParaElDesplegable(deLaBase: readonly string[] | null | undefined): string[] {
  const filas = (deLaBase ?? []).map((n) => String(n ?? "").trim()).filter((n) => n !== "");
  const fuente = filas.length > 0 ? filas : DESPACHADORES_BASE;
  const salida: string[] = [];
  for (const n of fuente) {
    if (!yaEsUnDespachador(n, salida)) salida.push(n);
  }
  return salida;
}

/**
 * Cuántas guías despachó cada uno. Se cuenta por el TEXTO del nombre
 * (`guia_transporte.entregado_por`), con la clave normalizada: la guía no
 * apunta a esta tabla por id y nunca lo hizo.
 */
export function contarGuiasPorDespachador(
  guias: readonly { entregado_por: string | null }[],
): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const g of guias) {
    const k = claveDespachador(g?.entregado_por);
    if (!k) continue;
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  return cuenta;
}

/** Pega la cuenta a cada fila, de más usado a menos, y el resto por nombre. */
export function conCuentaDeGuias(
  filas: readonly Despachador[],
  cuenta: ReadonlyMap<string, number>,
): DespachadorConfigurado[] {
  return filas
    .map((f) => ({ ...f, guias: cuenta.get(claveDespachador(f.nombre)) ?? 0 }))
    .sort((a, b) => b.guias - a.guias || a.nombre.localeCompare(b.nombre, "es"));
}

/** «178 guías» / «1 guía» / «Todavía sin guías» — nunca un «0» pelado. */
export function textoGuiasDelDespachador(guias: number): string {
  if (guias <= 0) return "Todavía sin guías";
  return guias === 1 ? "1 guía" : `${guias} guías`;
}

/** El texto de la confirmación al quitar: dice en palabras qué cambia. */
export function textoQuitarDespachador(nombre: string, guias: number): string {
  const cola =
    guias > 0
      ? ` Las ${guias === 1 ? "guía que lo dice" : `${guias} guías que lo dicen`} no cambian: siguen con su nombre.`
      : "";
  return `El desplegable «Despachado por» dejará de ofrecer «${nombre}» a todo el equipo.${cola}`;
}
