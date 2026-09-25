/* ─────────────────────────────────────────────────────────────────────────────
 * LOS DOS RELOJES, EN UNA SOLA PASTILLA DE LA FILA DE MANDOS (25-sep-2026).
 * Módulo PURO: sin base, sin red, sin `new Date()`.
 *
 * Daniel, textual, mirando la pantalla en producción: *«Reloj Multifashion y
 * Boston ¿puedes merge en una y que Traer ahora al tocar sea a los dos? y que
 * esté en el mismo panel de arriba junto a las otras para no ocupar mucho
 * espacio sucio»*.
 *
 * 🩸 LO QUE HABÍA: DOS cajas amarillas de ancho completo debajo de la fila de
 * mandos —«RELOJ DE MULTIFASHION · La PC de la oficina no responde · Traer
 * ahora» y la misma de Boston— con DOS botones que hacen lo mismo. Ocupaban dos
 * renglones enteros arriba de la tabla, todos los días, porque la PC de la
 * oficina se apaga de noche y de noche los dos relojes están «callados».
 *
 * 🔴 LA REGLA
 *
 *   1. **UNA pastilla, no dos cajas**: «Relojes al día · hace 3 minutos» en
 *      verde, o «Reloj de Boston sin señal hace 2 horas» en ámbar — **nombrando
 *      solo al que falla**. El peor manda el color y el texto: con uno callado,
 *      la línea no puede decir que está todo al día.
 *   2. **UN «Traer ahora» que le pide a LOS DOS.** Son las MISMAS dos llamadas
 *      que hacía cada caja por su lado (un POST por dispositivo): nada nuevo
 *      viaja al servidor.
 *   3. **Con la empresa filtrada a una sola, solo su reloj.** Qué reloj le toca
 *      a cada empresa es una lista ESCRITA A MANO (`RELOJ_DE_EMPRESAS`), medida
 *      contra producción el 25-sep-2026 sobre las marcaciones de septiembre:
 *
 *          reloj cboston → confecciones_boston 1.190 · vistana 479 · fashion_wear 456
 *          reloj acs     → american_classic 347
 *
 *      🔴 FALLA ABIERTA: un reloj que no esté en la lista se muestra SIEMPRE, y
 *      si el filtro no deja ninguno se muestran todos. Esconder el estado del
 *      reloj es peor que mostrar uno de más: **si el reloj no está entrando,
 *      cualquier número de esa pantalla está incompleto**.
 *
 * 🔑 NINGÚN NÚMERO CAMBIA. Acá no se calcula un minuto ni un centavo: se decide
 * qué dice una línea y a qué relojes se les deja el pedido.
 * ────────────────────────────────────────────────────────────────────────── */

import { hace, nombreRelojEnPantalla, type SaludAgente } from "./agente";

/** Lo mínimo que esta regla le pide a un reloj. */
export interface RelojParaLaFila {
  dispositivo: string;
  salud: SaludAgente;
  /** Minutos desde el último contacto. `null` = nunca hubo. */
  minutosSinNoticias?: number | null;
  /** El «Traer ahora» lleva demasiado sin que nadie lo recoja. */
  pedidoSinRespuesta?: boolean;
}

/**
 * 🔑 QUÉ EMPRESAS LEE CADA RELOJ — lista ESCRITA A MANO, como todas las de la
 * casa. No se deriva de un nombre ni de un parecido: se midió.
 */
export const RELOJ_DE_EMPRESAS: Readonly<Record<string, readonly string[]>> = {
  "reloj cboston": ["confecciones_boston", "vistana", "fashion_wear"],
  "reloj acs": ["american_classic"],
};

/**
 * Los relojes que le tocan a la empresa que se está mirando.
 *
 * `null`/vacío (= «Todas») devuelve la lista TAL CUAL —sin copiar ni reordenar—.
 * 🔴 Y si el filtro no deja ninguno, también: una pastilla vacía escondería que
 * el reloj no está entrando.
 */
export function relojesDeLaEmpresa<T extends { dispositivo: string }>(
  relojes: readonly T[] | null | undefined,
  empresa: string | null | undefined,
): T[] {
  const todos = (relojes ?? []) as T[];
  const e = String(empresa ?? "").trim();
  if (!e) return todos;
  const suyos = todos.filter((r) => {
    const empresas = RELOJ_DE_EMPRESAS[r.dispositivo];
    // Un reloj desconocido no se esconde nunca: falla ABIERTA.
    return empresas === undefined || empresas.includes(e);
  });
  return suyos.length > 0 ? suyos : todos;
}

/** El peor primero. El mismo orden de gravedad que ya usaba la línea resumen. */
const GRAVEDAD: Record<SaludAgente, number> = { con_error: 0, callado: 1, nunca: 2, al_dia: 3 };

