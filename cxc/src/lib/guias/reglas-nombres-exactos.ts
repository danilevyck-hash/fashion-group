// ─────────────────────────────────────────────────────────────────────────────
// Las reglas de la migración que ata por NOMBRE EXACTO, leídas del propio SQL.
//
// Módulo PURO (sin base, sin red). Mismo motivo que `reglas-city-mall`: la
// verificación contra producción y el candado del build tienen que medir **la
// migración que Daniel va a correr**, no una segunda copia escrita a mano.
//
// El normalizador NO se redefine: se reusa `normalizarComoSql` —el gemelo en
// TypeScript de `fg_norm_guia_texto`—, que ya vive en `reglas-city-mall`. Dos
// normalizadores es tener dos criterios de pareo esperando a divergir.
//
// La migración escribe sus reglas DOS veces (la vista previa del PASO 1 y el
// UPDATE del PASO 2). `leerReglasNombresExactos` extrae todas y **exige que
// sean idénticas**: si difirieran, la vista previa que Daniel mira antes de
// escribir estaría mintiendo.
// ─────────────────────────────────────────────────────────────────────────────

export { normalizarComoSql } from "@/lib/guias/reglas-city-mall";

/** Ruta de la migración, relativa a la raíz del repo. Fuente de las reglas. */
export const MIGRACION_NOMBRES_EXACTOS =
  "supabase/migrations/20260810120000_guias_atar_nombres_exactos.sql";

/** Pareo por el texto escrito en la línea, ya normalizado. */
export interface ReglaNombreExacto {
  cliente: string;
  codigo: string;
}

/** Corta un bloque `VALUES … )` desde el índice de la palabra VALUES. */
function bloqueValues(sql: string, desde: number): string {
  const cierre = sql.indexOf("\n)", desde);
  return sql.slice(desde, cierre === -1 ? sql.length : cierre);
}

function tuplas(bloque: string): ReglaNombreExacto[] {
  const re = /\(\s*'([^']*)'\s*,\s*'(D-\d+)'\s*\)/g;
  const out: ReglaNombreExacto[] = [];
  for (const m of bloque.matchAll(re)) out.push({ cliente: m[1], codigo: m[2] });
  return out;
}

const clave = (r: ReglaNombreExacto): string => `${r.cliente}|${r.codigo}`;

function mismasReglas(a: readonly ReglaNombreExacto[], b: readonly ReglaNombreExacto[]): boolean {
  if (a.length !== b.length) return false;
  const ka = a.map(clave).sort();
  const kb = b.map(clave).sort();
  return ka.every((k, i) => k === kb[i]);
}

/**
 * Extrae las reglas del texto de la migración.
 *
 * Revienta —a propósito, sin devolver nada a medias— si no encuentra reglas o
 * si las copias del PASO 1 y del PASO 2 no coinciden. Fallar ruidoso es lo
 * correcto: un verificador que se degrada en silencio cuando no entiende el
 * SQL da verde sin haber medido nada.
 */
export function leerReglasNombresExactos(sql: string): ReglaNombreExacto[] {
  const bloques: string[] = [];
  let i = sql.indexOf("VALUES");
  while (i !== -1) {
    bloques.push(bloqueValues(sql, i));
    i = sql.indexOf("VALUES", i + 6);
  }

  const grupos = bloques.map(tuplas).filter((g) => g.length > 0);
  if (grupos.length === 0) throw new Error("La migración no tiene reglas de nombre exacto.");
  for (const g of grupos.slice(1)) {
    if (!mismasReglas(grupos[0], g)) {
      throw new Error(
        "Las reglas no son iguales en todos los bloques del SQL — la vista previa no diría la verdad.",
      );
    }
  }
  return grupos[0];
}
