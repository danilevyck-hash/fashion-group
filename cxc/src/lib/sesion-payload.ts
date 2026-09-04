import { supabaseServer } from "@/lib/supabase-server";
import { getDefaultModulesForRole } from "@/lib/modules";

/**
 * Arma el payload de sesión de un usuario a partir de su fila en `fg_users`.
 *
 * 🔴 FUENTE ÚNICA. Lo usan DOS caminos y tienen que decir exactamente lo mismo:
 *   - POST /api/auth        — el login con contraseña
 *   - GET  /api/auth/sesion — reanudar la sesión con la cookie vigente (3-sep-2026)
 * Si los módulos, el filtro de empresa o los flags se resolvieran distinto en
 * cada camino, un usuario vería módulos diferentes según CÓMO entró. Extraído
 * verbatim del POST /api/auth; la conducta no cambió.
 */

export interface FilaUsuario {
  id: string;
  name: string;
  role: string;
  is_owner?: boolean | null;
  associated_company?: string | null;
  modulos_override?: unknown;
}

export interface PayloadSesion {
  role: string;
  userId: string;
  userName: string;
  modules: string[];
  isOwner: boolean;
  empresaFilter?: string;
  guiasReadonly?: boolean;
}

// Per-user config (readonly flags). El filtro de empresa para CXC ya
// NO se hardcodea acá: viene de fg_users.associated_company (DB).
const USER_CONFIG: Record<string, { guiasReadonly?: boolean }> = {
  edwin: { guiasReadonly: true },
};

/** Módulos del usuario. Prioridad:
 *   1) modulos_override (per-usuario) si está definido y no vacío
 *   2) role_permissions del rol
 *   3) defaults hardcoded por rol (fallback si la tabla no responde)
 */
async function resolverModulos(user: FilaUsuario): Promise<string[]> {
  if (Array.isArray(user.modulos_override) && user.modulos_override.length > 0) {
    return user.modulos_override as string[];
  }
  let modules: string[] = [];
  try {
    const { data: rolePerm } = await supabaseServer
      .from("role_permissions")
      .select("modulos")
      .eq("role", user.role)
      .single();
    if (rolePerm?.modulos) modules = rolePerm.modulos;
  } catch { /* use defaults below if table missing */ }

  if (modules.length === 0) {
    modules = getDefaultModulesForRole(user.role);
  }
  return modules;
}

export async function armarPayloadSesion(user: FilaUsuario): Promise<PayloadSesion> {
  const modules = await resolverModulos(user);
  const userConfig = USER_CONFIG[user.name.toLowerCase()] || {};

  // Restricción de empresa para CXC (fuente: fg_users.associated_company).
  // Vendedor con empresa asociada ve solo esa; sin asociada (null) ve todas.
  // El server (API /api/cxc/aging) la re-aplica de forma autoritativa;
  // esto solo alimenta el lock visual del selector de empresa.
  const empresaFilter = user.associated_company || undefined;

  return {
    role: user.role,
    userId: user.id,
    userName: user.name,
    modules,
    isOwner: !!user.is_owner,
    ...(empresaFilter && { empresaFilter }),
    ...(userConfig.guiasReadonly && { guiasReadonly: true }),
  };
}
