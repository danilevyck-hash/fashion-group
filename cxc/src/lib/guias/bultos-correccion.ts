// ─────────────────────────────────────────────────────────────────────────────
// LOS BULTOS QUE BODEGA CUENTA AL DESPACHAR.  (módulo PURO)
//
// Daniel, 5-sep-2026: *«porque bodega si al despachar cuentan más bultos de lo
// que puso la secretaria, quiero que lo pueda cambiar en caso de algún error»*
// y, sobre dejar rastro: *«¿queda registro?»* → sí.
//
// 🔴 ESTO NO AFLOJA EL CANDADO DE SIEMPRE. Los bultos de una guía **ya
// despachada** siguen sin tocarse — Daniel: *«es lo que el transportista
// firmó»*—: no están en `campos-editables.ts` y el PUT rechaza una Completada
// entera. Lo que se abre es la ventana ANTERIOR a la firma: mientras la guía
// está pendiente, quien va a despacharla puede corregir la cuenta que hizo la
// secretaria, porque es quien tiene los bultos delante.
//
// 🔴 Y SE ESCRIBE POR COLUMNA, NUNCA POR `items` DEL PUT. `items` es un
// REEMPLAZO COMPLETO: borra los renglones e inserta otros con ids nuevos, y en
// pleno despacho eso le rota el id a cada línea y tira el trabajo de atar
// clientes. Es el mismo camino que ya usa `items_guia_transp` desde el
// 17-ago-2026, no uno nuevo.
//
// ⚠️ EL RASTRO NO SALE EN EL PAPEL. En la guía impresa, el PDF y el Excel va el
// número FINAL y nada más: el documento dice cuántos bultos viajaron, no la
// historia de cómo se contaron. El rastro se ve en pantalla (la línea en vivo
// mientras se despacha, y la línea discreta después) y en la bitácora.
// ─────────────────────────────────────────────────────────────────────────────

/** Un renglón, reducido a lo que este módulo mira. */
export interface RenglonBultos {
  id?: string | null;
  bultos?: number | null;
  /** Lo que había ANTES de la primera corrección. `null` = nunca se corrigió. */
  bultos_original?: number | null;
  /** Quién corrigió (el nombre de la sesión). */
  bultos_corregido_por?: string | null;
}

/** Una corrección lista para viajar: UNA columna de UNA línea. */
export interface CorreccionDeBultos {
  id: string;
  bultos: number;
}

/**
 * ¿Se pueden corregir los bultos en esta pantalla? Las dos condiciones, y las
 * dos son necesarias: la guía todavía NO salió, y quien mira puede despacharla.
 * Un vendedor (solo lectura) o una guía firmada devuelven `false`.
 */
export function puedeCorregirBultos(despachada: boolean, puedeDespachar: boolean): boolean {
  return !despachada && puedeDespachar;
}

/**
 * Normaliza lo que se teclea en la caja de bultos: entero ≥ 0. Un texto que no
 * es número, o un negativo, valen 0 — igual que la caja del formulario de alta.
 */
export function bultosTecleados(v: string | null | undefined): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Las correcciones que de verdad hay que mandar: solo los renglones **con id**
 * cuyo número CAMBIÓ. Mandar los que no cambiaron sería escribir por escribir —
 * la misma regla que ya aplica el guardado del formulario.
 */
export function correccionesDeBultos(
  items: readonly RenglonBultos[],
  tecleados: readonly number[],
): CorreccionDeBultos[] {
  const salida: CorreccionDeBultos[] = [];
  items.forEach((it, i) => {
    const id = typeof it.id === "string" ? it.id : "";
    if (!id) return;
    const antes = Number(it.bultos ?? 0) || 0;
    const ahora = Number(tecleados[i] ?? antes) || 0;
    if (ahora !== antes) salida.push({ id, bultos: ahora });
  });
  return salida;
}

/**
 * Los bultos que va a tener cada renglón DESPUÉS de aplicar las correcciones —
 * lo que el servidor tiene que contar para decidir si la guía puede salir. Sin
 * esto, corregir el único renglón de 0 a 5 seguiría chocando contra «no se
 * puede despachar una guía con 0 bultos».
 */
export function bultosDespuesDeCorregir(
  items: readonly RenglonBultos[],
  correcciones: readonly CorreccionDeBultos[],
): number {
  const porId = new Map(correcciones.map((c) => [c.id, c.bultos]));
  return items.reduce((suma, it) => {
    const id = typeof it.id === "string" ? it.id : "";
    const v = id && porId.has(id) ? (porId.get(id) as number) : Number(it.bultos ?? 0) || 0;
    return suma + (Number.isFinite(v) ? v : 0);
  }, 0);
}

/** Cómo se nombra en pantalla a quien está corrigiendo, por su rol. */
const PALABRA_POR_ROL: Record<string, string> = {
  bodega: "bodega",
  secretaria: "secretaría",
  admin: "administración",
};

export function quienCorrige(rol: string | null | undefined): string {
  return PALABRA_POR_ROL[String(rol ?? "").trim()] ?? "quien despacha";
}

/**
 * La línea EN VIVO, mientras se despacha: «↑ 7 → 8, bodega». Vacía cuando el
 * número no cambió — no se acusa de corregir a quien solo miró la caja.
 */
export function textoCorreccionEnVivo(
  antes: number | null | undefined,
  ahora: number | null | undefined,
  rol: string | null | undefined,
): string {
  const a = Number(antes ?? 0) || 0;
  const b = Number(ahora ?? 0) || 0;
  if (a === b) return "";
  return `${b > a ? "↑" : "↓"} ${a} → ${b}, ${quienCorrige(rol)}`;
}

/**
 * La línea DESPUÉS, discreta: «bultos corregidos por Bodega: 7 → 8».
 * `null` cuando ese renglón nunca se corrigió (o cuando la migración todavía no
 * corrió y las columnas no llegan: sin dato no se afirma nada).
 */
export function textoCorreccionGuardada(it: RenglonBultos): string | null {
  const original = it.bultos_original;
  if (original == null) return null;
  const ahora = Number(it.bultos ?? 0) || 0;
  const antes = Number(original) || 0;
  if (antes === ahora) return null;
  const quien = String(it.bultos_corregido_por ?? "").trim();
  return quien
    ? `Bultos corregidos por ${quien}: ${antes} → ${ahora}`
    : `Bultos corregidos: ${antes} → ${ahora}`;
}