/** Los relojes ordenados del peor al mejor. No muta la lista que entra. */
export function delPeorAlMejor<T extends { salud: SaludAgente }>(relojes: readonly T[]): T[] {
  return [...relojes].sort((a, b) => GRAVEDAD[a.salud] - GRAVEDAD[b.salud]);
}

/** ¿La pastilla va en verde? Solo con TODOS al día. */
export function todosAlDia(relojes: readonly RelojParaLaFila[]): boolean {
  return relojes.length > 0 && relojes.every((r) => r.salud === "al_dia");
}

/** Qué le pasa al que falla, en dos o tres palabras. */
function queLePasa(salud: SaludAgente, minutos: number | null | undefined): string {
  if (salud === "nunca") return "sin instalar";
  if (salud === "con_error") return "no se pudo leer";
  // «callado» = la PC no responde. Con minutos se dice hace cuánto.
  return typeof minutos === "number" ? `sin señal ${hace(minutos)}` : "sin señal";
}

/** «Reloj de Boston y Reloj de Multifashion». Nunca una coma final. */
function nombresJuntos(relojes: readonly RelojParaLaFila[]): string {
  const n = relojes.map((r) => nombreRelojEnPantalla(r.dispositivo));
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}

/**
 * 🔴 LO QUE DICE LA PASTILLA. Una línea y nada más.
 *
 *   · todos al día, dos relojes → «Relojes al día · hace 3 minutos»
 *   · todos al día, uno solo   → «Reloj de Boston al día · hace 3 minutos»
 *   · alguno mal               → «Reloj de Boston sin señal hace 2 horas»
 *
 * 🔴 NOMBRA SOLO AL QUE FALLA. Decir «2 de 2 relojes no están entrando» obliga a
 * abrir algo para saber cuál; el nombre cabe y es lo accionable.
 */
export function textoDeLaPastilla(relojes: readonly RelojParaLaFila[]): string {
  if (relojes.length === 0) return "";
  const malos = relojes.filter((r) => r.salud !== "al_dia");
  if (malos.length === 0) {
    // El más viejo manda: decir «hace 1 minuto» teniendo uno de hace 40 sería
    // afirmar una frescura que no hay.
    const mins = relojes
      .map((r) => (typeof r.minutosSinNoticias === "number" ? r.minutosSinNoticias : null))
      .filter((m): m is number => m !== null);
    const peor = mins.length ? Math.max(...mins) : null;
    const cabeza = relojes.length === 1
      ? `${nombreRelojEnPantalla(relojes[0].dispositivo)} al día`
      : "Relojes al día";
    return peor === null ? cabeza : `${cabeza} · ${hace(peor)}`;
  }
  const ordenados = delPeorAlMejor(malos);
  const peor = ordenados[0];
  return `${nombresJuntos(ordenados)} ${queLePasa(peor.salud, peor.minutosSinNoticias)}`;
}

/**
 * 🔴 EL PEDIDO QUE NADIE RECOGIÓ SE SIGUE DICIENDO, Y CON LAS MISMAS PALABRAS.
 * Era lo único de las dos cajas amarillas que no cabía en la pastilla, y es
 * accionable: la PC está apagada y hay que prenderla. `null` sin ninguno.
 */
export const PC_NO_RECOGIO =
  "La PC de la oficina no ha recogido el pedido: revisa que esté prendida.";

export function avisoDeLaPastilla(relojes: readonly RelojParaLaFila[]): string | null {
  return relojes.some((r) => r.pedidoSinRespuesta) ? PC_NO_RECOGIO : null;
}

/** ⚠️ «Traer ahora» de Asistencia es OTRA cosa que «Actualizar ahora»: le pide a
 *  una PC que empuje las marcas de su reloj. El rótulo no se toca. */
export const TRAER_AHORA = "Traer ahora";

/** Lo que dice el botón mientras la PC no ha recogido el pedido. */
export const ESPERANDO_A_LA_PC = "Esperando a la PC…";

/**
 * El acuse de que el pedido salió, nombrando a quiénes. UN toque, dos pedidos.
 *
 * 🔴 NO DICE CUÁNTAS MARCAS TRAJO, y no es un olvido: el POST solo DEJA EL
 * PEDIDO en el buzón (`/api/asistencia/reloj`), y cuántas marcaciones aparecen
 * se sabe recién cuando el agente de la PC da su vuelta, minutos después.
 * Inventar un número acá sería inventarle un dato a Daniel.
 */
export function textoPedidoEnviado(dispositivos: readonly string[]): string {
  const n = dispositivos.length;
  if (n === 0) return "";
  if (n === 1) {
    return `Pedido enviado a ${nombreRelojEnPantalla(dispositivos[0])}: la PC lo recoge en unos minutos.`;
  }
  return `Pedido enviado a los ${n} relojes: la PC los recoge en unos minutos.`;
}
