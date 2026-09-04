// ─────────────────────────────────────────────────────────────────────────────
// CLIENTES AUSENTES DE SWITCH — la regla, sin nada de red.
//
// Cuando Switch deja de mandar un cliente, `switch_clientes` lo nota (el sync
// de CXC marca `activo = false` + `ausente_desde`, con guard de lista completa
// — ver `sync-empresa.ts`). Este módulo decide, a partir de esas filas, si el
// cliente está ausente DEL GRUPO ENTERO y desde cuándo; y del otro lado, qué
// filas del directorio se pueden OFRECER en un selector.
//
// Aprobado por Daniel (4-sep-2026, textual: «APROBADO»):
//   · Un cliente que Switch dejó de mandar deja de ofrecerse al buscar, pero
//     NO se borra: guías y facturas viejas siguen mostrando su nombre normal.
//   · En la ficha sí aparece, con rótulo «Ya no está en Switch» y desde cuándo.
//   · Se considera ausente cuando NINGUNA de las 6 empresas del grupo lo
//     manda. Si sigue vivo en una sola, sigue vivo.
//   · Si Switch lo manda de nuevo, se desmarca solo.
//
// 🔴 LA PROTECCIÓN — sin dato no se marca a NADIE. `activo` que no sea el
// boolean `false` (true, null, undefined, columna sin aplicar) cuenta como
// VIVO. Un fallo de Switch, una lectura a medias o una columna pendiente
// jamás pueden vaciar el directorio: como mucho dejan todo como estaba.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que hace falta de una fila de `switch_clientes` para juzgar ausencia. */
export interface FilaEspejoAusencia {
  activo?: boolean | null;
  ausente_desde?: string | null;
}

/** Lo que hace falta de una fila del directorio para saber si se ofrece. */
export interface ConAusencia {
  ausente_desde?: string | null;
}

/**
 * ¿Este código está ausente de Switch EN TODO EL GRUPO?
 *
 * `filas` son TODAS sus filas de `switch_clientes` entre las 6 empresas del
 * grupo. Ausente = cada una dice `activo === false`, literal. Con cero filas
 * NO es ausente: sin evidencia no se marca (los 4 códigos legacy sin fila en
 * `switch_clientes` — D-173, D-200, D-101, D-201 — se quedan como están).
 */
export function esCodigoAusente(filas: readonly FilaEspejoAusencia[]): boolean {
  if (filas.length === 0) return false;
  return filas.every((f) => f.activo === false);
}

/**
 * Desde cuándo está ausente: el `ausente_desde` MÁS RECIENTE de sus filas —
 * el momento en que la ÚLTIMA empresa lo dejó de mandar, que es cuando pasó a
 * estar ausente del grupo. `null` si ninguna fila trae fecha (edge: el caller
 * decide qué poner, sin pisar una marca ya escrita).
 */
export function fechaAusenteDesde(filas: readonly FilaEspejoAusencia[]): string | null {
  let max: string | null = null;
  for (const f of filas) {
    const d = f.ausente_desde ?? null;
    if (d && (!max || d > max)) max = d;
  }
  return max;
}

/**
 * Freno de emergencia del sync: si más de esta fracción del directorio saliera
 * "ausente" en una sola pasada, NO se marca a nadie y se reporta. El caso real
 * son 2 de 147; que de golpe salgan 15+ huele a un dato roto aguas arriba
 * (p. ej. los `activo` corrompidos en bloque), no a que Daniel borró un décimo
 * de sus clientes en Switch el mismo día.
 */
export const MAX_FRACCION_AUSENTES = 0.1;

/** ¿Esta fila del directorio se puede OFRECER en un selector? */
export function esOfrecible(c: ConAusencia): boolean {
  return !c.ausente_desde;
}

/**
 * Deja solo lo ofrecible. Es lo que separa "el directorio" (todo, para nombres
 * de guías viejas y fichas) de "lo que un selector ofrece" (solo vivos).
 */
export function sinAusentesDeSwitch<T extends ConAusencia>(filas: readonly T[]): T[] {
  return filas.filter(esOfrecible);
}
