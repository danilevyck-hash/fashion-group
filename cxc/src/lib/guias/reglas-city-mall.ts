// ─────────────────────────────────────────────────────────────────────────────
// Las reglas de pareo de la migración de City Mall, LEÍDAS DEL PROPIO SQL.
//
// Módulo PURO (sin base, sin red). Existe para que la verificación contra
// producción y el candado del build midan **la migración que Daniel va a
// correr**, no una segunda copia de las reglas escrita a mano en TypeScript.
//
// 🩸 POR QUÉ NO SE COPIAN LAS REGLAS ACÁ. Si el .sql y el .ts tuvieran cada uno
// su lista, podrían divergir sin que nada se ponga rojo: el verificador diría
// "150 líneas, todo cuadra" sobre reglas que el SQL ya no tiene. Es el mismo
// error que este repo pagó con las listas de empresas repartidas en tres
// archivos. Acá la fuente es UNA: el archivo de migración.
//
// El otro riesgo que ataca este módulo es interno al SQL: la migración escribe
// sus reglas DOS veces —una en el PASO 1 (la vista previa que Daniel mira para
// decidir si sigue) y otra en el UPDATE—. Si esas dos listas no fueran
// idénticas, la vista previa estaría mintiendo sobre lo que va a pasar, que es
// la peor forma de fallar acá. `leerReglasDeMigracion` las extrae TODAS y exige
// que coincidan.
// ─────────────────────────────────────────────────────────────────────────────

/** Ruta de la migración, relativa a la raíz del repo. Fuente de las reglas. */
export const MIGRACION_CITY_MALL =
  "supabase/migrations/20260809120000_guias_atar_city_mall_y_remapeo_d201.sql";

/** Pareo por (cliente escrito + dirección escrita). Los dos ya normalizados. */
export interface ReglaDireccion {
  cliente: string;
  direccion: string;
  codigo: string;
}

/** Pareo por cliente escrito, sin mirar la dirección. Ya normalizado. */
export interface ReglaNombre {
  cliente: string;
  codigo: string;
}

export interface ReglasCityMall {
  porDireccion: ReglaDireccion[];
  porNombre: ReglaNombre[];
}

/**
 * El equivalente EXACTO de `fg_norm_guia_texto(text)` del SQL:
 * sin acentos, sin mayúsculas, sin espacios de más.
 *
 * ⚠️ Tiene que dar lo mismo que la función de Postgres, carácter por carácter.
 * Si acá se normalizara distinto, la verificación contra producción mediría un
 * pareo que la migración no va a hacer. El test lo fija con los textos REALES
 * que hay en `guia_items`.
 */
export function normalizarComoSql(t: string | null | undefined): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // las tildes, ya separadas de su letra
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Corta un bloque `VALUES … )` desde el índice de la palabra VALUES. */
function bloqueValues(sql: string, desde: number): string {
  const cierre = sql.indexOf("\n)", desde);
  return sql.slice(desde, cierre === -1 ? sql.length : cierre);
}

function tuplasDe3(bloque: string): ReglaDireccion[] {
  const re = /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'(D-\d+)'\s*\)/g;
  const out: ReglaDireccion[] = [];
  for (const m of bloque.matchAll(re)) out.push({ cliente: m[1], direccion: m[2], codigo: m[3] });
  return out;
}

function tuplasDe2(bloque: string): ReglaNombre[] {
  const re = /\(\s*'([^']*)'\s*,\s*'(D-\d+)'\s*\)/g;
  const out: ReglaNombre[] = [];
  for (const m of bloque.matchAll(re)) out.push({ cliente: m[1], codigo: m[2] });
  return out;
}

const clave = (r: ReglaDireccion | ReglaNombre): string =>
  "direccion" in r ? `${r.cliente}|${r.direccion}|${r.codigo}` : `${r.cliente}|${r.codigo}`;

function mismasReglas(a: readonly (ReglaDireccion | ReglaNombre)[], b: readonly (ReglaDireccion | ReglaNombre)[]): boolean {
  if (a.length !== b.length) return false;
  const ka = a.map(clave).sort();
  const kb = b.map(clave).sort();
  return ka.every((k, i) => k === kb[i]);
}

/**
 * Extrae las reglas del texto de la migración.
 *
 * Revienta —a propósito, y no devuelve nada a medias— si:
 *  - no encuentra reglas de alguno de los dos tipos, o
 *  - las copias del PASO 1 y del UPDATE no son idénticas.
 *
 * Fallar ruidoso es lo correcto: un verificador que se degrada en silencio
 * cuando no entiende el SQL da verde sin haber medido nada.
 */
export function leerReglasDeMigracion(sql: string): ReglasCityMall {
  const bloques: string[] = [];
  let i = sql.indexOf("VALUES");
  while (i !== -1) {
    bloques.push(bloqueValues(sql, i));
    i = sql.indexOf("VALUES", i + 6);
  }

  const grupos3 = bloques.map(tuplasDe3).filter((g) => g.length > 0);
  const grupos2 = bloques.map(tuplasDe2).filter((g) => g.length > 0);

  if (grupos3.length === 0) throw new Error("La migración no tiene reglas por (cliente + dirección).");
  if (grupos2.length === 0) throw new Error("La migración no tiene reglas por nombre.");

  for (const g of grupos3.slice(1)) {
    if (!mismasReglas(grupos3[0], g)) {
      throw new Error("Las reglas por DIRECCIÓN no son iguales en todos los bloques del SQL — la vista previa no diría la verdad.");
    }
  }
  for (const g of grupos2.slice(1)) {
    if (!mismasReglas(grupos2[0], g)) {
      throw new Error("Las reglas por NOMBRE no son iguales en todos los bloques del SQL — la vista previa no diría la verdad.");
    }
  }

  return { porDireccion: grupos3[0], porNombre: grupos2[0] };
}
