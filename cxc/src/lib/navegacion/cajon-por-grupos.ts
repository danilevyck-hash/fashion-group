// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EN EL CELULAR, EL MENÚ DE LAS TRES RAYAS MUESTRA EL MENÚ (24-sep-2026).
//
// 🩸 QUÉ VINO A ARREGLAR. El cajón del teléfono tenía CUATRO renglones —Inicio,
// Ventas y clientes, Operación, Administración— y el resto en blanco. Tocar un
// grupo cerraba el cajón y cargaba OTRA pantalla, `/g/<grupo>`, solo para
// elegir el módulo. De Asistencia a Guías eran TRES toques con una pantalla de
// por medio (☰ › Operación › esperar `/g/operacion` › Guías).
//
// 🔴 AHORA ☰ ABRE UNA HOJA DESDE ABAJO —donde está el pulgar— con los tres
// grupos como pestañas y los módulos del grupo debajo. Abre en el grupo del
// módulo donde está la persona, con ese módulo marcado, así que llegar a otro
// módulo del mismo grupo son DOS toques y ninguna pantalla intermedia.
//
// 🔑 LOS MÓDULOS SALEN DEL ROL, NUNCA DE UNA LISTA A MANO: todo sale de
// `getVisibleModules`/`GROUPS` de `modules.ts`, que ya poda Préstamos (Planilla
// Unida) y Cuentas por Cobrar de David según sus interruptores. Acá no se
// escribe el nombre de ningún módulo ni de ningún rol.
//
// 🔴 EL RÓTULO CORTO ES LA PRIMERA PALABRA DEL GRUPO, DERIVADA, NO ESCRITA.
// «Ventas y clientes» no cabe en un tercio de 390 px: se leía «Ventas y cl…».
// En la pestaña se dice **Ventas · Operación · Administración**; el nombre
// completo sigue mandando en el home, en el camino de migas y en `/g/<grupo>`.
// Un grupo que se renombre arrastra solo su rótulo corto.
//
// ⚠️ LA PÁGINA DE GRUPO NO SE TOCA: `/g/<grupo>` sigue viva para la computadora
// y para el camino de migas. Esto solo cambia por dónde se entra desde el
// teléfono.
//
// ── SEGUNDA VUELTA: LA HOJA PASÓ A SER UNA PANTALLA (24-sep-2026) ────────────
// Daniel vio la hoja y no le gustó: arrancaba a la MITAD de la pantalla y
// dejaba ver 6 de los 20 módulos, con las pestañas obligando a un tercer toque
// para salir del grupo. Ahora ☰ abre el **menú a pantalla completa**: los tres
// grupos como encabezados de sección, sus módulos en filas agrupadas al estilo
// de Ajustes del iPhone, cada uno con su ícono a color, el de aquí marcado, y
// un buscador arriba que llega a cualquiera. Caben 12 sin desplazar y los 20 en
// un rollo corto, así que cualquier módulo son DOS toques, se venga de donde se
// venga.
//
// 🔑 LA HOJA NO SE BORRÓ: es el otro `MODO_DEL_CAJON`. Volver a ella es cambiar
// una palabra, sin desenterrar código.
//
// Interruptores: `CAJON_HOJA_ABAJO` en `false` vuelve el cajón lateral de
// siempre; con él prendido, `MODO_DEL_CAJON` elige entre la hoja de abajo
// (`"hoja"`) y el menú a pantalla completa (`"pantalla"`, hoy). Ninguno de los
// dos toca una línea de lo que se guarda.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ALL_MODULES,
  GROUPS,
  getVisibleModules,
  type AppModule,
  type ModuleGroup,
} from "@/lib/modules";
import { moduloDeRuta } from "@/lib/novedades/seleccion";
import { coincideBusqueda } from "@/lib/buscar-normalizado";

/** 🔴 Hoy PRENDIDO. `false` = el cajón lateral de antes, igual que siempre. */
export const CAJON_HOJA_ABAJO = true;

/** Las dos formas del menú del celular. La hoja se conserva entera. */
export type ModoDelCajon = "hoja" | "pantalla";

/** 🔴 Hoy `pantalla`. `"hoja"` devuelve la hoja de abajo, tal cual estaba. */
export const MODO_DEL_CAJON: ModoDelCajon = "pantalla";

/** ¿Se dibuja el menú a pantalla completa? */
export function esMenuDePantalla(): boolean {
  return CAJON_HOJA_ABAJO && MODO_DEL_CAJON === "pantalla";
}

/** ¿Se dibuja la hoja de abajo? */
export function esHojaDeAbajo(): boolean {
  return CAJON_HOJA_ABAJO && MODO_DEL_CAJON === "hoja";
}

