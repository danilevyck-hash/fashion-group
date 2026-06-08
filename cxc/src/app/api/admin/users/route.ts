import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { SYSTEM_ROLE_KEYS, ALL_MODULE_KEYS } from "@/lib/modules";

export const dynamic = "force-dynamic";

function isBcryptHash(s: string): boolean {
  return s.startsWith("$2a$") || s.startsWith("$2b$");
}

/**
 * Valida server-side `role` y `modulos_override` contra las fuentes de verdad
 * (SYSTEM_ROLE_KEYS / ALL_MODULE_KEYS). El frontend ya restringe vía select y
 * checkboxes, pero una llamada directa a la API podría inyectar valores inválidos.
 * Devuelve un mensaje de error o null si todo es válido.
 */
function validateRoleAndModulos(role: unknown, modulos_override: unknown): string | null {
  if (role !== undefined && role !== null) {
    if (typeof role !== "string" || !SYSTEM_ROLE_KEYS.includes(role)) {
      return `Rol inválido. Roles permitidos: ${SYSTEM_ROLE_KEYS.join(", ")}`;
    }
  }
  if (Array.isArray(modulos_override)) {
    const invalid = modulos_override.find((m) => typeof m !== "string" || !ALL_MODULE_KEYS.includes(m));
    if (invalid !== undefined) {
      return `Módulo inválido: '${invalid}'. Módulos válidos: ${ALL_MODULE_KEYS.join(", ")}`;
    }
  } else if (modulos_override !== undefined && modulos_override !== null) {
    return "modulos_override debe ser un arreglo de módulos o null.";
  }
  return null;
}

/**
 * ¿Aplicar este cambio (desactivar o quitar el rol admin) al usuario `targetId`
 * dejaría al sistema con CERO administradores activos? Previene el auto-lockout:
 * que nadie pueda volver a entrar a administrar.
 */
async function wouldLeaveNoActiveAdmin(targetId: string): Promise<boolean> {
  const { data } = await supabaseServer
    .from("fg_users")
    .select("id")
    .eq("role", "admin")
    .eq("active", true);
  const activeAdmins = data || [];
  return activeAdmins.length === 1 && activeAdmins[0].id === targetId;
}

/**
 * ¿La contraseña ya está en uso por otro usuario? El login es password-only:
 * dos usuarios con la misma contraseña lo hacen ambiguo (un usuario entraría
 * con la identidad/rol de otro). Se valida unicidad GLOBAL (incluye inactivos,
 * por si se reactivan) y se espeja la normalización del login (exacto + lowercase).
 */
async function passwordInUse(plaintext: string, excludeId?: string): Promise<boolean> {
  const { data: users } = await supabaseServer.from("fg_users").select("id, password");
  if (!users) return false;
  const bcrypt = (await import("bcryptjs")).default;
  const lower = plaintext.toLowerCase();
  for (const u of users) {
    if (excludeId && u.id === excludeId) continue;
    if (!u.password || !isBcryptHash(u.password)) continue;
    if ((await bcrypt.compare(plaintext, u.password)) || (await bcrypt.compare(lower, u.password))) {
      return true;
    }
  }
  return false;
}

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  // Columnas explícitas SIN `password`: nunca enviar el hash bcrypt al cliente.
  // (El cambio de contraseña se hace escribiendo una nueva en POST/PUT, no
  // leyendo la actual.)
  const { data: users, error } = await supabaseServer
    .from("fg_users")
    .select(
      "id, name, role, active, associated_company, modulos_override, is_owner, created_at, updated_at",
    )
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Error al cargar" }, { status: 500 });

  // Los módulos se derivan de role_permissions (+ modulos_override por usuario).
  const result = (users || []).map((u) => ({ ...u }));
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { name, password, role, associated_company, modulos_override } = await req.json();
  if (!name || !password) return NextResponse.json({ error: "Nombre y contraseña requeridos" }, { status: 400 });
  if (name.trim().length < 3) return NextResponse.json({ error: "El nombre debe tener al menos 3 caracteres" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });

  const validationError = validateRoleAndModulos(role, modulos_override);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  // Check for duplicate name
  const { data: existing } = await supabaseServer.from("fg_users").select("id").eq("name", name.trim()).limit(1);
  if (existing && existing.length > 0) return NextResponse.json({ error: "Ya existe un usuario con ese nombre" }, { status: 400 });

  // Unicidad de contraseña (login password-only → colisión = login ambiguo).
  if (await passwordInUse(password)) {
    return NextResponse.json({ error: "Esa contraseña ya está en uso, elige otra." }, { status: 400 });
  }

  const bcrypt = (await import("bcryptjs")).default;
  const hashed = await bcrypt.hash(password, 10);

  const overrideVal = Array.isArray(modulos_override) && modulos_override.length > 0 ? modulos_override : null;
  const { data: user, error } = await supabaseServer
    .from("fg_users")
    .insert({ name: name.trim(), password: hashed, role: role || "vendedor", associated_company: associated_company || null, modulos_override: overrideVal })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });

  // modulos_override (array) = permisos custom por usuario; null = hereda del rol.
  return NextResponse.json(user);
}

