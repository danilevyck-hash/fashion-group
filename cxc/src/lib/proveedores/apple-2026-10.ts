// ─────────────────────────────────────────────────────────────────────────────
// PROVEEDORES «COMO LO HARÍA APPLE» (6-oct-2026). APAGADO hasta que Daniel vea
// el mockup HOY vs RECOMENDACIÓN.
//
// El método que Daniel aprobó en Ventas, CxC, Guías, Reclamos y Clientes: la
// MISMA pantalla con las reglas de docs/diseno.md, sin tableros ni pantallas
// nuevas. Por pantalla:
//   · Lista: arriba, UN número grande (lo que se debe al grupo) con su línea
//     gris («31 proveedores con saldo · Saldo a favor $X») y, a la derecha, la
//     línea de frescura con «Descargar Excel» en texto; las empresas y los
//     proveedores son filas con ›; en el celular, filas de dos renglones y los
//     proveedores tocables de 44 px.
//   · Ficha: el «← Proveedores» en la línea del nombre; el saldo grande con su
//     línea gris; la antigüedad en los MISMOS cuatro tramos de la lista (antes
//     ocho); «Por empresa» en filas de dos renglones, sin la fila «Total» que
//     repetía el número grande.
//   · v2 (Daniel: «veo desorden» en el celular): tramos uno por renglón,
//     nombres con la función común, lo a favor en verde, sin «también en» en
//     la lista; en la ficha «Local · Actualizado» en una línea y sin cortes.
//
// 🔴 NO CAMBIA NINGÚN NÚMERO: todo sale de `buildPorEmpresa`, `repartirEnTramos`
// y `frasePartida`. Los cuatro tramos de la ficha son la MISMA suma que la
// lista. Nunca rojo (`tono.ts`): el dato es EDAD, no mora.
// Apagado = cada pantalla exactamente como estaba.
// Candado: `proveedores-gastos-apple-2026-10.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

import type { SaldoPartido } from "./tramos";

/** `false` = como antes. */
export const PROVEEDORES_APPLE_2026_10 = false;

/**
 * La línea gris bajo el número grande: «31 proveedores con saldo» y, solo si lo
 * hay, «Saldo a favor $X». Sin un cero adentro.
 */
export function lineaCartera(conSaldo: number, saldo: SaldoPartido, fmt: (n: number) => string): string {
  const partes = [`${conSaldo} ${conSaldo === 1 ? "proveedor con saldo" : "proveedores con saldo"}`];
  if (saldo.a_favor > 0) partes.push(`Saldo a favor $${fmt(saldo.a_favor)}`);
  return partes.join(" · ");
}

/** «Último pago $1,200.00 · hace 13 d», o `null` sin pago. */
export function lineaUltimoPago(monto: number | null, dias: number | null, fmt: (n: number) => string): string | null {
  if (monto == null) return null;
  return dias == null ? `Último pago $${fmt(monto)}` : `Último pago $${fmt(monto)} · hace ${dias} d`;
}

/**
 * v2 (6-oct-2026, Daniel: «veo desorden»). Lo a favor va en el verde de la
 * paleta (el de CxC), no en azul, que es de enlace. Lo demás, el tono de siempre.
 */
export const TONO_A_FAVOR_APPLE = "text-emerald-700";

/**
 * El nombre del proveedor como se lee: si Switch lo escribe todo en mayúsculas
 * («THALIA INTERNACIONAL, S.A.») se capitaliza con la función común de nombres;
 * si ya trae minúsculas, tal cual. Las siglas «SA» y «S.A.» no se tocan. Solo
 * cambia lo que se DIBUJA: el amarre y el Excel siguen con el dato.
 */
export function nombreProveedorEnPantalla(nombre: string, capitalizar: (n: string) => string): string {
  if (!nombre || /\p{Ll}/u.test(nombre)) return nombre;
  return capitalizar(nombre).replace(/\bSa\b/g, "SA");
}

/** ¿El contacto repite el nombre del proveedor? Entonces no se dibuja. */
export function contactoRepite(contacto: string | null, nombre: string): boolean {
  const n = (s: string) => s.toLocaleLowerCase("es").replace(/[^\p{L}\p{N}]/gu, "");
  return !!contacto && n(contacto) === n(nombre);
}
