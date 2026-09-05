// Filtro por tramo + orden de la lista de CXC — UNA sola fuente para escritorio
// (KpiCards + ClientTable) y móvil (PanelCxcMobile).
//
// Por qué existe (27-jul-2026, pedido de Daniel: "los card de cxc por buckets al
// tocarlo debe de acomodar las cxc en orden de la deuda del bucket no?"):
// la píldora de tramo FILTRABA pero no reordenaba. Al tocar "121d+" quedaban los
// clientes con deuda vieja, pero seguían ordenados por saldo TOTAL — o sea que el
// que más debe EN ESE TRAMO podía no estar arriba, que es justo lo que se fue a
// buscar. Reordenar era un segundo control aparte (clic en el título de la
// columna): dos controles para una sola intención.
//
// El orden NO es un estado paralelo al filtro: se DERIVA de él, y el clic en el
// título de la columna es un override anclado al tramo activo (ver
// `ordenEfectivo`). Con eso los dos controles no pueden contradecirse — la flecha
// del encabezado siempre describe el orden real de la tabla.
//
// Acá no se calcula ni un centavo: esto solo filtra y ordena.

export type AgingKey = "current" | "watch" | "overdue";
export type RiskFilter = "all" | AgingKey;
export type SortKey = "name" | AgingKey | "total";
export type SortDir = "asc" | "desc";

export interface Orden {
  key: SortKey;
  dir: SortDir;
}

/**
 * Override de orden hecho a mano (clic en el título de una columna), ANCLADO al
 * tramo que estaba activo cuando se hizo. Al cambiar de tramo deja de aplicar y
 * el orden vuelve a derivarse del tramo nuevo.
 */
export interface OrdenOverride extends Orden {
  risk: RiskFilter;
}

/**
 * Orden natural de cada píldora: la de un tramo ordena por ESE tramo,
 * "Total pendiente" vuelve al orden por saldo total. Siempre de mayor a menor:
 * la lista es de cobro, arriba va lo que más pesa.
 */
export function ordenParaRiskFilter(risk: RiskFilter): Orden {
  return { key: risk === "all" ? "total" : risk, dir: "desc" };
}

/**
 * Orden que rige de verdad. El override manda solo mientras siga siendo el
 * mismo tramo con el que se hizo; si no, gana el orden derivado de la píldora.
 * Es una derivación pura (sin efectos), así que un deep link `?risk=overdue` o un
 * back/forward llegan ya ordenados por su tramo.
 */
export function ordenEfectivo(risk: RiskFilter, override: OrdenOverride | null): Orden {
  if (override && override.risk === risk) return { key: override.key, dir: override.dir };
  return ordenParaRiskFilter(risk);
}

/**
 * Clic en el título de una columna: si ya se ordena por ella, invierte el
 * sentido; si no, ordena por ella (nombre A→Z, montos de mayor a menor).
 */
export function ordenAlTocarTitulo(actual: Orden, key: SortKey): Orden {
  if (actual.key === key) return { key, dir: actual.dir === "desc" ? "asc" : "desc" };
  return { key, dir: key === "name" ? "asc" : "desc" };
}

/**
 * Clic en una píldora: tocar la que ya está activa la apaga (vuelve a "Total
 * pendiente"). Sin esto había que recargar para salir del filtro.
 */
export function siguienteRiskFilter(actual: RiskFilter, tocada: RiskFilter): RiskFilter {
  return actual === tocada ? "all" : tocada;
}

/** Cliente con los 3 tramos ya agregados (lo que consumen tabla y cards). */
export interface ClienteOrdenable {
  nombre_normalized: string;
  current: number;
  watch: number;
  overdue: number;
  total: number;
}

/**
 * ¿Este cliente pertenece al tramo elegido? Un cliente sin deuda en el tramo NO
 * aparece. "Por vencer" es el cliente cuya deuda está ENTERA dentro del plazo
 * (nada en 91-120 ni en 121+), no el que tiene algo ahí.
 */
export function pasaFiltroRiesgo(c: ClienteOrdenable, risk: RiskFilter): boolean {
  if (risk === "current") return c.total > 0 && c.overdue === 0 && c.watch === 0;
  if (risk === "watch") return c.watch > 0;
  if (risk === "overdue") return c.overdue > 0;
  return true;
}

function montoDe(c: ClienteOrdenable, key: SortKey): number {
  if (key === "current") return c.current;
  if (key === "watch") return c.watch;
  if (key === "overdue") return c.overdue;
  return c.total;
}

/**
 * Comparador único de la lista. Una regla manda SIEMPRE, antes del orden
 * elegido: los saldos a favor (negativos) van al final — no son deuda por
 * cobrar.
 *
 * 🩸 Había una segunda, «los favoritos ⭐ arriba», y se fue el 4-sep-2026 con
 * la estrella: `cxc_favorites` tuvo **0 filas en toda su historia**, así que la
 * regla nunca movió una fila y el `esFavorito` que la alimentaba obligaba a las
 * dos carteras a cargar un endpoint que a un vendedor le contestaba 403.
 */
export function compararClientes(
  a: ClienteOrdenable,
  b: ClienteOrdenable,
  opts: { orden: Orden }
): number {
  const aNeg = a.total < 0 ? 1 : 0;
  const bNeg = b.total < 0 ? 1 : 0;
  if (aNeg !== bNeg) return aNeg - bNeg;

  const porNombre = a.nombre_normalized.localeCompare(b.nombre_normalized, "es", { sensitivity: "base" });
  if (opts.orden.key === "name") return opts.orden.dir === "asc" ? porNombre : -porNombre;

  const va = montoDe(a, opts.orden.key);
  const vb = montoDe(b, opts.orden.key);
  if (va !== vb) return opts.orden.dir === "asc" ? va - vb : vb - va;
  // Desempate estable por nombre cuando los montos empatan.
  return porNombre;
}

/** Ordena una copia (no muta la lista que recibe). */
export function ordenarClientes<T extends ClienteOrdenable>(
  lista: T[],
  opts: { orden: Orden }
): T[] {
  return [...lista].sort((a, b) => compararClientes(a, b, opts));
}

/**
 * Cómo se lee el orden activo en pantalla ("ordenados por 121d+"). Los rangos
 * son los mismos de las columnas para que el texto y el encabezado digan igual.
 */
export function etiquetaOrden(key: SortKey): string {
  if (key === "name") return "nombre";
  if (key === "current") return "0-90d";
  if (key === "watch") return "91-120d";
  if (key === "overdue") return "121d+";
  return "total";
}
