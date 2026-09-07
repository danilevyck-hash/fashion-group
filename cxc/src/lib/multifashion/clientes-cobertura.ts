// ─────────────────────────────────────────────────────────────────────────────
// MULTIFASHION › CLIENTES — cuánto de la tienda tiene nombre y cuánto no.
//
// Daniel pidió medirlo y ponerlo arriba, en UNA línea:
//
//     19% de los tiquetes con nombre — el 27% de la venta
//
// (medido para agosto 2026: 224 de 1.152 tiquetes y $14.287,83 de $53.148,61).
// Es la primera cosa que hay que saber antes de leer el ranking: el mostrador
// anónimo es la mayor parte de la tienda, y un top de clientes que no diga qué
// porción cubre se lee como si fuera toda la venta.
//
// 🔴 SE RECALCULA PARA EL PERÍODO ELEGIDO — nunca se escribe fijo.
//
// ⚠️ EL DENOMINADOR ES EL MISMO QUE YA USABA LA PANTALLA (`pct_identificado` del
// RPC): identificadas ÷ (identificadas + anónimas). No se estrena una segunda
// definición de «la venta del período» para que dos números de la misma pantalla
// no puedan contradecirse.
//
// § 0 del diccionario: los porcentajes van SIN decimal.
// ─────────────────────────────────────────────────────────────────────────────

export interface CoberturaEntrada {
  ventas_identificadas?: number | null;
  ventas_anonimas?: number | null;
  tickets_identificados?: number | null;
  tickets_anonimos?: number | null;
}

export interface Cobertura {
  /** 0..100, sin decimal. `null` cuando no hubo nada que medir. */
  pctTickets: number | null;
  pctVentas: number | null;
  ticketsConNombre: number;
  ticketsTotal: number;
  /** La línea ya armada, o `null` si el período no tuvo ni un tiquete. */
  texto: string | null;
}

function pct(parte: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.round((parte / total) * 100);
}

export function coberturaDeClientes(r: CoberturaEntrada | null | undefined): Cobertura {
  const vIdent = Number(r?.ventas_identificadas ?? 0) || 0;
  const vAnon = Number(r?.ventas_anonimas ?? 0) || 0;
  const tIdent = Number(r?.tickets_identificados ?? 0) || 0;
  const tAnon = Number(r?.tickets_anonimos ?? 0) || 0;

  const ticketsTotal = tIdent + tAnon;
  const pctTickets = pct(tIdent, ticketsTotal);
  const pctVentas = pct(vIdent, vIdent + vAnon);

  // 🔴 Cuando el sistema no puede saber, se abstiene: sin tiquetes no hay
  // porcentaje, y un «0% — 0%» se leería como dato roto.
  const texto =
    pctTickets == null || pctVentas == null
      ? null
      : `${pctTickets}% de los tiquetes con nombre — el ${pctVentas}% de la venta`;

  return { pctTickets, pctVentas, ticketsConNombre: tIdent, ticketsTotal, texto };
}

/**
 * Cuántas filas se ven antes de tocar «Ver los N».
 *
 * Medido el 6-sep-2026: septiembre trae **33 clientes identificados** y la lista
 * los dibujaba los 33 de una, bajando hasta $20,72. Diez alcanzan para leer el
 * ranking; el resto está a un toque.
 */
export const FILAS_CLIENTES_AL_ABRIR = 10;
