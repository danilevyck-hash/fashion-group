// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS — LA LISTA DE DESTINOS QUE OFRECE EL CAMPO DIRECCIÓN (módulo PURO).
//
// 🩸 Vivía en el `localStorage` del navegador (`fg_direcciones`): lo que
// agregaba Angela no lo veía nadie más, y no se podía quitar desde ninguna
// pantalla. Así quedó un destino de prueba llamado «hola» vivo para siempre en
// un solo navegador.
//
// Daniel, textual (7-sep-2026): *«lo de solo ver en mi pantalla no tiene
// lógica, el sistema debe de trabajar todo igual, que sea para todo»* y
// *«quítame hola»*.
//
// Ahora vive en la tabla `guias_destino_lista` (migración `20261014120000`) y
// se administra en **Guías › Configuración**, la misma pantalla que ya
// administra los destinos POR CLIENTE. 🔴 **Si se puede agregar, se tiene que
// poder quitar**: soft delete firmado, nunca DELETE.
//
// ⚠️ NO se fusiona con `guias_destino_cliente`: aquélla son los destinos DE UN
// CLIENTE (botones bajo el campo y autollenado); ésta es la lista general que
// el campo ofrece a todos, sin dueño.
//
// ⚠️ `localStorage` sigue sirviendo para las comodidades de cada persona —el
// último transportista elegido, un filtro, un borrador— y para nada que otro
// necesite ver.
// ─────────────────────────────────────────────────────────────────────────────

import { claveDestino } from "@/lib/guias/destinos-clientes";
import { MAX_LARGO_DESTINO } from "@/lib/guias/destinos-config";

/**
 * 🔴 LA RED MIENTRAS LA MIGRACIÓN NO CORRA (y si la base no contesta): los
 * cinco de siempre. El código NO degrada sin la DDL — el campo sigue ofreciendo
 * esta lista, que es exactamente la que ofrecía antes del cambio.
 *
 * 🔴 «Changuinola» CON «U» (5-sep-2026). Daniel: *«es changuinola»*. Medido
 * entonces: 26 renglones vivos decían «Changinola» contra 1 bien escrito,
 * porque ESTA lista ofrecía la grafía mala y la gente la tocaba.
 */
export const DESTINOS_BASE: readonly string[] = [
  "Paso Canoas",
  "David",
  "Santiago",
  "Guabito",
  "Changuinola",
];

/**
 * Quién puede AGREGAR un destino a la lista compartida: los mismos que crean
 * guías (`CREATE_ROLES` de la lista de guías). El «＋» del formulario es de
 * quien está armando la guía, no solo de quien administra.
 * ⚠️ QUITAR es de admin y secretaria, y se hace en Guías › Configuración
 * (`CONFIG_GUIAS_ROLES`): agregar es un atajo, quitar es una decisión.
 */
export const DESTINOS_LISTA_ROLES_ESCRITURA = ["admin", "secretaria", "bodega"] as const;

/** Quién LEE la lista: todo el que puede abrir Guías. */
export const DESTINOS_LISTA_ROLES_LECTURA = ["admin", "secretaria", "bodega", "vendedor"] as const;

/** Una fila activa de `guias_destino_lista`, como viaja a la pantalla. */
export interface DestinoDeLista {
  id: number;
  destino: string;
  creado_por: string;
  creado_en: string;
}

export type ValidacionDestinoLista =
  | { ok: true; valor: string }
  | { ok: false; error: string };

/**
 * Valida lo que llega por POST. Fail-closed: cualquier duda es un error con
 * texto para la pantalla, nunca una fila «más o menos».
 */
export function validarDestinoDeLista(body: unknown): ValidacionDestinoLista {
  const b = (body ?? {}) as Record<string, unknown>;
  const destino = typeof b.destino === "string" ? b.destino.trim() : "";
  if (!destino) return { ok: false, error: "Escribe el destino" };
  if (destino.length > MAX_LARGO_DESTINO) {
    return { ok: false, error: "El destino es demasiado largo" };
  }
  return { ok: true, valor: destino };
}

/**
 * ¿Este destino ya está en la lista? Compara con `claveDestino` —la MISMA regla
 * exacta de los botones: minúsculas, sin acentos, sin puntuación, con los
 * dígitos aparte— así «DAVID» no entra dos veces y «Westland tienda 5» no se
 * confunde con la 6. 🔴 Nunca por parecido.
 */
export function yaEstaEnLaLista(destino: string, lista: readonly string[]): boolean {
  const k = claveDestino(destino);
  return lista.some((d) => claveDestino(d) === k);
}

/**
 * La lista que ve el campo: lo que trae la base y, si viniera vacía (migración
 * pendiente, base callada), los cinco de siempre. Se descartan repetidos por
 * clave conservando el PRIMERO —el orden de la base manda— y nunca se inventa
 * una grafía.
 */
export function listaParaElCampo(deLaBase: readonly string[] | null | undefined): string[] {
  const filas = (deLaBase ?? []).map((d) => String(d ?? "").trim()).filter((d) => d !== "");
  const fuente = filas.length > 0 ? filas : DESTINOS_BASE;
  const salida: string[] = [];
  for (const d of fuente) {
    if (!yaEstaEnLaLista(d, salida)) salida.push(d);
  }
  return salida;
}

/** El texto de la confirmación al quitar: dice en palabras qué cambia. */
export function textoQuitarDeLaLista(destino: string): string {
  return `El campo Dirección dejará de ofrecer «${destino}» a todo el equipo.`;
}
