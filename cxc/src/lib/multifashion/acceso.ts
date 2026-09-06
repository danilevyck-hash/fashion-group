// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN ENTRA A MULTIFASHION — UNA sola lista, y se DERIVA del catálogo de
// módulos; nunca se escribe a mano.
//
// 🩸 POR QUÉ (6-sep-2026). Auditoría medida contra el código:
//   · `/multifashion` (la PÁGINA) no comprobaba ningún rol. `/ventas` manda a
//     casa a quien no es admin en dos líneas; Multifashion no tenía ninguna, y
//     el middleware solo valida que la sesión EXISTA. O sea: cualquiera con
//     sesión —bodega, un vendedor, contabilidad— abría esa dirección y el
//     resumen de la tienda le llegaba **ya escrito en el HTML**.
//   · 10 de las 11 rutas de `/api/multifashion/*` dejaban entrar a
//     `secretaria`, y dos además a `contabilidad`. Ninguno de los dos roles
//     tiene el módulo en `src/lib/modules.ts`.
//
// Daniel, 6-sep-2026, al preguntarle si lo cerraba igual aunque las secretarias
// perdieran el avance de las metas: **«A»** — ciérralo igual; con la pestaña
// nueva de Comisiones ven lo que necesitan.
//
// ⚠️ JENNIFER (`gerente_acs`) NO PIERDE NADA. Multifashion es su ÚNICO módulo y
// su casa: sigue en las dos listas de abajo, en las 11 rutas y en la lectura de
// metas. Este cambio le quita la puerta a quien no tiene el módulo, no a ella.
//
// ⚠️ LOS CRONS NO PASAN POR ACÁ. El resumen diario de ACS por Telegram, la
// fidelización y el ritmo de la meta leen la BASE directo
// (`src/lib/acs-resumen-diario.ts`, `retail-dia.ts`, `meta-ritmo-lectura.ts`),
// no `/api/multifashion/*`, y entran con `CRON_SECRET`. Verificado ruta por
// ruta el 6-sep-2026: cero llamadas HTTP a este grupo fuera del navegador.
// ─────────────────────────────────────────────────────────────────────────────

import { ALL_MODULES } from "@/lib/modules";

/** Los roles que TIENEN el módulo, tal como los declara `src/lib/modules.ts`. */
export const ROLES_MULTIFASHION: string[] = [
  ...(ALL_MODULES.find((m) => m.key === "multifashion")?.roles ?? ["admin"]),
];

/**
 * Los roles del módulo **Comisiones** (`/comisiones`).
 *
 * Escrito acá y no importado de la pantalla para no arrastrar React a una ruta;
 * un candado exige que sea el MISMO trío que declara `ComisionesPageClient`.
 */
export const ROLES_COMISIONES: string[] = ["admin", "contabilidad", "secretaria"];

/**
 * La excepción, y la única: las DOS rutas que alimentan la pestaña espejo
 * «Multifashion» de Comisiones (el ranking de vendedoras y su bono).
 *
 * 🔴 Es ESPEJO, no fusión: Multifashion comisiona con otra base
 * (`SUM(subtotal firmado) × 0,5 %`, sin filtro de utilidad) y que las dos digan
 * «0,5 %» es coincidencia. Lo que se comparte es la MISMA RPC y los MISMOS
 * números, no el cálculo del grupo. Quien ve Comisiones ve ese ranking; el
 * MÓDULO Multifashion sigue cerrado.
 */
export const ROLES_VENDEDORAS_ESPEJO: string[] = [
  ...new Set([...ROLES_MULTIFASHION, ...ROLES_COMISIONES]),
];

/** ¿Este rol abre la PÁGINA /multifashion? */
export function puedeAbrirMultifashion(role: string | null | undefined): boolean {
  return ROLES_MULTIFASHION.includes(role ?? "");
}
