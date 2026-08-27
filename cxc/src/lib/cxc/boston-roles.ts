/**
 * QUIÉN PUEDE LEER LA CARTERA DE CONFECCIONES BOSTON — FUENTE ÚNICA.
 *
 * ─── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────────────
 * 🩸 La lista de roles vivía DENTRO de `app/api/cxc/boston/route.ts` y la UI no
 * la miraba: la pestaña "Confecciones Boston" se le dibujaba a TODOS los roles.
 * Medido en producción el 14-ago-2026, los 3 vendedores activos (edwin, rey,
 * rodrigo) veían la pestaña, la tocaban y recibían **siempre** el error
 * *"No se pudo cargar la cartera de Confecciones Boston"* (403 del endpoint).
 *
 * Una segunda lista copiada en la UI habría arreglado el síntoma y dejado el
 * mecanismo: el próximo cambio de roles vuelve a desincronizarlas. Así que el
 * permiso vive UNA vez —acá— y lo leen los dos lados:
 *
 *   · el endpoint  → `app/api/cxc/boston/route.ts`      (requireRole)
 *   · la pantalla  → `app/admin/components/TabsCartera.tsx` (qué pestañas dibuja)
 *
 * ⚠️ ESTO NO MUEVE LA SEPARACIÓN DE BOSTON (#522), LA REFUERZA. Las dos
 * carteras siguen siendo dos vistas disjuntas y dos endpoints distintos; lo
 * único que cambia es que quien no puede LEER la de Boston tampoco ve su
 * puerta. Nada de plata, ni un filtro, ni una suma se toca acá.
 *
 * ⚠️ `requireRole` deja pasar SIEMPRE a `admin`, esté o no en la lista. Por eso
 * `admin` está listado explícitamente: la UI no pasa por `requireRole`, y si la
 * lista no lo nombrara, el dueño se quedaría sin la pestaña.
 */
import type { Cartera } from "./cartera";
import { ROL_BOSTON } from "@/lib/boston/rol";

/**
 * Roles que pueden leer la cartera de Confecciones Boston.
 *
 * Es el negocio de la familia, no el del grupo: la ven los mismos roles que el
 * CXC **menos `vendedor`** — los vendedores del grupo no cobran esta cartera ni
 * comisionan sobre ella.
 *
 * 🔴 Y `gerente_boston` (David), desde el 27-ago-2026. Es el rol que ve la
 * operación de Boston ENTERA, así que su cartera es lo primero que necesita:
 * la pestaña CXC de `/boston` monta el MISMO `<BostonTab />` que el panel del
 * grupo, contra el MISMO `/api/cxc/boston`. No hay un segundo endpoint ni una
 * segunda consulta — habría sido una segunda definición de "la cartera de
 * Boston", que es exactamente el defecto que costó el bug de la MV.
 *
 * ⚠️ Entrar acá NO le abre el CXC del grupo: `/api/cxc/aging` y las demás
 * rutas de la cartera del grupo tienen sus propias listas y le contestan 403.
 * Y `/admin` (el panel del grupo, donde vive la otra pestaña) lo rebota antes,
 * porque su único módulo es `boston`. Las dos cosas están probadas por CONDUCTA
 * en `boston-acceso.test.ts`.
 */
export const ROLES_BOSTON = ["admin", "secretaria", ROL_BOSTON] as const;

/** Copia mutable para las APIs que reciben `string[]` (requireRole). */
export const rolesBoston = (): string[] => [...ROLES_BOSTON];

/** ¿Este rol puede leer la cartera de Boston? */
export function puedeVerBoston(role: string | null | undefined): boolean {
  return typeof role === "string" && (ROLES_BOSTON as readonly string[]).includes(role);
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS PESTAÑAS DEL CXC
// ─────────────────────────────────────────────────────────────────────────────

export type TabCxc = Cartera;

/** Las dos pestañas del panel, en su orden. Fuente única de la UI. */
export const PESTANAS_CXC: readonly { key: TabCxc; label: string }[] = [
  { key: "grupo", label: "Grupo · 6 empresas" },
  { key: "boston", label: "Confecciones Boston" },
] as const;

/**
 * Las pestañas que ESTE rol puede ver. La de Boston se cae para quien no puede
 * leerla — no se dibuja gris ni deshabilitada: una puerta que no lleva a
 * ningún lado no es información, es una promesa rota.
 */
export function pestanasCxc(role: string | null | undefined): { key: TabCxc; label: string }[] {
  return PESTANAS_CXC.filter((p) => p.key !== "boston" || puedeVerBoston(role)).map((p) => ({ ...p }));
}

/**
 * La pestaña ACTIVA, ya validada contra el permiso.
 *
 * 🔴 Esconder el botón no alcanza: la pestaña vive en la URL (`?tab=boston`), y
 * un link compartido o un marcador la traería de vuelta. Sin permiso siempre se
 * cae al grupo.
 */
export function tabCxcPermitida(valor: string | null | undefined, role: string | null | undefined): TabCxc {
  return valor === "boston" && puedeVerBoston(role) ? "boston" : "grupo";
}
