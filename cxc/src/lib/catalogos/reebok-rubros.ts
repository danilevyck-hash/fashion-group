// ─────────────────────────────────────────────────────────────────────────────
// LAS CATEGORÍAS DEL CATÁLOGO REEBOK SE ADMINISTRAN, NO SE PROGRAMAN
// (17-sep-2026). Módulo PURO: sin base, sin red, sin DOM.
//
// Daniel dijo **«sí»** a volver administrable el mapa `rubro → categoría`. Antes
// vivía en DOS listas del código que había que acordarse de tocar juntas:
//   · `CATEGORIA_POR_RUBRO` en `src/lib/reebok-clasificacion.ts` (la que
//     clasifica), y
//   · `REEBOK_CATEGORY_ESPERADAS` en `src/lib/depurador/reebok.ts` (la que
//     decide si el aviso de la Plantilla Switch grita o se calla).
// Un candado las comparaba. 🩸 **Ese espejo era el problema**: el 2-sep-2026
// HEADWEAR entró en una sola y cada archivo con gorras avisaba «valor
// inesperado» sobre un dato perfectamente bueno.
//
// Ahora la fuente es la tabla `reebok_rubro_categoria` (migración
// `20261205120000`) y las dos listas LEEN de ahí.
//
// ═══ 🔴 TRES REGLAS QUE NO SE MUEVEN ════════════════════════════════════════
//
// 1. **Falla ABIERTA.** Sin tabla, sin migración o con la base callada se usa
//    `CATEGORIA_POR_RUBRO_BASE` —las seis reglas de siempre— y el catálogo se
//    comporta igual que ayer. Nada se queda sin clasificar por un problema de
//    base.
//
// 2. **Las categorías NO se inventan.** `CategoriaReebok` sigue CERRADO en el
//    código: calzado · ropa · accesorios. Lo que se administra es a cuál de esas
//    tres va cada rubro. Una categoría nueva cambia pantallas, filtros y el
//    bulto que se le cobra al cliente: eso no sale de una casilla.
//
// 3. **La MARCA sigue mandando primero.** `categoriaReebok` mira el
//    `Department` de Switch ANTES que el rubro; el rubro es el plan B de una
//    marca vacía. Ninguna fila de esta tabla mueve ese orden.
//
// ⚠️ El rubro se guarda como llega de Switch: MAYÚSCULAS, sin espacios de más
// (`U`, la misma función con la que el mapa compara). Y se compara por
// **igualdad exacta normalizada, NUNCA por parecido**.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CATEGORIA_POR_RUBRO_BASE,
  U,
  rubrosQueElCatalogoConoce,
  type CategoriaReebok,
} from "@/lib/reebok-clasificacion";
import { CATALOGO_ADMIN_ROLES } from "@/lib/catalogo/roles";

/** La tabla. Una sola constante para que nadie la escriba dos veces. */
export const TABLA_RUBROS_REEBOK = "reebok_rubro_categoria";

/** La migración que la crea. El texto que se muestra cuando todavía no corrió. */
export const MIGRACION_RUBROS_REEBOK = "20261205120000";

/**
 * 🔴 LAS TRES CATEGORÍAS, CERRADAS. No se agregan desde ninguna pantalla.
 * Se DERIVAN del tipo: si mañana `CategoriaReebok` gana una cuarta, TypeScript
 * obliga a nombrarla acá (y el candado lo comprueba).
 */
export const CATEGORIAS_REEBOK: readonly CategoriaReebok[] = [
  "footwear",
  "apparel",
  "accessories",
] as const;

/** Cómo se lee cada categoría en pantalla. En español, como Daniel las nombra. */
export const ROTULO_CATEGORIA: Readonly<Record<CategoriaReebok, string>> = {
  footwear: "Calzado",
  apparel: "Ropa",
  accessories: "Accesorios",
};

/** ¿Este texto es una de las TRES? Fail-closed: cualquier otra cosa es `false`. */
export function esCategoriaReebok(v: unknown): v is CategoriaReebok {
  return typeof v === "string" && (CATEGORIAS_REEBOK as readonly string[]).includes(v);
}

/** Una fila ACTIVA de `reebok_rubro_categoria`, como viaja a la pantalla. */
export interface RubroDelCatalogo {
  id: number;
  rubro: string;
  categoria: CategoriaReebok;
  creado_por: string;
  creado_en: string;
}

/**
 * El mapa `rubro → categoría` que usa la clasificación.
 *
 * 🔴 **FALLA ABIERTA.** Una lista vacía —migración pendiente, base callada,
 * consulta rota— devuelve la red del código, no un mapa vacío: un mapa vacío
 * mandaría al cajón neutro a todo producto con la marca vacía, y el cajón neutro
 * es lo que cambia el bulto de 12 a 6.
 *
 * Las filas se leen en orden y la PRIMERA de un rubro gana: la tabla ya tiene
 * único entre activas, así que esto solo importa si la base quedara sucia.
 */
export function mapaDeRubros(
  filas: readonly { rubro: string; categoria: string }[] | null | undefined,
): Readonly<Record<string, CategoriaReebok>> {
  const limpias = (filas ?? []).filter((f) => U(f.rubro) !== "" && esCategoriaReebok(f.categoria));
  if (limpias.length === 0) return CATEGORIA_POR_RUBRO_BASE;
  const mapa: Record<string, CategoriaReebok> = {};
  for (const f of limpias) {
    const k = U(f.rubro);
    if (!(k in mapa)) mapa[k] = f.categoria as CategoriaReebok;
  }
  return mapa;
}

