// ============================================================================
// Marketing NUEVO — Por cobrar · Gastos · Impulsadoras (8-oct-2026).
//
// Daniel aprobó el mockup («¿Lo aplicamos y veo qué tal?»), pero Ángela usa
// Marketing todos los días. Por eso se prende POR ROL: hoy solo administrador
// (Daniel y Alberto). Los demás siguen viendo el Marketing de hoy, byte por
// byte (candado `marketing-nuevo-apagado`).
//
//   · Apagarlo:              ROLES_MARKETING_NUEVO = []
//   · Prenderlo para todos:  ROLES_MARKETING_NUEVO = ["admin", "secretaria", "contabilidad"]
//
// 🔴 NO SE MUEVE NI UNA FILA. Las pantallas nuevas leen el MISMO cálculo del
// ZIP (`resumenesDeCobro`), y el ZIP y su Excel no cambian.
// ============================================================================

/** 🔴 EL INTERRUPTOR: quién ve el Marketing nuevo. Un cambio de una línea. */
export const ROLES_MARKETING_NUEVO: readonly string[] = ["admin"];

/** ¿Este rol ve el Marketing nuevo? */
export function veMarketingNuevo(role: string | null | undefined): boolean {
  return ROLES_MARKETING_NUEVO.includes(String(role ?? ""));
}
