// Motivos de una falta justificada.
//
// ⚠️ Viven acá y NO en el route: Next.js solo permite exportar los handlers
// (GET/POST/…) y unas pocas constantes suyas desde un archivo de ruta —
// cualquier otro export rompe el build con "does not match the required types
// of a Next.js Route".
//
// ── LA LISTA QUE ELIGIÓ DANIEL (25-ago-2026) ─────────────────────────────────
//
// Los motivos son CUATRO: Incapacidad · Catástrofe · Escolares · Trabajo de
// vendedor. Se fueron «Permiso», «Luto» y «Otro» (cajones sin forma, que en
// tres meses no dicen nada).
//
// ✅ «VACACIONES» YA SE MUDÓ (25-ago-2026) y por eso NO está en ninguna de las
// dos listas de acá. Vive en su propia pestaña y en su propia tabla
// (`asistencia_vacaciones`, ver `vacaciones.ts`), porque es OTRA COSA: en un
// día de vacaciones no se calcula nada del reloj, y llevan su propia cuenta de
// días. La ÚNICA justificación viva con ese motivo —ELOYN MENDOZA, código 29,
// 16-jul → 13-ago-2026— la migra
// `20260825160000_asistencia_vacaciones.sql`, que la inserta SIN MARCAR (o
// sea, pagándose igual que hoy) y recién después borra la fila vieja. Con la
// migración corrida no queda una sola justificación de «Vacaciones» que leer;
// mientras no corra, una fila así se lee como un motivo cualquiera y se
// comporta EXACTAMENTE como se comportaba.
//
// 🔴 LO QUE YA ESTÁ GUARDADO SIGUE VALIENDO. Quedan 4 justificaciones vivas en
// producción —3 de Incapacidad (48, 7, 43) y 1 de trabajo fuera (13, Rodrigo)—
// y ninguna se puede perder: pagan una quincena. Sacar un motivo de la lista
// OFRECIDA no borra las filas que lo usan; `MOTIVOS_RETIRADOS` existe para que
// el módulo sepa leerlas y la pantalla las muestre tal cual, sin ofrecerlas
// para una nueva.
//
// ── 🔴 «TRABAJO FUERA DE LA OFICINA» → «TRABAJO DE VENDEDOR» ─────────────────
//
// Es el MISMO motivo con mejor nombre —el de Daniel—, no uno nuevo. El caso
// vivo es RODRIGO MIRANDA (código 13), justificado del 1 al 13 de agosto.
//
// 🩸 SU FILA EN LA BASE DICE «Trabajo fuera de la oficina» Y NADIE LA VA A
// REESCRIBIR. Por eso el nombre viejo se reconoce para siempre
// (`MOTIVO_TRABAJO_FUERA_ANTES`) y `esTrabajoDeVendedor` acepta los dos: un
// `===` contra el nombre nuevo habría convertido la justificación de Rodrigo en
// una ausencia común el día que este archivo se mergea, y eso es plata.
// Las justificaciones NUEVAS se guardan con el nombre nuevo.
//
//                     Vacaciones        Trabajo de vendedor
//   ¿se le paga?          sí                    sí
//   ¿TRABAJÓ ese día?     NO                    SÍ
//   ¿le gasta vacaciones? SÍ                    no
//
// 🩸 EN EL RENGLÓN DEL DÍA SE SIGUE DICIENDO «fuera de la oficina» Y NO «fuera
// de la empresa». En castellano *"está fuera de la empresa"* se lee, con la
// misma naturalidad, como *"ya no trabaja acá"* — la confusión más cara posible
// justo en la pantalla que decide un pago.

/** El nombre nuevo, el que se guarda de ahora en adelante. */
export const MOTIVO_TRABAJO_VENDEDOR = "Trabajo de vendedor";

/**
 * Cómo se llamaba hasta el 25-ago-2026.
 *
 * 🔴 NO SE BORRA NUNCA. Es lo que dice la fila de Rodrigo en producción, y
 * mientras exista una sola justificación guardada con este texto, el módulo
 * tiene que reconocerla como lo que es. Renombrar un dato guardado sin migrarlo
 * es la forma de que una justificación viva se vuelva una ausencia en silencio.
 */
