// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda de texto que IGNORA espacios, acentos y mayúsculas.
//
// 🩸 Por qué existe (27-jul-2026): Daniel escribió "multifashion" en Clientes y
// no encontró nada. El cliente se llama "Multi Fashion Holding" y la búsqueda
// era `nombre.ilike.%q%` — match literal. Medido contra producción:
//     "multifashion"  → 0 resultados
//     "multi fashion" → 1  (D-108)
//     "MULTIFASHION"  → 0
//     "d108"          → 0  (el código es "D-108")
// O sea: el buscador exigía escribir el nombre con los mismos espacios y signos
// que tiene guardado. Nadie escribe así.
//
// REGLA: se compara sobre la forma NORMALIZADA — minúsculas, sin acentos y sin
// nada que no sea letra o número. "Multi Fashion Holding" → "multifashionholding",
// "D-108" → "d108", "Peña" → "pena". Así "multifashion", "multi fashion",
// "MULTIFASHION" y "  Multi   Fashion  " son la MISMA consulta, y "D-108",
// "d108" y "d 108" encuentran igual al cliente por código.
//
// ⚠️ EL CORTE DE 1-2 LETRAS NO ES UN CAPRICHO. Con substring, escribir "a"
// devuelve 142 de los 149 clientes vivos y "sa" devuelve 115: el directorio
// entero, que es lo mismo que no buscar. Por eso con 1 o 2 caracteres se exige
// que el texto esté al PRINCIPIO del nombre / razón social / código
// ("a" → 10 clientes, "ci" → 13). Desde 3 caracteres vale el substring, que es
// lo que la gente espera al escribir un pedazo del nombre. Medido en
// scripts/_probe-clientes-ytd-volumen.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Largo a partir del cual se busca por substring en vez de por prefijo. */
export const LARGO_MINIMO_SUBSTRING = 3;

/**
 * Minúsculas + sin acentos + solo letras y números.
 * "Multi Fashion Holding" → "multifashionholding" · "D-108" → "d108"
 */
export function normalizarBusqueda(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")                  // separa la letra de su tilde
    .replace(/[\u0300-\u036f]/g, "")   // borra las tildes sueltas
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");  // fuera espacios, guiones, puntos, comas, "/"…
}

/**
 * ¿Alguno de los campos coincide con la consulta?
 *
 * Consulta vacía → true (no filtra nada).
 * 1-2 caracteres → tiene que estar al principio de algún campo.
 * 3 o más        → substring en cualquier parte.
 */
export function coincideBusqueda(
  consulta: string | null | undefined,
  campos: (string | null | undefined)[],
): boolean {
  const q = normalizarBusqueda(consulta);
  if (!q) return true;
  const normalizados = campos.map(normalizarBusqueda).filter(Boolean);
  if (q.length < LARGO_MINIMO_SUBSTRING) {
    return normalizados.some(c => c.startsWith(q));
  }
  return normalizados.some(c => c.includes(q));
}