/** Un grupo tal como se dibuja en la hoja: su nombre largo, el corto y sus módulos. */
export interface GrupoDelCajon {
  key: ModuleGroup;
  /** El nombre de siempre — «Ventas y clientes». */
  label: string;
  /** El que entra en la pestaña — «Ventas». */
  rotuloCorto: string;
  modulos: AppModule[];
}

/**
 * El rótulo que entra en una pestaña de un tercio de pantalla.
 *
 * Es la PRIMERA palabra del nombre del grupo, derivada: «Ventas y clientes» →
 * «Ventas»; «Operación» y «Administración» se quedan como están porque ya son
 * una sola palabra.
 */
export function rotuloCortoDeGrupo(label: string): string {
  const primera = label.trim().split(/\s+/)[0];
  return primera || label;
}

/**
 * Los grupos que esta persona ve, cada uno con sus módulos.
 *
 * Un grupo sin módulos visibles NO se devuelve: nadie mira una pestaña vacía.
 */
export function gruposDelCajon(
  role: string | null | undefined,
  fgModules?: string[] | null,
): GrupoDelCajon[] {
  if (!role) return [];
  const visibles = getVisibleModules(role, fgModules);
  return GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    rotuloCorto: rotuloCortoDeGrupo(g.label),
    modulos: visibles.filter((m) => m.group === g.key),
  })).filter((g) => g.modulos.length > 0);
}

/** La `key` del módulo en el que está parada la persona, o `null`. */
export function moduloDeLaRuta(pathname: string): string | null {
  return moduloDeRuta(pathname, ALL_MODULES);
}

/**
 * El grupo del módulo donde está la persona — `null` si la dirección no es de
 * ningún módulo suyo (por ejemplo `/home` o una pantalla pública).
 */
export function grupoDeLaRuta(
  pathname: string,
  grupos: readonly GrupoDelCajon[],
): ModuleGroup | null {
  const key = moduloDeLaRuta(pathname);
  if (!key) return null;
  const grupo = grupos.find((g) => g.modulos.some((m) => m.key === key));
  return grupo ? grupo.key : null;
}

/**
 * Con qué pestaña abre la hoja: la del módulo donde está la persona y, si la
 * pantalla no es de ningún módulo, la primera que tenga.
 */
export function grupoAlAbrir(
  pathname: string,
  grupos: readonly GrupoDelCajon[],
): ModuleGroup | null {
  return grupoDeLaRuta(pathname, grupos) ?? grupos[0]?.key ?? null;
}

/**
 * ¿Se dibujan las pestañas?
 *
 * Con UN solo grupo no son una elección: son un botón que no hace nada (la
 * misma regla que la Planilla aplicó a su segmentado de una opción). Le pasa a
 * los roles de un módulo solo, como el gerente de Multifashion.
 */
export function seDibujaElSegmentado(grupos: readonly GrupoDelCajon[]): boolean {
  return grupos.length > 1;
}

/**
 * Los grupos, con sus módulos filtrados por lo que se escribió en el buscador.
 *
 * 🔴 SE BUSCA CON LA MISMA REGLA QUE TODO EL SISTEMA (`coincideBusqueda`):
 * subcadena exacta normalizada —sin acentos, sin mayúsculas, sin signos—,
 * **nunca por parecido**. Con una o dos letras se pide que estén al PRINCIPIO
 * del nombre, que es lo que ya hace el directorio; de tres para arriba, en
 * cualquier parte. Un texto vacío devuelve los grupos tal cual.
 *
 * Un grupo que se queda sin módulos NO se devuelve: nadie mira un encabezado de
 * sección vacío.
 *
 * ⚠️ Esto NO es la búsqueda global (la del ⌘K y la lupa): esa busca clientes,
 * guías y facturas contra el servidor. Este buscador solo acorta la lista de
 * módulos que ya está en la pantalla.
 */
export function filtrarGruposPorTexto(
  grupos: readonly GrupoDelCajon[],
  texto: string | null | undefined,
): GrupoDelCajon[] {
  const q = (texto ?? "").trim();
  if (!q) return [...grupos];
  return grupos
    .map((g) => ({ ...g, modulos: g.modulos.filter((m) => coincideBusqueda(q, [m.label])) }))
    .filter((g) => g.modulos.length > 0);
}

/** Cuántos módulos quedaron a la vista — para decir cuando no quedó ninguno. */
export function cuantosModulos(grupos: readonly GrupoDelCajon[]): number {
  return grupos.reduce((n, g) => n + g.modulos.length, 0);
}
