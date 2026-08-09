// ─────────────────────────────────────────────────────────────────────────────
// COMPARAR DOS NOMBRES DE CLIENTE — módulo PURO (sin base, sin red).
//
// Lo usan dos cosas que tienen que estar de acuerdo:
//   · el candado de la migración que ata por nombre exacto (`guias/reglas-nombres-exactos`)
//   · el motor de sugerencias de la pantalla (`clientes/sugerencias`)
//
// 🔴 LA REGLA DE ORO DE ESTE ARCHIVO: **LOS DÍGITOS NO SE TOCAN.**
//
// `Outlet Duty Free N2`, `N3` y `N4` son TIENDAS DISTINTAS, igual que
// `Sporting Shoes N7` y `Sporting Shoes N 4`. Una normalización que borre o
// ignore los números hace que los tres nombres se vean iguales y mete el
// despacho de una tienda en el negocio de otra — un error que no deja rastro
// (el texto escrito sigue diciendo "N2") y que solo se descubre cuando el
// cliente reclama mercancía que nunca pidió.
//
// Por eso `digitosDe()` existe y se compara SIEMPRE aparte: quitar el sufijo
// legal es una operación sobre LETRAS, y este archivo no tiene una sola línea
// que borre un dígito.
//
// ── Qué es un "sufijo legal", y por qué se quita ────────────────────────────
//
// El personal escribe el nombre de la tienda; `clientes_master` guarda la razón
// social. Medido sobre los 146 clientes D-XXX vivos (9-ago-2026):
//
//     escrito "GRUPO HANNA"        · maestro "Grupo Hanna, S.A."
//     escrito "Petty Shop"         · maestro "Petty Shop, S.A"
//     escrito "Wolf Mall Center"   · maestro "Wolf Mall Center Int"
//     escrito "Dollar Mall S, A"   · maestro "Dollar Mall"        ← al revés
//
// Es la MISMA tienda con y sin la coletilla jurídica, y el último caso muestra
// que la coletilla puede estar de cualquiera de los dos lados.
//
// ⚠️ SE QUITA UNA SOLA VEZ, Y COMO PATRÓN COMPLETO — no token por token.
// `S` y `A` sueltas son letras normales. Quitarlas en bucle desde el final
// convierte `R.J.A.S.A.` (→ "r j a s a") en "r j": se come la J y la R de un
// nombre que sí importa. Sacando el patrón `s a` una vez queda "r j a", que es
// la razón social de "RJA" y lo que permite reconocerla.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las coletillas jurídicas que se ignoran al comparar, medidas contra los 146
 * clientes D-XXX vivos. La lista es CORTA a propósito: cada entrada nueva es
 * una palabra que deja de distinguir dos nombres.
 *
 * ⚠️ `inc` solo cuenta al FINAL. "Fashion City, Inc Ranguni" (D-57) lo lleva en
 * el medio y ahí es parte del nombre.
 */
export const SUFIJOS_LEGALES = [
  "s a", // "S.A." · "S, A" · "S A"
  "sa",
  "inc",
  "int", // "Wolf Mall Center Int"
  "corp",
  "srl",
  "ltda",
  "ltd",
  "cia",
] as const;

const RE_SUFIJO = new RegExp(`\\s(?:${SUFIJOS_LEGALES.join("|")})$`);

/**
 * Minúsculas, sin acentos, y todo lo que no sea letra o dígito pasa a ser un
 * espacio (los espacios de más se colapsan).
 *
 * `"City Moda / Calidonia"` → `"city moda calidonia"`
 * `"R.J.A.S.A."`            → `"r j a s a"`
 * `"Outlet Duty Free N2"`   → `"outlet duty free n2"`  ← el 2 sigue ahí
 */
export function normalizarNombre(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Lo mismo, más la coletilla jurídica del final (UNA vez).
 *
 * `"Grupo Hanna, S.A."`      → `"grupo hanna"`
 * `"Wolf Mall Center Int"`   → `"wolf mall center"`
 * `"Outlet Duty Free N2, S.A."` → `"outlet duty free n2"`
 */
export function sinSufijoLegal(texto: string | null | undefined): string {
  return normalizarNombre(texto).replace(RE_SUFIJO, "").trim();
}

/**
 * TODOS los dígitos del texto, en orden y pegados. Es la parte que NUNCA se
 * puede ignorar al comparar dos nombres.
 *
 * `"Outlet Duty Free N2"`  → `"2"`
 * `"Centro Dollar 1,2,3,"` → `"123"`
 * `"Centro Dollar 123"`    → `"123"`   ← la misma tienda, escrita distinto
 * `"Sporting Shoes N 4"`   → `"4"`
 * `"Grupo Hanna"`          → `""`
 */
export function digitosDe(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\D/g, "");
}

/** Las palabras (solo letras) de un nombre, ya sin la coletilla jurídica. */
export function palabrasDe(texto: string | null | undefined): string[] {
  return sinSufijoLegal(texto)
    .split(" ")
    .map((p) => p.replace(/[0-9]/g, ""))
    .filter(Boolean);
}

/** Las letras pegadas, sin espacios ni coletilla. `"r j a s a"` → `"rja"`. */
export function letrasPegadas(texto: string | null | undefined): string {
  return palabrasDe(texto).join("");
}

/**
 * 🔴 **LA REGLA DE LAS PAREJAS SEGURAS.**
 *
 * Dos nombres son la MISMA tienda —con la certeza que hace falta para
 * escribirlo en la base sin que nadie lo revise— solo si:
 *
 *   1. sus **dígitos son idénticos** (N2 ≠ N3 ≠ N4, y ninguno contra ninguno), y
 *   2. sus letras coinciden **EXACTO** una vez quitada la coletilla jurídica.
 *
 * No hay parecido, ni distancia de edición, ni "es casi igual". Lo que no pase
 * estas dos condiciones se atará a mano desde la pantalla, con una persona
 * mirando — para eso está el motor de SUGERENCIAS, que es otra cosa y nunca
 * escribe nada.
 */
export function esParejaSegura(
  escrito: string | null | undefined,
  nombreCliente: string | null | undefined,
): boolean {
  // Los dígitos se comparan sobre el texto CRUDO, no sobre el ya normalizado.
  // Es a propósito: si algún día `sinSufijoLegal` empezara a comerse un "N2",
  // compararlos después no lo notaría — este chequeo sí, y deja el pareo en
  // falso en vez de mezclar dos tiendas.
  if (digitosDe(escrito) !== digitosDe(nombreCliente)) return false;
  const a = sinSufijoLegal(escrito);
  const b = sinSufijoLegal(nombreCliente);
  if (!a || !b) return false;
  return a === b;
}
