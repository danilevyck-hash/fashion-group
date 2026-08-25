// ─────────────────────────────────────────────────────────────────────────────
// EL AVISO QUE REEMPLAZA AL QUE SE PIERDE — módulo PURO.
//
// Desde que `Ventas › Productos` agrupa por el nombre que el código tiene HOY,
// el mismo producto deja de salir partido en dos renglones. Eso arregla lo que
// había que arreglar y TAPA una cosa: si un código está MAL CLASIFICADO en
// Switch —vivió bajo dos categorías que las dos existen de verdad— antes se
// veía como dos filas y ahora se ve como una sola.
//
// Acá vive el criterio para distinguir esos casos, y NADA MÁS: ni Supabase, ni
// red, ni reloj. Se prueba sin credenciales y sin tocar producción.
//
// ── EL ÁRBITRO NO ES EL PARECIDO DE DOS TEXTOS ──────────────────────────────
//
// 🔑 Es `depurador_descripciones`, el catálogo de descripciones APROBADAS, que
// es EL MISMO árbitro que usó el diagnóstico (scripts/_diag-grafias-
// clasificadas.mjs). No se inventa un segundo criterio: dos definiciones de
// "qué es una categoría de verdad" es el bug que este repo ya pagó varias
// veces.
//
// ⚠️ EL ORDEN DE LAS PREGUNTAS IMPORTA, y es el del diagnóstico, literal. La
// búsqueda en el catálogo normaliza los espacios, así que "Men-T-Shirts  S/S"
// (doble espacio) "encuentra" la aprobada "Men-T-Shirts S/S". Si se preguntara
// por el catálogo PRIMERO, las dos darían aprobadas y un doble espacio se
// leería como dos categorías reales — o sea: el aviso saldría justo en los
// casos que NO son un problema. Por eso la forma del string se resuelve antes.
// ─────────────────────────────────────────────────────────────────────────────

/** Una grafía distinta del mismo grupo, con UN código que las comparte. */
export interface GrafiaDelGrupo {
  otra: string;
  codigo: string;
}

/** Lo que la pantalla necesita para decir el aviso: el código y la otra categoría. */
export type AvisoClasificacion = GrafiaDelGrupo;

/** Insensible a caja y a espacios de más. Igual que `marcaKey()` del Depurador. */
export function normalizarDescripcion(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Sólo letras y números: dos textos que sólo cambian en la puntuación. */
export function soloAlfanumerico(s: string | null | undefined): string {
  return normalizarDescripcion(s).replace(/[^a-z0-9]/g, "");
}

export type ClaseDeGrafia = "tipeo" | "mal_clasificado" | "a_revisar";

/**
 * Qué son estas dos grafías del mismo código.
 *
 * · `tipeo`           el mismo nombre escrito distinto. Se une sin pensar y no
 *                     hay nada que avisar: en Switch ya quedó UNA sola grafía.
 * · `mal_clasificado` las dos son categorías REALES y aprobadas. Que un mismo
 *                     código viva bajo las dos significa que en Switch ese
 *                     código está en la categoría equivocada. ESTE es el aviso.
 * · `a_revisar`       ninguna de las dos está en el catálogo. No se afirma
 *                     nada: un aviso que sale sin saber es ruido.
 *
 * `aprobadas` son las descripciones del catálogo YA normalizadas con
 * `normalizarDescripcion`.
 */
export function clasificarGrafia(
  a: string,
  b: string,
  aprobadas: ReadonlySet<string>,
): ClaseDeGrafia {
  if (normalizarDescripcion(a) === normalizarDescripcion(b)) return "tipeo";
  if (soloAlfanumerico(a) === soloAlfanumerico(b)) return "tipeo";
  const okA = aprobadas.has(normalizarDescripcion(a));
  const okB = aprobadas.has(normalizarDescripcion(b));
  if (okA && okB) return "mal_clasificado";
  if (okA !== okB) return "tipeo";
  return "a_revisar";
}

/**
 * Las grafías de este grupo que merecen aviso — y sólo esas.
 *
 * 🔴 NO FRENA NADA Y NO CORRIGE NADA. Dice el código y la otra categoría para
 * que Daniel lo mire en Switch, que es la única salida real. Cuando el código
 * se reclasifique allá, el aviso desaparece solo.
 */
export function avisosDeClasificacion(
  descripcion: string,
  grafias: readonly GrafiaDelGrupo[],
  aprobadas: ReadonlySet<string>,
): AvisoClasificacion[] {
  return grafias.filter(g => clasificarGrafia(descripcion, g.otra, aprobadas) === "mal_clasificado");
}

/** El catálogo aprobado, listo para preguntarle. Las inactivas NO cuentan. */
export function catalogoAprobado(
  filas: readonly { descripcion: string | null; activa?: boolean | null }[],
): Set<string> {
  return new Set(
    filas.filter(d => d.activa !== false).map(d => normalizarDescripcion(d.descripcion)),
  );
}
