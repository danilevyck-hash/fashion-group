// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE LLAMA CADA ROL EN PANTALLA — UN solo lugar (11-sep-2026).
//
// 🩸 Había DOS copias de `ROLE_LABELS` (AppHeader y Sidebar), ninguna con
// `gerente_acs` ni `gerente_boston` —Jennifer y David veían su rol CRUDO debajo
// del nombre— y las dos con un `cliente` que no existe como rol del sistema.
//
// La lista se DERIVA de `SYSTEM_ROLES` (`src/lib/modules.ts`), que es donde los
// roles se declaran: un rol nuevo nace con su nombre y no puede quedar sin él.
// El candado `roles-etiquetas.test.ts` exige que cubra los SIETE y nada más.
// ─────────────────────────────────────────────────────────────────────────────

import { SYSTEM_ROLES } from "@/lib/modules";

/** rol → cómo se muestra (`admin` → «Administrador», `gerente_acs` →
 *  «Gerente Multifashion», `gerente_boston` → «Gerente Boston»). */
export const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  SYSTEM_ROLES.map((r) => [r.key, r.label]),
);

/** El nombre del rol en pantalla; un rol que el sistema no declara se muestra
 *  tal cual (nunca vacío). */
export function etiquetaDeRol(role: string | null | undefined): string {
  const r = role ?? "";
  return ROLE_LABELS[r] ?? r;
}
