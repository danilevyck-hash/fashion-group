// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LOS PEDIDOS QUE NO LLEGARON A SWITCH SE NOTAN (6-sep-2026)
//
// La fila SIEMPRE dijo que un pedido no salió («No se ha mandado a Switch»,
// `TEXTO_NO_ENVIADO`), pero lo decía en gris chiquito, con el mismo peso que
// todo lo demás, sin cuántos días llevaba así y sin forma de filtrarlos. O sea:
// el dato estaba y no se veía.
//
// Medido contra producción el 7-sep-2026 — de 56 comprobantes vivos, **7 no han
// salido a Switch, y DOS de ellos están CONFIRMADOS**:
//
//   · PED-004 · Reebok · CITY MALL PASO CANOA · $420,00 · hace 65 días
//   · CKP-020 · Calvin · HJsn ·               $1.284,00 · hace 23 días
//
// Los dos se quedaron trabados por lo mismo: no tienen cliente de Switch
// elegido, así que el botón de mandar les contesta «falta elegir el cliente» y
// ahí quedan. Los otros 5 son BORRADORES (1 Reebok · 3 Tommy · 1 Calvin), y un
// borrador todavía no es un pedido: tiene su propio chip y no entra acá.
//
// 🔴 EL CHIP CUENTA LOS CONFIRMADOS, NO LOS BORRADORES. Si contara los 7, el
// chip diría 7 donde hay 2 cosas que arreglar, y un aviso que exagera se
// aprende a ignorar.
//
// 🔴 Y NO ENTRA EL PEDIDO DEL LINK SIN CONVERTIR (`fuente = "publicos"`): ése
// todavía no existe como pedido de la casa —no tiene ni número propio— y su
// abandono se trata aparte, con la ventana de 30 días (`comprobantes-ventana`).
//
// Módulo PURO: recibe el día de PANAMÁ por parámetro. Contar días con el reloj
// del navegador hace que el mismo pedido diga 64 o 65 según la hora.
// ─────────────────────────────────────────────────────────────────────────────

import { diasDesde } from "@/lib/clientes/ficha";
import { fechaPanamaDe } from "@/lib/fecha-panama";
import { TEXTO_NO_ENVIADO, esBorrador, type NumerosDePedido } from "./numeros-pedido";

/** El rótulo del chip. Dice el estado, no el mecanismo. */
export const CHIP_SIN_MANDAR = "Sin mandar";

/** Lo mínimo que hace falta para saber si una fila está trabada. */
export interface FilaSinMandar extends NumerosDePedido {
  created_at?: string;
}

/**
 * 🔴 ¿Este comprobante se quedó sin llegar a Switch, estando terminado?
 *
 * Las tres condiciones son necesarias y ninguna sobra:
 *   1. vive en la tabla de pedidos de la casa (`orders`) — el del link sin
 *      convertir no es un pedido todavía;
 *   2. NO es borrador — un borrador no se mandó porque no se terminó;
 *   3. no tiene envío ACTIVO en Switch (`estaEnSwitch` mira el envío, nunca el
 *      número: un envío vivo sin número existe y decir que no salió sería lo
 *      contrario de la verdad).
 */
export function esSinMandar(p: FilaSinMandar): boolean {
  if (p.fuente === "publicos") return false;
  if (esBorrador(p)) return false;
  return !(typeof p.enSwitch === "boolean"
    ? p.enSwitch
    : p.switchNumero !== null && p.switchNumero !== undefined);
}

/**
 * 🔴 LOS DÍAS SE CUENTAN EN UN SOLO LUGAR (22-sep-2026).
 *
 * Cuántos días lleva un comprobante sin llegar a Switch, contados contra el
 * día de PANAMÁ que llega por parámetro. `null` cuando no se puede saber —
 * sin fecha, con una fecha ilegible o con una fecha del futuro—: ahí no se
 * inventa un número, porque «hace NaN días» es peor que no decir cuánto.
 *
 * Es la ÚNICA forma de contar esos días. El texto rojo del pedido trabado, el
 * del borrador que se quedó y el tono de los dos salen todos de acá: dos
 * cuentas para la misma pregunta es cómo se termina diciendo 41 en un lado y
 * 42 en el otro.
 */
export function diasSinLlegarASwitch(
  createdAt: string | null | undefined,
  hoyPanamaYmd: string,
): number | null {
  if (!createdAt) return null;
  // Una fecha ilegible NO revienta ni inventa: `fechaPanamaDe` haría
  // `new Date(NaN).toISOString()`, que tira RangeError.
  if (Number.isNaN(new Date(createdAt).getTime())) return null;
  const dia = fechaPanamaDe(createdAt);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const d = diasDesde(dia, hoyPanamaYmd);
  if (!Number.isFinite(d) || d < 0) return null;
  return d;
}

/** «· hace 41 días» pegado a la frase que ya dice qué pasó. */
function conAntiguedad(base: string, dias: number | null, desdeUnDia: boolean): string {
  if (dias === null) return base;
  if (dias === 0) return desdeUnDia ? base : `${base} · hoy`;
  if (dias === 1) return `${base} · ayer`;
  return `${base} · hace ${dias} días`;
}

