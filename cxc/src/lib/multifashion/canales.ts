// ─────────────────────────────────────────────────────────────────────────────
// EL CANAL DE UNA VENTA: tienda o redes (18-sep-2026).
//
// Daniel quiere medir lo que Multifashion vende por redes sociales (WhatsApp e
// Instagram). Creó en Switch un vendedor aparte, «REDES Sheynee», y Sheynee
// Batista es la única que vende por ahí. Su regla, textual: *«tendría que
// sumarse ambos vendedores para lo de la comisión ya que sigue siendo la misma
// persona»* · *«quiero el sistema limpio y minimalista»*.
//
// ── CÓMO SE RESUELVE, Y DÓNDE ────────────────────────────────────────────────
// En la base, y por CÓDIGO. `multifashion_vendedora_alias` (el amarre código →
// persona que ya juntaba a Ana, Cindy y Yeisibeth) gana una columna `canal`:
// «el código X es el canal redes de la persona Y». La vista lo expone como
// `vendedor_canal` y el ranking (`multifashion_vendedoras_v5`) sigue agrupando
// por persona —UNA fila, comisión y tickets JUNTOS— y en esa fila manda
// `por_canal`: `{ redes: 1717.73 }` solo cuando un código con canal vendió en
// el período. Para las demás vendedoras viene `null` y no se dibuja nada.
//
// 🔴 EL CANAL NUNCA SE DEDUCE DEL NOMBRE. Acá no entra el nombre de nadie:
// buscar «REDES» en un texto sería adivinar por parecido, y esta casa no
// adivina (CLAUDE.md, «nada por parecido»). Lo que se muestra sale de un dato
// escrito a mano en la tabla, o no se muestra.
//
// 🔴 LO QUE SE PAGA NO PASA POR ACÁ. La comisión y el bono los calcula la
// base sobre el total junto; este módulo solo ARMA UN TEXTO para la pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtMoney } from "@/lib/ventas/format";

/**
 * Lista CERRADA de canales aparte de la tienda, con su rótulo en pantalla.
 * Es espejo del CHECK de `multifashion_vendedora_alias.canal` (migración
 * `20261209120000`): un canal nuevo entra por migración y por acá, a la vez.
 */
export const CANALES = {
  redes: "redes",
} as const;

export type Canal = keyof typeof CANALES;

/** Cómo se llama en pantalla lo que NO tiene canal: el mostrador. */
export const ROTULO_TIENDA = "tienda";

/** Lo que la RPC manda en la fila de una vendedora: canal → ventas. */
export type VentasPorCanal = Partial<Record<Canal, number | string | null>>;

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * El desglose de una fila del ranking: «tienda $7,400.00 · redes $1,717.73».
 *
 * `null` cuando no hay nada que desglosar —`por_canal` vacío o ausente—, que es
 * el caso de todas las vendedoras menos la que vende por redes. La pantalla no
 * dibuja nada con `null`: a nadie se le agrega una línea que no dice nada.
 *
 * La tienda se DERIVA: es el total menos lo de los canales, así que las partes
 * suman exactamente la fila. No se pide un número más a la base para eso.
 */
export function desgloseCanales(
  ventas: number,
  porCanal: VentasPorCanal | null | undefined,
): string | null {
  if (porCanal == null) return null;
  const partes: string[] = [];
  let enCanales = 0;
  for (const canal of Object.keys(CANALES) as Canal[]) {
    const crudo = porCanal[canal];
    if (crudo == null) continue;
    const monto = Number(crudo);
    if (!Number.isFinite(monto)) continue;
    enCanales += monto;
    partes.push(`${CANALES[canal]} ${fmtMoney(centavos(monto))}`);
  }
  if (partes.length === 0) return null;
  const tienda = centavos(ventas - enCanales);
  return [`${ROTULO_TIENDA} ${fmtMoney(tienda)}`, ...partes].join(" · ");
}
