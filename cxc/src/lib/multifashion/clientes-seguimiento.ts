// ─────────────────────────────────────────────────────────────────────────────
// LA LISTA DE SEGUIMIENTO — a quién le escribe la tienda, y en qué orden.
// Módulo PURO: el orden, los tres chips y el renglón, sin base de datos.
//
// Daniel, 16-sep-2026: *«¿no prefieres mantenerlo más minimalista para
// vendedoras de tercer mundo?»* y *«una vendedora no ordena: abre y baja»*.
//
// 🔴 LA FILA LLEVA CUATRO COSAS Y NADA MÁS: el nombre, hace cuántos días no
// compra, si ya le escribieron y el botón de WhatsApp. Lo que salió de la fila
// no se perdió: se ve tocando el nombre. Una sola fila, IGUAL en el teléfono y
// en la computadora — se fue el diseño doble de tabla ancha en escritorio y
// fichas en celular.
//
// 🔴 NO HAY ORDEN POR ENCABEZADO. ⚠️ Esto REEMPLAZA lo que Daniel había pedido
// el 15-sep («sort última compra» y por último contacto): al ver el mockup
// cambió de opinión, y manda esto. La lista viene ya ordenada del que más
// tiempo lleva sin comprar y no se puede reordenar.
// ─────────────────────────────────────────────────────────────────────────────

import { diasDesdeContacto, textoUltimoContacto, type UltimoContacto } from "./contacto-registro";
import type { ClienteUniverso } from "./clientes-universo";

/**
 * Los TRES chips. Lista cerrada y en el orden en que se dibujan.
 *
 * 🔴 «Frecuentes» se RETIRÓ (era el cuarto). Daniel: el que compra seguido no
 * necesita que lo busquen — ese chip es para analizar, no para llamar. La
 * TARJETA «Frecuentes» de arriba no se tocó: eso es otra cosa.
 */
export const CHIPS = ["no_vuelven", "nuevos", "todos"] as const;
export type Chip = (typeof CHIPS)[number];

/** El que abre. Daniel: *«lo usaré al principio más a los viejos»*. */
export const CHIP_INICIAL: Chip = "no_vuelven";

export const ROTULO_CHIP: Record<Chip, string> = {
  no_vuelven: "No vuelven",
  nuevos: "Nuevos",
  todos: "Todos",
};

export function esChip(v: unknown): v is Chip {
  return typeof v === "string" && (CHIPS as readonly string[]).includes(v);
}

/**
 * La base de la lista: los que YA COMPRARON.
 *
 * 🔴 Postventa es «vuelve a comprar»: a quien nunca compró no se le hace
 * seguimiento de compra. Medido el 16-sep-2026: de 1.060 fichas, **967 tienen
 * compras** y 93 nunca compraron.
 */
export function baseDeSeguimiento(
  clientes: readonly ClienteUniverso[],
): ClienteUniverso[] {
  return clientes.filter((c) => c.visitas > 0);
}

/**
 * El filtro de cada chip, sobre la base de arriba.
 *
 * ⚠️ «Nuevos» usa la MISMA definición que la tarjeta de arriba —registrado este
 * mes (`raw_data.fechaCreacion`)—, no «compró por primera vez este mes». Son
 * dos preguntas distintas y acá no se inventa una tercera definición; lo único
 * que cambia es la base, que son los que ya compraron.
 */
export function filtrarPorChip(
  clientes: readonly ClienteUniverso[],
  chip: Chip,
): ClienteUniverso[] {
  if (chip === "todos") return [...clientes];
  if (chip === "no_vuelven") return clientes.filter((c) => c.dormido);
  return clientes.filter((c) => c.nuevo_mes);
}

/**
 * EL orden, el único: del que más tiempo lleva sin comprar al que menos.
 *
 * 🔴 Desempate por `cliente_switch_id`, que es único: sin él, dos clientes con
 * los mismos días podrían cambiar de lugar entre dos cargas de la pantalla y la
 * vendedora perdería el renglón que estaba mirando.
 *
 * ⚠️ NO muta el arreglo que recibe.
 */
export function ordenarParaSeguimiento(
  clientes: readonly ClienteUniverso[],
): ClienteUniverso[] {
  return [...clientes].sort((a, b) => {
    const da = a.dias_sin_comprar ?? -1;
    const db = b.dias_sin_comprar ?? -1;
    if (da !== db) return db - da;
    return a.cliente_switch_id - b.cliente_switch_id;
  });
}

/** La lista tal como se dibuja: base → chip → orden. Una sola función. */
export function listaDeSeguimiento(
  clientes: readonly ClienteUniverso[],
  chip: Chip,
): ClienteUniverso[] {
  return ordenarParaSeguimiento(filtrarPorChip(baseDeSeguimiento(clientes), chip));
}

/** Cuántos caen en cada chip. Lo que va al lado del rótulo, si se decide poner. */
export function conteoPorChip(
  clientes: readonly ClienteUniverso[],
): Record<Chip, number> {
  const base = baseDeSeguimiento(clientes);
  return {
    no_vuelven: filtrarPorChip(base, "no_vuelven").length,
    nuevos: filtrarPorChip(base, "nuevos").length,
    todos: base.length,
  };
}

/**
 * La línea de abajo del renglón, entera: «283 días sin comprar» y, si alguien
 * ya le escribió, «· le escribieron hace 3 días».
 *
 * Devuelve las DOS mitades por separado porque se pintan distinto: los días en
 * ámbar (es la urgencia) y el contacto en gris (es un aviso para no repetir).
 */
export interface LineaDelRenglon {
  /** «283 días sin comprar». `null` solo si no hay compras, que no pasa en la lista. */
  dias: string | null;
  /** «le escribieron hace 3 días», o `null` si nadie le escribió. */
  contacto: string | null;
}

export function lineaDelRenglon(
  cliente: Pick<ClienteUniverso, "dias_sin_comprar">,
  ultimoContacto: UltimoContacto | null | undefined,
  hoy: string,
): LineaDelRenglon {
  const d = cliente.dias_sin_comprar;
  const dias = d === null || d === undefined
    ? null
    : d === 0
      ? "compró hoy"
      : d === 1
        ? "1 día sin comprar"
        : `${d} días sin comprar`;

  const contacto = ultimoContacto
    ? textoUltimoContacto(diasDesdeContacto(ultimoContacto.fecha, hoy))
    : null;
  return { dias, contacto };
}
