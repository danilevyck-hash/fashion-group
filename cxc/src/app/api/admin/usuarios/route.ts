import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { getDefaultModulesForRole } from "@/lib/modules";

// All system roles
const SYSTEM_ROLES = [
  { key: "admin", label: "Administrador" },
  { key: "director", label: "Director" },
  { key: "contabilidad", label: "Contabilidad" },
  { key: "secretaria", label: "Secretaria" },
  { key: "bodega", label: "Bodega" },
  { key: "vendedor", label: "Vendedor" },
];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const queryRole = req.nextUrl.searchParams.get("role");

  // Get stored permissions
  const { data: perms, error } = await supabaseServer
    .from("role_permissions")
    .select("*");

  if (error && error.code === "42P01") {
    // Table doesn't exist yet — return defaults
    if (queryRole) {
      return NextResponse.json({ modulos: getDefaultModulesForRole(queryRole) });
    }
    const roles = SYSTEM_ROLES.map((r) => ({
      role: r.key,
      label: r.label,
      modulos: getDefaultModulesForRole(r.key),
      activo: true,
    }));
    return NextResponse.json(roles);
  }

  if (error) return NextResponse.json({ error: "Error al cargar" }, { status: 500 });

  // Merge stored perms with system roles
  const permMap = new Map((perms || []).map((p: { role: string; modulos: string[]; activo: boolean }) => [p.role, p]));

  // Single role query — return just modulos array
  if (queryRole) {
    const stored = permMap.get(queryRole) as { modulos: string[] } | undefined;
    return NextResponse.json({ modulos: stored ? stored.modulos : getDefaultModulesForRole(queryRole) });
  }

  const roles = SYSTEM_ROLES.map((r) => {
    const stored = permMap.get(r.key) as { role: string; modulos: string[]; activo: boolean } | undefined;
    return {
      role: r.key,
      label: r.label,
      modulos: stored ? stored.modulos : getDefaultModulesForRole(r.key),
      activo: stored ? stored.activo : true,
    };
  });

  return NextResponse.json(roles);
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const body = await req.json();
  const { role, modulos, activo } = body;

  if (!role) return NextResponse.json({ error: "Role requerido" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("role_permissions")
    .upsert(
      { role, modulos: modulos || [], activo: activo !== false, updated_at: new Date().toISOString() },
      { onConflict: "role" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  return NextResponse.json(data);
}