/**
 * Los rubros que el aviso de la Plantilla Switch da por buenos.
 *
 * Mismo fallo abierto: sin lista, los seis del código. 🔴 Es la ÚNICA forma de
 * armar esa lista — nadie la escribe a mano en ningún otro archivo.
 */
export function rubrosParaElAviso(
  filas: readonly { rubro: string; categoria: string }[] | null | undefined,
): string[] {
  return rubrosQueElCatalogoConoce(mapaDeRubros(filas));
}

/** ¿Este rubro ya está en la lista? **Igualdad exacta normalizada, jamás por
 *  parecido**: «T-Shirts» y «T-SHIRTS» son el mismo; «T-SHIRT» no. */
export function yaEstaElRubro(rubro: string, lista: readonly string[]): boolean {
  const k = U(rubro);
  return lista.some((r) => U(r) === k);
}

/** Tope de largo del rubro. Switch no manda nada ni cerca de esto; está para
 *  que un pegado accidental no entre a la base. */
export const MAX_LARGO_RUBRO = 80;

export type ValidacionRubro =
  | { ok: true; valor: { rubro: string; categoria: CategoriaReebok } }
  | { ok: false; error: string };

/**
 * Valida lo que llega por POST. Fail-closed: cualquier duda es un error con
 * texto para la pantalla, nunca una fila «más o menos».
 *
 * 🔴 El rubro se NORMALIZA antes de guardarse (mayúsculas, sin espacios de
 * más): es como llega de Switch y es como el mapa compara. Guardarlo tal cual lo
 * teclearon dejaría filas que nunca hacen match.
 */
export function validarRubroNuevo(body: unknown): ValidacionRubro {
  const b = (body ?? {}) as Record<string, unknown>;
  const rubro = U(typeof b.rubro === "string" ? b.rubro : "");
  if (!rubro) return { ok: false, error: "Escribe el rubro tal como llega de Switch" };
  if (rubro.length > MAX_LARGO_RUBRO) return { ok: false, error: "El rubro es demasiado largo" };
  if (!esCategoriaReebok(b.categoria)) {
    return { ok: false, error: "Elige a qué categoría va: Calzado, Ropa o Accesorios" };
  }
  return { ok: true, valor: { rubro, categoria: b.categoria } };
}

/**
 * Los rubros que la Plantilla Switch manda por `?agregar=`, listos para
 * confirmar en la pantalla.
 *
 * ⚠️ Solo PREPARA el formulario: nada se guarda sin que alguien toque el botón
 * y elija la categoría. Un enlace no puede escribir en la base.
 */
export function rubrosPedidosEnLaUrl(param: string | null | undefined): string[] {
  const salida: string[] = [];
  for (const crudo of String(param ?? "").split(",")) {
    const r = U(crudo);
    if (r && r.length <= MAX_LARGO_RUBRO && !yaEstaElRubro(r, salida)) salida.push(r);
  }
  return salida;
}

/** A dónde lleva el botón «Agregarlas al catálogo» de la Plantilla Switch. */
export const RUTA_CATEGORIAS_REEBOK = "/catalogos/admin/reebok/categorias";

/** El enlace con los rubros del archivo ya cargados. */
export function enlaceParaAgregar(rubros: readonly string[]): string {
  const lista = rubros.map((r) => U(r)).filter(Boolean);
  if (lista.length === 0) return RUTA_CATEGORIAS_REEBOK;
  return `${RUTA_CATEGORIAS_REEBOK}?agregar=${encodeURIComponent(lista.join(","))}`;
}

/**
 * 🔴 QUIÉN LEE Y QUIÉN ESCRIBE.
 *
 * LEER es de quien administra el catálogo (admin + secretaria): la Plantilla
 * Switch es de ese mismo par, y el aviso necesita la lista para no gritar de
 * más.
 *
 * ESCRIBIR es **solo admin**, y por eso NO se deriva de `CATALOGO_ADMIN_ROLES`:
 * cambiar este mapa mueve el cajón de un producto y, con él, el bulto que se le
 * cobra al cliente. Es una decisión, no un atajo.
 */
export const RUBROS_ROLES_LECTURA: readonly string[] = [...CATALOGO_ADMIN_ROLES];
export const RUBROS_ROLES_ESCRITURA: readonly string[] = ["admin"] as const;

/** ¿Este rol puede EDITAR el mapa? */
export function puedeEditarRubros(role: string | null | undefined): boolean {
  return RUBROS_ROLES_ESCRITURA.includes(role ?? "");
}

/** El texto de la confirmación al quitar: dice en palabras qué cambia. */
export function textoQuitarRubro(fila: { rubro: string; categoria: CategoriaReebok }): string {
  return (
    `El catálogo dejará de mandar «${fila.rubro}» a ${ROTULO_CATEGORIA[fila.categoria]}. ` +
    `Los productos que ya tienen categoría la conservan; los nuevos con ese rubro y sin ` +
    `Department entrarían sin categoría.`
  );
}