export async function PUT(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { id, name, password, role, associated_company, modulos_override } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const validationError = validateRoleAndModulos(role, modulos_override);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  // Guard de auto-lockout: quitar el rol admin al único admin activo dejaría el
  // sistema sin administradores.
  if (role !== undefined && role !== "admin" && (await wouldLeaveNoActiveAdmin(id))) {
    return NextResponse.json(
      { error: "No puedes quitar el rol de administrador al único admin activo." },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (trimmed.length < 3) return NextResponse.json({ error: "El nombre debe tener al menos 3 caracteres" }, { status: 400 });

    // Check for duplicate name (excluding the user being edited)
    const { data: existing } = await supabaseServer
      .from("fg_users")
      .select("id")
      .eq("name", trimmed)
      .neq("id", id)
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "Ya existe un usuario con ese nombre" }, { status: 400 });
    }

    update.name = trimmed;
  }
  if (password !== undefined) {
    if (password.length < 8) return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    // Unicidad de contraseña, excluyendo al propio usuario editado.
    if (await passwordInUse(password, id)) {
      return NextResponse.json({ error: "Esa contraseña ya está en uso, elige otra." }, { status: 400 });
    }
    const bcrypt = (await import("bcryptjs")).default;
    update.password = await bcrypt.hash(password, 10);
  }
  if (role !== undefined) update.role = role;
  if (associated_company !== undefined) update.associated_company = associated_company;
  // null = usar permisos del rol; array no vacío = override per-usuario.
  if (modulos_override !== undefined) {
    update.modulos_override = Array.isArray(modulos_override) && modulos_override.length > 0 ? modulos_override : null;
  }

  const { error } = await supabaseServer.from("fg_users").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });

  // modulos_override (array) = permisos custom por usuario; null = hereda del rol.
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { id, active } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Guard de auto-lockout: desactivar al único admin activo dejaría el sistema
  // sin nadie que pueda administrar.
  if (active === false && (await wouldLeaveNoActiveAdmin(id))) {
    return NextResponse.json(
      { error: "No puedes desactivar al único administrador activo." },
      { status: 400 },
    );
  }

  const { data: updatedUser, error } = await supabaseServer
    .from("fg_users")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("name")
    .single();

  if (error || !updatedUser) return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });

  // Al DESACTIVAR, revocar sus sesiones vivas. El middleware valida
  // user_sessions.revoked (no fg_users.active), así que sin esto un usuario
  // desactivado con sesión abierta seguiría entrando hasta que expire/revoque.
  // user_sessions se relaciona por user_name (nombre único, lo enforce la API).
  let sesionesRevocadas = 0;
  if (active === false) {
    const { data: revoked } = await supabaseServer
      .from("user_sessions")
      .update({ revoked: true })
      .eq("user_name", updatedUser.name)
      .eq("revoked", false)
      .select("id");
    sesionesRevocadas = revoked?.length ?? 0;
  }

  return NextResponse.json({ ok: true, sesionesRevocadas });
}