/**
 * «Sin mandar a Switch · hace 65 días» — lo que la fila dice EN ROJO cuando un
 * pedido TERMINADO no llegó al ERP.
 */
export function textoSinMandar(createdAt: string | null | undefined, hoyPanamaYmd: string): string {
  return conAntiguedad("Sin mandar a Switch", diasSinLlegarASwitch(createdAt, hoyPanamaYmd), false);
}

/**
 * 🔴 EL BORRADOR QUE SE QUEDÓ TAMBIÉN DICE DESDE CUÁNDO (22-sep-2026).
 *
 * Mismas palabras de siempre (`TEXTO_NO_ENVIADO`), más la antigüedad. Y la
 * antigüedad solo aparece **a partir del día siguiente**: un borrador armado
 * hoy diciendo «· hoy» es ruido, y el ruido es lo que enseña a no mirar.
 */
export function textoNoLlegoASwitch(createdAt: string | null | undefined, hoyPanamaYmd: string): string {
  return conAntiguedad(TEXTO_NO_ENVIADO, diasSinLlegarASwitch(createdAt, hoyPanamaYmd), true);
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 A PARTIR DE LA SEMANA, SE VE DE LEJOS (22-sep-2026)
//
// 🩸 QUÉ PASÓ. Medido contra producción el 22-sep-2026: **cinco comprobantes
// vivos nunca llegaron a Switch, $32.208 en total**, y ninguno se veía. Los
// cinco son BORRADORES, así que la línea roja de arriba no los agarra —
// `esSinMandar` mira los TERMINADOS, y de ésos hoy hay **cero**—: salían con la
// frase gris de siempre, del mismo tamaño que todo lo demás y SIN decir hace
// cuánto.
//
//   PED-019 · reebok · Contado               ·  $2.760,00 · 22-jul · 62 días
//   TOM-005 · tommy  · Contado               · $16.920,00 · 12-ago · 41 días
//   TOM-006 · tommy  · Contado               ·  $7.254,00 · 12-ago · 41 días
//   CKP-007 · calvin · ACTIVE SHOES, S.A.    ·  $1.704,00 · 12-ago · 41 días
//   TOM-023 · tommy  · Wolf Mall Center Int  ·  $3.570,00 · 20-ago · 33 días
//
// 🔑 DE DÓNDE SALE EL NÚMERO 7. No es un gusto: **un pedido que sale a Switch,
// sale EN EL ACTO**. Medido sobre los 71 envíos activos de las 4 marcas, la
// distancia entre crear el pedido y mandarlo es:
//
//     p50 = 0,00 h · p75 = 0,01 h · p95 = 0,02 h · p99 = 4,38 h
//     máximo = 4,38 h · 71 de 71 (100 %) el MISMO día de Panamá
//
// O sea que ni uno solo cruzó la medianoche. Entre «lo normal» (≤ 4,4 horas) y
// lo que está trabado (33 días, el más nuevo de los cinco) no hay NADA: el
// corte se puede poner en cualquier parte del medio sin cambiar a quién agarra.
// Se elige **7 días** porque es el más chico que además:
//   · es ~38 veces el caso real más lento, así que un pedido sano no lo puede
//     tocar ni con un fin de semana largo de por medio;
//   · deja 26 días de margen por debajo del más nuevo de los cinco;
//   · se lee como lo que es — «lleva una semana ahí» —, y no como un umbral.
//
// ⚠️ EL TERMINADO NO ESPERA LA SEMANA. Un pedido CONFIRMADO que no salió está
// mal desde el primer minuto (eso es lo que `esSinMandar` marca en rojo desde
// el 6-sep-2026, y no se toca). La semana es para el BORRADOR, que el primer
// día no es una alarma y a los 33 sí.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 Los días a partir de los cuales un borrador sin mandar deja de ser normal. */
export const DIAS_SIN_MANDAR_VIEJO = 7;

/** Cómo se pinta la línea: `calma` es el gris de siempre, `alerta` el rojo. */
export type TonoSinMandar = "calma" | "alerta";

/**
 * 🔴 EL TONO SALE DE ACÁ Y DE NINGÚN OTRO LADO.
 *
 * `trabado` = terminado y sin envío activo (`esSinMandar`): rojo siempre.
 * Si no, es un borrador: gris hasta la semana, rojo desde ahí.
 * Sin fecha no se puede saber cuánto lleva, así que se deja en calma — no se
 * levanta una alarma sobre un dato que no se tiene.
 */
export function tonoSinLlegar(trabado: boolean, dias: number | null): TonoSinMandar {
  if (trabado) return "alerta";
  return dias !== null && dias >= DIAS_SIN_MANDAR_VIEJO ? "alerta" : "calma";
}

/** Las clases de las dos formas. Viven acá para que la tabla y la ficha no
 *  puedan pintar cosas distintas: las dos leen esta misma tabla. */
export const CLASES_TONO: Record<TonoSinMandar, string> = {
  calma: "text-gray-400",
  alerta: "font-medium text-red-600",
};
