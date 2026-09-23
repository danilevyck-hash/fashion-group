// ============================================================================
// Marketing — UN PERÍODO CERRADO ES UNA FILA, AUNQUE LO COMPARTAN DOS MARCAS
// (22-sep-2026). Módulo PURO: sin React, sin Supabase, sin fetch.
//
// 🩸 EL DEFECTO. En `mk_periodos` hay UN solo período cerrado: «mid 2026»,
// con `proveedor_key = 'pvh'` — PVH es la casa que factura Tommy Hilfiger y
// Calvin Klein. La pestaña «Cerrados» lo partía POR MARCA y dibujaba DOS
// filas con el mismo nombre y la misma fecha:
//
//     mid 2026 · Calvin Klein · Cerrado el 11 ago 2026 ·  $46,462.14
//     mid 2026 · Tommy Hilfiger · Cerrado el 11 ago 2026 · $94,104.43
//
// …y el contador decía «Cerrados 2». Daniel, viéndolo: *«doble?»*. No eran
// dos cierres: era uno, visto dos veces.
//
// 🔴 LO QUE NUNCA SE HACE: SUMAR LAS DOS MARCAS. Cada marca recibió su ZIP
// aparte y le reporta a su encargado. Por eso un grupo NO tiene un campo
// `total` — no existe, y hay candado que barre este archivo buscándolo. La
// regla del módulo es la de siempre: *«los gastos de las marcas NUNCA se
// suman entre sí»*.
//
// 🔑 LAS MARCAS DE UN PERÍODO SALEN DE SUS DOCUMENTOS, no de una lista
// escrita a mano: llegan en las filas que ya arma el agregador
// (`resumen-bloques.ts › cerrados`, una por período·marca). Acá solo se
// juntan por el id del período.
//
// ⚠️ Los 5 períodos ABIERTOS ya son uno por marca (`proveedor_key` = TH · CK ·
// KL · RBK · J), así que esto solo se nota en ese cierre viejo. Ningún número
// cambia: los montos son exactamente los que ya salían.
// ============================================================================

import type { FilaCerrada } from "./portada-rediseno";

/**
 * Cómo se llama en pantalla la casa que agrupa varias marcas
 * (`mk_periodos.proveedor_key`).
 *
 * 🔴 TABLA CHICA Y CERRADA, por CLAVE exacta en minúsculas. Una clave que no
 * esté acá no se adivina: la fila se dibuja como siempre, con el nombre del
 * período y nada más. Las claves de UNA sola marca (`TH`, `CK`, `KL`, `RBK`,
 * `J`) no entran: cuando el período es de una marca, la casa no se nombra.
 */
const NOMBRE_POR_PROVEEDOR: ReadonlyMap<string, string> = new Map([
  ["pvh", "PVH"],
]);

/** El nombre visible de una casa, o `null` si no se conoce. */
export function nombreDeProveedor(key: string | null | undefined): string | null {
  const k = String(key ?? "").trim().toLowerCase();
  if (!k) return null;
  return NOMBRE_POR_PROVEEDOR.get(k) ?? null;
}

/** Lo que le tocó a UNA marca dentro de un período cerrado. */
export interface MontoDeMarca {
  bloqueKey: string;
  marcaNombre: string;
  /** Lo reportado de esa marca en ese período. */
  total: number;
  /** Lo apagado con «¿Se reporta a la marca?»: se dice, nunca se suma. */
  noReportado: number;
}

/**
 * Un período cerrado, con sus marcas adentro.
 *
 * 🔴 SIN `total`. Un grupo de dos marcas no tiene un número propio, y
 * agregárselo sería inventar el total del grupo que este módulo existe para
 * no tener.
 */
