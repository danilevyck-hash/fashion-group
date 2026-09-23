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
import { estaFueraDeSeguimiento } from "./fuera-de-seguimiento";
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
 * La base de la lista: los que YA COMPRARON y a los que SÍ se les hace
 * postventa.
 *
 * 🔴 Postventa es «vuelve a comprar»: a quien nunca compró no se le hace
 * seguimiento de compra. Medido el 16-sep-2026: de 1.060 fichas, **967 tienen
 * compras** y 93 nunca compraron.
 *
 * 🔴 Y HOY NO SE EXCLUYE A NADIE MÁS (23-sep-2026). Daniel: *«métel[o] para
 * no hacer excepciones por solo una persona»* — VENTAS MAHER, que estaba
 * afuera desde el 16-sep, vuelve a ser un cliente como cualquiera. El
 * mecanismo se conserva VACÍO en `fuera-de-seguimiento.ts`, POR CÓDIGO y nunca
 * por nombre. Medido ese día: «Todos» 983 → 986 y «No vuelven» 721 → 723.
 *
 * ⚠️ Las cuatro tarjetas de arriba no se mueven: cuentan el universo de
 * fidelización, que a Maher siempre lo contó.
 */
export function baseDeSeguimiento(
  clientes: readonly ClienteUniverso[],
): ClienteUniverso[] {
  return clientes.filter((c) => c.visitas > 0 && !estaFueraDeSeguimiento(c.cliente_switch_id));
}

/**
 * El filtro de cada chip, sobre la base de arriba.
 *
 * 🔴 «NUEVOS» ES QUIEN COMPRÓ POR PRIMERA VEZ ESTE MES, no quien fue registrado
 * este mes (16-sep-2026). Daniel, textual: *«no existe registrar y no
 * compró»* — en la tienda te registran cuando compras, así que para él las dos
 * preguntas son la misma y el que se registró sin comprar no debería estar.
 *
 * ⚠️ LA TARJETA DE ARRIBA SIGUE CONTANDO LOS REGISTRADOS (`nuevo_mes`), y los
 * dos números pueden no coincidir: medido el 16-sep-2026, **31 registrados
 * contra 33 primeras compras**. Si algún día alguien ve 31 arriba y 33 abajo,
 * es esto: arriba «lo registraron este mes», abajo «compró por primera vez este
 * mes». Ninguno de los dos está mal.
 */
export function filtrarPorChip(
  clientes: readonly ClienteUniverso[],
  chip: Chip,
): ClienteUniverso[] {
  if (chip === "todos") return [...clientes];
  if (chip === "no_vuelven") return clientes.filter((c) => c.dormido);
  return clientes.filter((c) => c.primera_compra_este_mes);
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

/**
 * Cuántas filas se ven antes de tocar «Ver los N» en la LISTA DE SEGUIMIENTO.
 *
 * 🔴 ES SU PROPIA CONSTANTE, y no la de Mayoreo, A PROPÓSITO (16-sep-2026).
 * `FILAS_CLIENTES_AL_ABRIR` (10, en `clientes-cobertura.ts`) es para un RANKING:
 * se abre, se leen los de arriba y se cierra. Esta lista es una COLA DE TRABAJO:
 * se abre y se baja llamando uno por uno. Son dos preguntas distintas y por eso
 * son dos números; compartirlos obligaba a mover Mayoreo para tocar ésta.
 *
 * Daniel, 16-sep-2026, sobre las 25: *«2. Sí»*. Medido ese día: el chip que abre
 * («No vuelven») trae **668 filas**, así que diez se acaban en dos segundos de
 * trabajo y las 668 de una son una página que no termina nunca.
 */
export const FILAS_SEGUIMIENTO_AL_ABRIR = 25;
