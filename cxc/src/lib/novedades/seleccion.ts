// ─────────────────────────────────────────────────────────────────────────────
// «QUÉ CAMBIÓ» — LAS REGLAS, SIN I/O (9-sep-2026). Módulo PURO.
//
// Daniel, textual: *«revisa todo lo que hemos hecho desde que empezó esta
// conversación, para que a cada usuario que entre a cada módulo le salga
// mensajito de que hay nuevo o qué cambió, de manera súper resumida»*.
//
// 🩸 POR QUÉ EXISTE. En cuatro días cambiaron de sitio el botón de descargar de
// Cuentas por Cobrar, el nombre entero del módulo «Depurador», el desplegable de
// dónde salió un pago y dos destinos de Guías. Angela, andrea, Edwin y David
// abren la pantalla al día siguiente y la encuentran distinta, sin que nada se
// los diga. Esto es lo que se los dice.
//
// 🔴 LAS SIETE REGLAS, y cada una tiene su candado en
// `src/__tests__/lib/novedades.test.ts`:
//   1. Se ve UNA sola vez por persona y por novedad. Cerrada, no vuelve.
//   2. No bloquea nada: es una tira con una ×, no un modal.
//   3. MÁXIMO 3 a la vez, las más nuevas.
//   4. Cada novedad es UNA línea, en el idioma de ellos.
//   5. Solo la ve quien TIENE ese módulo.
//   6. Caduca sola a los 30 días — contados desde que se AVISA (`desde`), no
//      desde que el cambio salió: ver `estaVigente`.
//   7. Nunca sale una novedad de un módulo dentro de otro.
//
// 🔴 LAS NOVEDADES SON DATOS ESCRITOS A MANO (`lista.ts`), nunca generadas del
// historial de cambios. Un texto para una persona lo escribe una persona: el
// historial dice «MITADES_POR_MARCA = true» y la secretaria necesita leer «una
// descripción casi igual a otra ahora te avisa antes de entrar».
//
// Sin base, sin red, sin `new Date()`: el «hoy» entra por parámetro y sale de
// `hoyPanama()`.
// ─────────────────────────────────────────────────────────────────────────────

import type { DibujoKey } from "./dibujos";

/** Una novedad: a qué módulo pertenece, de cuándo es y qué dice. */
export interface Novedad {
  /** Identidad estable. Empieza con la `key` del módulo — ver `idEsDelModulo`. */
  id: string;
  /** La `key` del módulo en `src/lib/modules.ts`. NUNCA la ruta ni el rótulo. */
  modulo: string;
  /** `YYYY-MM-DD`, el día en que el cambio SALIÓ. Es lo que ordena la tira. */
  fecha: string;
  /**
   * `YYYY-MM-DD` OPCIONAL: el día en que esta novedad EMPEZÓ A AVISARSE.
   *
   * 🔴 LOS 30 DÍAS SE CUENTAN DESDE ACÁ, no desde `fecha`. Existe por una sola
   * razón, y es la que dijo Daniel el 9-sep-2026: *«Salen todas — que se enteren
   * de todo aunque sea viejo»*. El aviso nació ese día con lo de esa semana; el
   * resto del trabajo de dos semanas se escribió después, y un cambio del 25 de
   * agosto habría nacido con **cuatro días de vida** y se habría ido antes de
   * que Angela abriera la pantalla.
   *
   * `fecha` sigue diciendo la verdad de cuándo cambió (es lo que ordena y lo que
   * Daniel ve en su lista); `desde` dice desde cuándo se avisa. Sin `desde`, las
   * dos cosas son el mismo día — que es el caso normal de acá en adelante.
   */
  desde?: string;
  /** UNA línea. Sin jerga, sin nombres de tabla, sin rutas. */
  texto: string;
  /**
   * OPCIONAL: el cuadrito que acompaña a esta novedad (`src/lib/novedades/dibujos.ts`).
   *
   * 🔴 SOLO donde la persona NO ENCUENTRA LA COSA SOLA — un botón que se movió,
   * cambió de nombre o nació; un control que desapareció y hay que decir a dónde
   * se fue. Daniel: *«las que cambian de botón o algo más que sea necesario para
   * facilidad de usuario»*.
   *
   * ⚠️ Y NUNCA por un número, una regla o un texto que cambió: ahí el dibujo no
   * agrega nada, y **solo se ve una vez** — un dibujo que no aclara ESTORBA.
   *
   * Sin `dibujo`, la novedad se ve exactamente como antes de que existieran.
   */
  dibujo?: DibujoKey;
}

/** Cuántas se muestran a la vez. Más que esto ya no es un aviso, es una lista. */
export const MAX_A_LA_VEZ = 3;

/** A los 30 días una novedad deja de ser nueva y se va sola. */
export const DIAS_VIGENCIA = 30;

