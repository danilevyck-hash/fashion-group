import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

// All system roles
const SYSTEM_ROLES = [
  { key: "admin", label: "Administrador", password_env: "ADMIN_PASSWORD" },
  { key: "director", label: "Director", password_env: "DIRECTOR_PASSWORD" },
  { key: "contabilidad", label: "Contabilidad", password_env: "CONTABILIDAD_PASSWORD" },
  { key: "secretaria", label: "Secretaria", password_env: "UPLOAD_PASSWORD" },
  { key: "vendedor", label: "Vendedor", password_env: "VENDEDOR_PASSWORD" },
  { key: "cliente", label: "Cliente", password_env: "CLIENTE_PASSWORD" },
];

// All modules in the system
const ALL_MODULES = [
  "cxc", "guias", "caja", "directorio", "reclamos", "prestamos", "ventas", "upload", "cheques", "reebok",
];

// Default module access per role
const DEFAULT_MODULES: Record<string, string[]> = {
  admin: ALL_MODULES,
  director: ALL_MODULES,
  contabilidad: ["prestamos", "ventas"],
  secretaria: ["upload", "guias", "caja", "reclamos", "cheques", "directorio"],
  vendedor: ["reebok", "cxc", "directorio"],
  cliente: ["reebok"],
};

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
      return NextResponse.json({ modulos: DEFAULT_MODULES[queryRole] || [] });
    }
    const roles = SYSTEM_ROLES.map((r) => ({
      role: r.key,
      label: r.label,
      modulos: DEFAULT_MODULES[r.key] || [],
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
    return NextResponse.json({ modulos: stored ? stored.modulos : (DEFAULT_MODULES[queryRole] || []) });
  }

  const roles = SYSTEM_ROLES.map((r) => {
    const stored = permMap.get(r.key) as { role: string; modulos: string[]; activo: boolean } | undefined;
    return {
      role: r.key,
      label: r.label,
      modulos: stored ? stored.modulos : (DEFAULT_MODULES[r.key] || []),
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
