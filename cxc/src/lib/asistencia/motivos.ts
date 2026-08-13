// Motivos de una falta justificada.
//
// ⚠️ Viven acá y NO en el route: Next.js solo permite exportar los handlers
// (GET/POST/…) y unas pocas constantes suyas desde un archivo de ruta —
// cualquier otro export rompe el build con "does not match the required types
// of a Next.js Route".
//
// ── EL MOTIVO QUE NO ES UNA AUSENCIA (13-ago-2026) ───────────────────────────
//
// 🔴 «Trabajo fuera de la oficina» ES DISTINTO DE LOS OTROS CINCO, y la
// diferencia no es cosmética. Los cinco de siempre describen a alguien que NO
// trabajó; éste describe a alguien que SÍ trabajó, solo que en otro lado y sin
// un reloj donde marcar. El caso que lo motivó es RODRIGO MIRANDA (código 13),
// que no marca desde el 31 de julio — Daniel, textual: *"rodrigo esta
// trabajando fuera de la empresa (justificado)"*.
//
//                     Vacaciones        Trabajo fuera
//   ¿se le paga?          sí                 sí
//   ¿TRABAJÓ ese día?     NO                 SÍ
//   ¿le gasta vacaciones? SÍ                 no
//
// Metido dentro de «Vacaciones» o de «Permiso», en tres meses nadie puede
// distinguir quién estuvo de vacaciones de quién estuvo trabajando afuera — y
// las vacaciones son un derecho que se acumula y se gasta.
//
// 🩸 SE DICE "OFICINA" Y NO "EMPRESA", aunque la palabra de Daniel fuera
// "empresa". En castellano *"está fuera de la empresa"* se lee, con la misma
// naturalidad, como *"ya no trabaja acá"* — o sea, la confusión más cara
// posible justo en la pantalla que decide un pago. "Fuera de la oficina" dice
// lo mismo sin esa segunda lectura.
export const MOTIVO_TRABAJO_FUERA = "Trabajo fuera de la oficina";

export const MOTIVOS_JUSTIFICACION = [
  "Vacaciones",
  "Incapacidad",
  "Permiso",
  "Luto",
  MOTIVO_TRABAJO_FUERA,
  "Otro",
] as const;

/**
 * ¿Este motivo dice "trabajó, pero no acá"?
 *
 * 🔑 Compara contra la constante y nada más — sin `includes`, sin buscar la
 * palabra "trabajo" adentro. Un motivo escrito a mano parecido ("permiso para
 * trabajar afuera") NO es este caso: se sabe cuál es porque es el que la
 * pantalla ofrece, no porque se le parezca.
 */
export function esTrabajoFuera(motivo: string | null | undefined): boolean {
  return typeof motivo === "string" && motivo.trim() === MOTIVO_TRABAJO_FUERA;
}

/**
 * Cómo se lee un día justificado, en pantalla y en el Excel.
 *
 * 🔴 EL PUNTO DE TODO ESTO. Con el texto genérico —«Ausencia justificada —
 * Trabajo fuera de la oficina»— el renglón seguiría diciendo que la persona
 * estuvo AUSENTE, que es exactamente lo contrario de lo que pasó. Un día de
 * trabajo fuera se lee «Trabajando fuera de la oficina», sin la palabra
 * "ausencia" en ningún lado.
 */
export function textoDiaJustificado(motivo: string): string {
  return esTrabajoFuera(motivo)
    ? "Trabajando fuera de la oficina"
    : `Ausencia justificada — ${motivo}`;
}