export interface GrupoCerrado {
  /** Id del período en `mk_periodos`. */
  id: string;
  /** El nombre que se ve: el que se le puso al cerrar, o el de siempre. */
  nombre: string;
  /** El nombre de la casa (`proveedor_key`), o `null` si no se conoce. */
  proveedorNombre: string | null;
  cerradoEn: string | null;
  notaCredito: string | null;
  /** Una entrada por marca, alfabética. Con una sola, la fila de siempre. */
  marcas: MontoDeMarca[];
}

/** ¿Este período lo comparten dos marcas o más? */
export function esCompartido(g: Pick<GrupoCerrado, "marcas">): boolean {
  return g.marcas.length > 1;
}

/**
 * Junta las filas de «Cerrados» por PERÍODO.
 *
 * Conserva el orden en que llegan (`filasCerradas` ya las trae de la más
 * reciente a la más vieja) y ordena las marcas de cada período por nombre,
 * para que la fila se lea igual en cada carga.
 */
export function agruparCerradosPorPeriodo(
  filas: ReadonlyArray<FilaCerrada>,
): GrupoCerrado[] {
  const grupos = new Map<string, GrupoCerrado>();
  for (const f of filas) {
    const id = String(f.id ?? "").trim();
    if (!id) continue;
    let g = grupos.get(id);
    if (!g) {
      g = {
        id,
        nombre: f.nombre,
        proveedorNombre: nombreDeProveedor(f.proveedorKey),
        cerradoEn: f.cerradoEn ?? null,
        notaCredito: f.notaCredito ?? null,
        marcas: [],
      };
      grupos.set(id, g);
    }
    g.marcas.push({
      bloqueKey: f.bloqueKey,
      marcaNombre: f.marcaNombre,
      total: f.total,
      noReportado: f.noReportado,
    });
  }
  const out = [...grupos.values()];
  for (const g of out) {
    g.marcas.sort((a, b) => a.marcaNombre.localeCompare(b.marcaNombre, "es"));
  }
  return out;
}

/**
 * El título de la fila: «mid 2026 · PVH» cuando el período lo comparten dos
 * marcas y la casa se conoce; el nombre pelado en cualquier otro caso.
 */
export function tituloDelGrupo(g: GrupoCerrado): string {
  if (esCompartido(g) && g.proveedorNombre) return `${g.nombre} · ${g.proveedorNombre}`;
  return g.nombre;
}

/** «Calvin Klein + Tommy Hilfiger» — o el nombre solo, con una marca. */
export function marcasDelGrupo(g: GrupoCerrado): string {
  return g.marcas.map((m) => m.marcaNombre).join(" + ");
}

/** «A» · «A y B» · «A, B y C». */
export function unirNombres(nombres: ReadonlyArray<string>): string {
  const xs = nombres.filter((n) => String(n ?? "").trim().length > 0);
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/**
 * Lo que dice la fila del cerrado ADENTRO de una marca: «parte Tommy
 * Hilfiger · el resto es de Calvin Klein». Vacío si el período es solo suyo.
 */
export function textoParteDeLaMarca(
  marcaNombre: string,
  otrasMarcas: ReadonlyArray<string>,
): string {
  const resto = unirNombres(otrasMarcas);
  if (!resto) return "";
  return `parte ${marcaNombre} · el resto es de ${resto}`;
}

/**
 * Las OTRAS marcas que comparten un período cerrado, por nombre.
 *
 * Sale de las mismas filas del agregador (una por período·marca): si el
 * período es solo de esta marca, devuelve la lista vacía.
 */
export function marcasCompaneras(
  cerrados: ReadonlyArray<{ id: string | null; bloqueKey: string; bloqueNombre: string }>,
  periodoId: string | null,
  bloqueKey: string,
): string[] {
  const id = String(periodoId ?? "").trim();
  if (!id) return [];
  const otras = cerrados
    .filter((c) => String(c.id ?? "") === id && c.bloqueKey !== bloqueKey)
    .map((c) => c.bloqueNombre);
  return [...new Set(otras)].sort((a, b) => a.localeCompare(b, "es"));
}
