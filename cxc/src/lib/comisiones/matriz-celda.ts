// ─────────────────────────────────────────────────────────────────────────────
// LA CELDA DE LA MATRIZ DE COMISIONES — qué dice cuando no hay nada, y qué dice
// cuando adentro hay un descuento. (módulo PURO)
//
// 🩸 UNA SOLA FORMA DE DECIR «NADA» (6-sep-2026). La misma fila mezclaba `—` y
// `$0.00`, y para quien mira significan lo mismo. Medido contra producción:
//
//   · **Agosto 2026**: la RPC devuelve **14 celdas** y **2 en $0.00** (joystep
//     de DANIEL LEVY y de DEFAULT) — las otras 12 traen un número de verdad.
//   · **Septiembre 2026**: la fila de Reynaldo tiene **4 celdas en $0.00**
//     (Active Shoes, Active Wear, Fashion Wear, y Vistana/Joystep en `—`) y
//     **una sola** con algo que mirar, los −$1.513,08 de Fashion Shoes.
//
// 🔴 GANA EL GUION. Si se hubiera elegido `$0.00`, la fila de septiembre de
// Reynaldo mostraría SEIS ceros alrededor del único número que importa, y la
// matriz entera sería una pared de `$0.00` (las celdas ausentes son la mayoría
// del cuadro). Con el guion, esa fila deja ver exactamente un número. Es la
// misma regla que ya rige en Clientes: **un cero grande se lee como dato roto**.
//
// ⚠️ EL DESCUENTO ROMPE LA REGLA A PROPÓSITO. Una celda que quedó en cero pero
// que lleva un descuento restado adentro SÍ muestra su número: taparla con un
// guion escondería plata.
//
// 🔴 EL DESCUENTO SE VE EN LA CELDA (6-sep-2026). La celda de Reynaldo en
// Fashion Shoes decía `−$1,513.08` y no decía que ahí dentro hay **$1.573,08
// restados**: había que abrir el modal para enterarse. Medido en septiembre
// 2026: bruto **$60,00**, descuento **$1.573,08**, neto **−$1.513,08** → la
// celda dice `$60.00 − $1,573.08` debajo del neto. **Solo donde hay descuento**;
// el resto de las celdas no cambia. El número que se paga no se toca: el
// desglose lo EXPLICA, no lo reemplaza.
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * ¿Esta celda no tiene nada que decir? (→ se dibuja el guion)
 *
 * `undefined` = el vendedor no aparece en esa empresa. `0` = aparece y no dejó
 * comisión. Las dos cosas significan lo mismo para quien mira, así que se dicen
 * igual — salvo que haya un descuento restado adentro.
 */
export function celdaVacia(valor: number | undefined, descuento = 0): boolean {
  if ((descuento ?? 0) > 0) return false;
  return valor === undefined || valor === 0;
}

export interface DesgloseCelda {
  /** Lo que la RPC calculó antes de restar. */
  bruto: number;
  /** Lo que se le restó. Siempre > 0 (si no, no hay desglose). */
  descuento: number;
}

/**
 * El desglose de una celda con descuento, o `null` si no hay ninguno.
 *
 * El bruto se RECONSTRUYE del neto (neto + descuento) porque es lo que viaja: el
 * servidor manda el `comision_total` ya neteado y el `descuento` aplicado. Se
 * redondea a dos por lo mismo que `netearComisiones`: los montos vienen de dos
 * fuentes y sin esto la suma arrastra centavos.
 */
export function desgloseDeCelda(
  neto: number | undefined,
  descuento: number | undefined,
): DesgloseCelda | null {
  const d = descuento ?? 0;
  if (!(d > 0)) return null;
  return { bruto: round2((neto ?? 0) + d), descuento: d };
}