/** Días de calendario entre dos fechas `YYYY-MM-DD` (b − a). */
function diasEntre(a: string, b: string): number {
  const dia = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((dia(b) - dia(a)) / 86_400_000);
}

/** Desde qué día se avisa esta novedad. Sin `desde`, el día del cambio. */
export function seAvisaDesde(novedad: Novedad): string {
  return novedad.desde ?? novedad.fecha;
}

/**
 * ¿Esta novedad todavía es nueva al día `hoy`?
 *
 * Dos condiciones, y las dos hacen falta:
 *   · el cambio ya SALIÓ (`fecha` no es futura) — avisar de algo que todavía no
 *     está en pantalla es peor que no avisar;
 *   · el aviso ya EMPEZÓ y no lleva más de 30 días (`desde`, o `fecha` si no
 *     hay `desde`).
 *
 * 🔴 Los 30 días se cuentan desde que se AVISA, no desde que cambió. Un cambio
 * viejo que recién hoy se pone en la tira tiene sus 30 días completos.
 */
export function estaVigente(novedad: Novedad, hoy: string): boolean {
  if (diasEntre(novedad.fecha, hoy) < 0) return false;
  const dias = diasEntre(seAvisaDesde(novedad), hoy);
  return dias >= 0 && dias <= DIAS_VIGENCIA;
}

/**
 * ¿El id de esta novedad la delata como de su módulo?
 *
 * 🔴 El id EMPIEZA con la key del módulo (`cxc-descargar-en-dos-opciones`). No
 * es cosmético: el id es lo que se guarda como «ya la vi», así que si dos
 * módulos pudieran usar el mismo id, cerrar una en Guías apagaría otra en
 * Préstamos. El candado exige el prefijo.
 */
export function idEsDelModulo(novedad: Novedad): boolean {
  return novedad.id.startsWith(`${novedad.modulo}-`);
}

/** El módulo al que pertenece una dirección, o `null` si no es de ninguno.
 *
 *  Gana el `href` MÁS LARGO que calce: `/admin/usuarios` es Usuarios y no
 *  cualquier otra cosa que empiece con `/admin`. Se compara por segmento
 *  (`/cxc` calza `/cxc` y `/cxc/algo`, nunca `/cxcotra`). */
export function moduloDeRuta(
  pathname: string,
  modulos: readonly { key: string; href: string }[],
): string | null {
  let mejor: { key: string; href: string } | null = null;
  for (const m of modulos) {
    if (pathname === m.href || pathname.startsWith(`${m.href}/`)) {
      if (!mejor || m.href.length > mejor.href.length) mejor = m;
    }
  }
  return mejor?.key ?? null;
}

/** Lo que hace falta para decidir qué se le muestra a alguien. */
export interface Contexto {
  /** Todas las novedades escritas a mano. */
  novedades: readonly Novedad[];
  /** El módulo en el que está parado ahora mismo. */
  moduloKey: string | null;
  /** El día de Panamá, `YYYY-MM-DD`. */
  hoy: string;
  /** Los ids que esta persona ya cerró. */
  vistas: readonly string[];
  /** Las keys de los módulos que esta persona VE. Regla 5. */
  modulosDelUsuario: readonly string[];
}

/**
 * Las novedades que le tocan a esta persona en este módulo, de la más nueva a
 * la más vieja. SIN cortar a tres — eso lo hace `novedadesParaMostrar`.
 *
 * Se parte en dos funciones a propósito: el servidor manda las PENDIENTES (lo
 * que la tabla dice que no ha cerrado) y la pantalla vuelve a filtrar con lo
 * que este navegador cerró antes de cortar. Si el corte viviera solo en el
 * servidor, una cerrada localmente ocuparía uno de los tres lugares.
 */
export function novedadesPendientes(ctx: Contexto): Novedad[] {
  const { novedades, moduloKey, hoy, vistas, modulosDelUsuario } = ctx;
  if (!moduloKey) return [];
  // Regla 5: el módulo tiene que ser suyo. Sin esto, escribir la dirección a
  // mano bastaría para leer que Comisiones cambió.
  if (!modulosDelUsuario.includes(moduloKey)) return [];
  const yaVistas = new Set(vistas);
  return novedades
    .filter((n) => n.modulo === moduloKey)   // regla 7
    .filter((n) => estaVigente(n, hoy))      // regla 6
    .filter((n) => !yaVistas.has(n.id))      // regla 1
    // Más nueva primero; con la misma fecha, orden estable por id.
    .sort((a, b) => (a.fecha === b.fecha ? a.id.localeCompare(b.id) : b.fecha.localeCompare(a.fecha)));
}

/** Las mismas, ya cortadas a las 3 más nuevas (regla 3). */
export function novedadesParaMostrar(ctx: Contexto): Novedad[] {
  return novedadesPendientes(ctx).slice(0, MAX_A_LA_VEZ);
}
