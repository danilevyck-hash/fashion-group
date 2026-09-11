// ─────────────────────────────────────────────────────────────────────────────
// 🔴 QUIÉN VE EL MÓDULO CLIENTES — FUENTE ÚNICA (11-sep-2026).
//
// La LISTA (`/clientes`) y la FICHA (`/clientes/[codigo]`) son del módulo
// `directorio`, y ese módulo es de **admin · secretaria · vendedor**. De acá
// salen las tres cosas que tienen que decir lo mismo: la entrada del catálogo
// (`src/lib/modules.ts`), el guard SSR de la lista y el de la ficha.
//
// 🩸 POR QUÉ SE JUNTA. Las dos páginas tenían su propia copia escrita a mano y
// las dos nombraban además a **`bodega`**, que NO tiene el módulo: la ficha no
// le salía en el Inicio ni en el sidebar, pero escribiendo `/clientes` entraba
// al directorio completo —los 148 clientes con su correo, su teléfono y lo que
// deben— y desde ahí a la ficha de cualquiera. CLAUDE.md ya decía cómo tenía
// que ser: *«Nota: directorio aparece solo en la búsqueda global, NO como
// módulo navegable»*. Lo que faltaba era que el código lo cumpliera.
//
// ⚠️ Bodega NO pierde nada de lo que sí le toca: la búsqueda global le sigue
// devolviendo clientes (`/api/search` le manda guías + directorio) porque ahí
// lo que necesita es el teléfono de a quién le está despachando.
//
// ⚠️ NO es la lista de `/api/clientes/[codigo]`. Esa ruta tiene la suya y no se
// toca: la usan superficies de otros módulos.
// ─────────────────────────────────────────────────────────────────────────────

/** Los roles que abren el módulo Clientes (la lista y la ficha). */
export const ROLES_CLIENTES = ["admin", "secretaria", "vendedor"] as const;

/** Copia mutable para los guards que reciben `string[]`. */
export const rolesClientes = (): string[] => [...ROLES_CLIENTES];

/** ¿Este rol abre el módulo Clientes? */
export function veClientes(role: string | null | undefined): boolean {
  return typeof role === "string" && (ROLES_CLIENTES as readonly string[]).includes(role);
}
