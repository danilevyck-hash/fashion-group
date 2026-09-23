// ============================================================================
// BUSCAR TEXTO — normalizar y comparar POR PALABRA. Módulo PURO.
//
// 🩸 Nació el 22-sep-2026, con el rediseño de Marketing. El buscador de
// proyectos comparaba con `includes` sobre el texto crudo, así que escribir
// **«nova»** traía **«Renovación»** — la palabra la lleva adentro. Medido
// contra los 25 proyectos reales de producción ese día:
//
//   término        includes (lo de hoy)   por palabra      qué deja fuera
//   ─────────────────────────────────────────────────────────────────────────
//   nova                    2                   1          Renovación
//   d                      21                   6          los 15 «Remodelación»
//   remodel · city · frontera · mall · lux · j · plaza · impulsadora ·
//   hanna · renovacion · muebles · apertura → IGUAL con las dos reglas.
//
// O sea: de 14 términos medidos, 12 dan exactamente lo mismo y los 2 que
// cambian, cambian para bien.
//
// 🔴 LA REGLA: una palabra del texto tiene que EMPEZAR con lo que se escribió.
// «nova» encuentra «Nova Lux» y no «Renovación»; «city mall» encuentra «City
// Mall David» porque la consulta también se compara normalizada y entera.
//
// ⚠️ NO VALE PARA NÚMEROS DE FACTURA, y está medido: 79 de las 108 facturas
// tienen ceros a la izquierda («0000064948»), así que buscar «64948» por
// palabra no encuentra nada (4 de 5 números probados quedaban en cero). Para
// eso está `coincideSubcadena`, que es la regla de hoy y no se toca.
// ============================================================================

/**
 * Minúsculas, sin acentos, y todo lo que no sea letra o número convertido en
 * UN espacio. «Nova Lux, S.A.» → «nova lux s a». «D-25» → «d 25».
 */
export function normalizarBusqueda(valor: unknown): string {
  return String(valor ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * 🔴 ¿Alguna palabra del texto EMPIEZA con lo que se escribió? Igualdad sobre
 * el normalizado, nunca por parecido: no hay distancia de edición ni fonética.
 *
 *   coincidePorPalabra("Nova Lux, S.A.", "nova")  → true
 *   coincidePorPalabra("Renovación",     "nova")  → false
 *   coincidePorPalabra("City Mall David","city mall") → true
 *
 * Consulta vacía → `false`: quien llama decide qué hacer sin término.
 */
export function coincidePorPalabra(texto: unknown, consulta: unknown): boolean {
  const c = normalizarBusqueda(consulta);
  if (c.length === 0) return false;
  const t = normalizarBusqueda(texto);
  if (t.length === 0) return false;
  return ` ${t}`.includes(` ${c}`);
}

/**
 * Subcadena EXACTA sobre el normalizado. Es lo que se usa para un número de
 * documento, donde el tramo del medio o el final sí es lo que la gente teclea.
 */
export function coincideSubcadena(texto: unknown, consulta: unknown): boolean {
  const c = normalizarBusqueda(consulta);
  if (c.length === 0) return false;
  const t = normalizarBusqueda(texto);
  if (t.length === 0) return false;
  return t.includes(c);
}

/** ¿Alguno de estos textos tiene una palabra que empiece con la consulta? */
export function algunoCoincidePorPalabra(
  textos: ReadonlyArray<unknown>,
  consulta: unknown,
): boolean {
  return textos.some((t) => coincidePorPalabra(t, consulta));
}
