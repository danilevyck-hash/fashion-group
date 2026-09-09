// ─────────────────────────────────────────────────────────────────────────────
// 🔴 QUIÉN VE CUENTAS POR COBRAR — FUENTE ÚNICA (8-sep-2026).
//
// Los mismos tres roles que abren `/cxc`: **admin · secretaria · vendedor**.
// Es la lista que ya usaban, cada una por su cuenta, la pantalla
// (`useAuth({ moduleKey: "cxc" })`), `/api/cxc/ultimo-pago` y `/api/cxc/envios`.
//
// 🩸 POR QUÉ SE JUNTA. `/api/cxc/aging-por-cliente/[codigo]` —la que alimenta la
// tarjeta al pasar el mouse en Ventas › Clientes— dejaba entrar además a
// **`contabilidad`**, un rol que NO tiene el módulo CXC en `modules.ts`, y
// devuelve el saldo de CUALQUIER cliente con solo saber su código. No era una
// decisión: era una cuarta copia de la lista que se quedó atrás. Con una sola
// lista, el próximo cambio de roles no puede volver a dejar una puerta abierta.
//
// ⚠️ Cerrarla no rompe la tarjeta de Ventas: **Ventas es solo de admin**, y
// admin está en la lista (además `requireRole` deja pasar siempre al admin).
//
// ⚠️ NO es la lista de Boston. Esa cartera es otra y tiene la suya
// (`boston-roles.ts`): quien ve el CXC del grupo no ve la de Boston y al revés.
// ─────────────────────────────────────────────────────────────────────────────

/** Los roles que ven Cuentas por Cobrar (el CXC del grupo, las 6 empresas). */
export const ROLES_CXC = ["admin", "secretaria", "vendedor"] as const;

/** Copia mutable para las APIs que reciben `string[]` (requireRole/requireAuth). */
export const rolesCxc = (): string[] => [...ROLES_CXC];

/** ¿Este rol ve Cuentas por Cobrar? */
export function veCxc(role: string | null | undefined): boolean {
  return typeof role === "string" && (ROLES_CXC as readonly string[]).includes(role);
}