export const MOTIVO_TRABAJO_FUERA_ANTES = "Trabajo fuera de la oficina";

/** Los cuatro que la pantalla ofrece. */
export const MOTIVOS_JUSTIFICACION = [
  "Incapacidad",
  "Catástrofe",
  "Escolares",
  MOTIVO_TRABAJO_VENDEDOR,
] as const;

/**
 * Los que ya NO se ofrecen pero SIGUEN GUARDADOS en la base.
 *
 * 🔑 Están acá para que se puedan LEER, no para que se puedan elegir. Una fila
 * vieja con «Luto» tiene que seguir mostrándose y seguir sin descontar; lo que
 * cambia es que nadie puede crear una nueva.
 *
 * ⛔ «Vacaciones» NO ESTÁ ACÁ, y no es un olvido: se MUDÓ a su propia pestaña
 * (25-ago-2026, ver la nota de arriba). Volver a ponerla haría que el
 * desplegable la ofreciera de nuevo por la puerta de atrás y que el mismo día
 * pudiera existir dos veces —una como vacación y otra como «Ausencia
 * justificada — Vacaciones»—, con dos etiquetas contradictorias en el renglón
 * que decide un pago.
 */
export const MOTIVOS_RETIRADOS = [
  "Permiso",
  "Luto",
  "Otro",
  MOTIVO_TRABAJO_FUERA_ANTES,
] as const;

/** ¿Este motivo se puede elegir hoy? Los retirados se leen, no se ofrecen. */
export function motivoSeOfrece(motivo: string | null | undefined): boolean {
  const m = typeof motivo === "string" ? motivo.trim() : "";
  return (MOTIVOS_JUSTIFICACION as readonly string[]).includes(m);
}

/** ¿Es un motivo que el módulo conoce, aunque ya no se ofrezca? */
export function motivoConocido(motivo: string | null | undefined): boolean {
  const m = typeof motivo === "string" ? motivo.trim() : "";
  return motivoSeOfrece(m) || (MOTIVOS_RETIRADOS as readonly string[]).includes(m);
}

/**
 * ¿Este motivo dice "trabajó, pero no acá"?
 *
 * 🔴 ACEPTA LOS DOS NOMBRES, el nuevo y el de antes del 25-ago-2026. Es lo que
 * hace que la justificación de Rodrigo —guardada con el texto viejo— siga sin
 * descontarse. Hay candado en dólares.
 *
 * 🔑 Compara contra las constantes y nada más — sin `includes`, sin buscar la
 * palabra "trabajo" adentro. Un motivo escrito a mano parecido ("permiso para
 * trabajar afuera") NO es este caso: se sabe cuál es porque es el que la
 * pantalla ofrece, no porque se le parezca.
 */
export function esTrabajoDeVendedor(motivo: string | null | undefined): boolean {
  if (typeof motivo !== "string") return false;
  const m = motivo.trim();
  return m === MOTIVO_TRABAJO_VENDEDOR || m === MOTIVO_TRABAJO_FUERA_ANTES;
}

/**
 * Cómo se lee un día justificado, en pantalla y en el Excel.
 *
 * 🔴 EL PUNTO DE TODO ESTO. Con el texto genérico —«Ausencia justificada —
 * Trabajo de vendedor»— el renglón diría que la persona estuvo AUSENTE, que es
 * exactamente lo contrario de lo que pasó. Un día de vendedor se lee
 * «Trabajando fuera de la oficina», sin la palabra "ausencia" en ningún lado.
 *
 * ⚠️ Se dice «(vendedor)» al lado para que quien busque la palabra de Daniel la
 * encuentre, sin perder la frase que describe el día — que es la que evita que
 * se lea como "ya no trabaja acá".
 */
export function textoDiaJustificado(motivo: string): string {
  return esTrabajoDeVendedor(motivo)
    ? "Trabajando fuera de la oficina (vendedor)"
    : `Ausencia justificada — ${motivo}`;
}
