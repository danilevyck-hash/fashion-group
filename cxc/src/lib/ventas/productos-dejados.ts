// ─────────────────────────────────────────────────────────────────────────────
// QUÉ DEJÓ DE VENDERSE — el reverso de la etiqueta «Nuevo» (5-sep-2026).
//
// Productos ya marcaba en verde lo que NO existía el año pasado y este año sí
// (`DeltaCell` → «Nuevo»). Faltaba lo contrario: lo que el año pasado se vendió
// y este año no se vendió NADA. Es el mismo dato al revés, no estaba en ninguna
// pantalla del sistema, y es el que dice qué se dejó de traer o de ofrecer.
//
// 🔴 NO CUESTA UNA CONSULTA. Las dos ventanas ya viajan: la pantalla pide el
// período actual y el mismo período del año anterior (`?previo=1`) para poder
// pintar la columna de cambio. Esto es la resta entre esas dos listas, hecha en
// el navegador.
//
// 🔑 «SE VENDIÓ 0» Y «NO ESTÁ EN LA LISTA» SON LO MISMO ACÁ, y no siempre lo
// son: una descripción puede llegar con venta 0 por una nota de crédito que
// cancela exactamente lo facturado. Se trata igual a propósito — en los dos
// casos ese producto no dejó plata este período, que es la pregunta.
//
// ⚠️ NO ES «se agotó» NI «se descontinuó»: el sistema no sabe eso. Es
// literalmente «el año pasado en este mismo período vendió $X y en este $0».
// Por eso el rótulo dice lo que se midió y nada más.
// ─────────────────────────────────────────────────────────────────────────────

export interface DejadoDeVender {
  descripcion: string;
  /** Lo que vendió en el MISMO período del año anterior. */
  ventaAntes: number;
}

/**
 * Las descripciones que vendieron el período anterior y este no.
 *
 * @param actual      Venta por descripción del período actual (la tabla).
 * @param previo      Venta por descripción del mismo período del año anterior.
 * @param minimo      Piso para no listar centavos. Por debajo no es una baja,
 *                    es ruido; el mismo criterio que el resto del módulo usa
 *                    para no calcular porcentajes sobre bases ridículas.
 * @returns De MAYOR a MENOR plata perdida: es el orden en el que uno decide
 *          qué mirar primero. El desempate va por nombre para que dos corridas
 *          con los mismos datos den la misma lista.
 */
export function dejoDeVenderse(
  actual: readonly { descripcion: string; venta: number }[],
  previo: Readonly<Record<string, number>>,
  minimo = 100,
): DejadoDeVender[] {
  const vendeHoy = new Set(
    actual.filter((p) => Number.isFinite(p.venta) && p.venta > 0).map((p) => p.descripcion),
  );
  const salida: DejadoDeVender[] = [];
  for (const [descripcion, ventaAntes] of Object.entries(previo)) {
    if (!Number.isFinite(ventaAntes) || ventaAntes < minimo) continue;
    if (vendeHoy.has(descripcion)) continue;
    salida.push({ descripcion, ventaAntes });
  }
  salida.sort((a, b) => b.ventaAntes - a.ventaAntes || a.descripcion.localeCompare(b.descripcion));
  return salida;
}

/** Lo que se dejó de vender, sumado. Es la plata que este período no entró por
 *  esos productos — el número que hace que la lista valga la pena mirarla. */
export function totalDejadoDeVender(filas: readonly DejadoDeVender[]): number {
  return filas.reduce((s, f) => s + f.ventaAntes, 0);
}
