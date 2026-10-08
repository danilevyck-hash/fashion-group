// ============================================================================
// Marketing NUEVO — Por cobrar · Gastos · Impulsadoras (8-oct-2026).
//
// Daniel aprobó el mockup («¿Lo aplicamos y veo qué tal?»), pero Ángela usa
// Marketing todos los días. Se prendió primero solo para administrador y el
// 8-oct-2026 Daniel lo prendió para todos («sí, todos»): los mismos roles que
// entran a Marketing (`ROLES_MARKETING`). Lo que cada uno puede HACER no
// cambia: contabilidad solo mira (`puedeEscribirMarketing`), y el servidor le
// contesta 403 igual (candado `marketing-nuevo-apagado`).
//
//   · Apagarlo (todos vuelven a la pantalla de antes): ROLES_MARKETING_NUEVO = []
//   · Solo administrador:                              ROLES_MARKETING_NUEVO = ["admin"]
//
// 🔴 NO SE MUEVE NI UNA FILA. Las pantallas nuevas leen el MISMO cálculo del
// ZIP (`resumenesDeCobro`), y el ZIP y su Excel no cambian.
// ============================================================================

import { ROLES_MARKETING } from "./roles";

/** 🔴 EL INTERRUPTOR: quién ve el Marketing nuevo. Un cambio de una línea. */
export const ROLES_MARKETING_NUEVO: readonly string[] = ROLES_MARKETING;

/** ¿Este rol ve el Marketing nuevo? */
export function veMarketingNuevo(role: string | null | undefined): boolean {
  return ROLES_MARKETING_NUEVO.includes(String(role ?? ""));
}
