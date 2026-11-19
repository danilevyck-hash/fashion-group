// Lo que el historial del cliente (`/api/cxc/historial` y sus renglones) lee
// del SERVIDOR antes de consultar: qué empresas del GRUPO puede ver quien pide.
// 🔴 Solo las 6 del grupo; Boston tiene su ruta aparte y nunca pasa por aquí.

import { supabaseServer } from "@/lib/supabase-server";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { rolesClientes } from "@/lib/clientes/roles";

/** Los roles de CxC del grupo y de Clientes (hoy son los mismos tres).
 *  `gerente_boston` NO está: su historial va por `/api/cxc/boston/historial`. */
export const ROLES_HISTORIAL_GRUPO: string[] = [...new Set(["admin", "secretaria", "vendedor", ...rolesClientes()])];

/** Las empresas que puede ver quien pide. El vendedor, solo su empresa
 *  asociada (fuente: la base, no la cookie), igual que `/api/cxc/ultimos-pagos`. */
export async function empresasDeQuienPide(role: string, userId?: string | null): Promise<string[]> {
  const grupo = [...CXC_GRUPO_EMPRESA_KEYS] as string[];
  if (role !== "vendedor" || !userId) return grupo;
  const { data: u } = await supabaseServer
    .from("fg_users")
    .select("associated_company")
    .eq("id", userId)
    .maybeSingle();
  const asociada = (u as { associated_company?: string | null } | null)?.associated_company ?? null;
  if (!asociada) return grupo;
  return grupo.includes(asociada) ? [asociada] : [];
}

