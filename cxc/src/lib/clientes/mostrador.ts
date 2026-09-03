// ─────────────────────────────────────────────────────────────────────────────
// EL MOSTRADOR — QUIÉN ES, Y POR QUÉ VIVE EN SU PROPIO ARCHIVO
//
// El pseudo-cliente de mostrador (ventas de contado en tienda) es el código
// `TCKCTA`. La identidad es el CÓDIGO, NUNCA el nombre: se llama "Contado" en
// active_shoes/active_wear/joystep, "VENTAS" en fashion_wear/vistana y
// "VENTAS LOCA" —truncado por Switch— en fashion_shoes. Es el único código del
// grupo que no nombra a lo mismo en las seis.
//
// 🩸 POR QUÉ ESTÁ ACÁ Y NO EN `mundos.ts`, donde nació. `mundos.ts` importa el
// cliente de Supabase del SERVIDOR para leer `switch_clientes`, y el consumidor
// que faltaba es una pantalla ("use client"): Ventas › Clientes. Importarlo
// desde ahí arrastraría el cliente de servidor al navegador. Sacar las dos
// líneas puras a su propio archivo es lo que permite que la pantalla use LA
// MISMA definición que el resto del sistema en vez de escribirse la suya — que
// es exactamente lo que había hecho, comparando contra el nombre.
//
// `mundos.ts` lo re-exporta, así que todo lo que ya importaba de ahí sigue
// igual y sigue habiendo UNA sola definición.
// ─────────────────────────────────────────────────────────────────────────────

/** El pseudo-cliente de mostrador, el mismo en las 8 empresas de Switch. */
export const CODIGO_MOSTRADOR = "TCKCTA" as const;

/** ¿Es el pseudo-cliente de mostrador y no una persona/empresa de verdad? */
export function esMostrador(codigo: string | null | undefined): boolean {
  return (codigo ?? "").trim().toUpperCase() === CODIGO_MOSTRADOR;
}
