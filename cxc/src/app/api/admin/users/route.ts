import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { SYSTEM_ROLE_KEYS, ALL_MODULE_KEYS } from "@/lib/modules";
import { moduloOfrecible } from "@/lib/modulos-ofrecibles";
import {
  AVISO_CONTRASENA_CORTA,
  AVISO_CONTRASENA_REPETIDA,
  LARGO_MINIMO_CONTRASENA,
  contrasenaEnUso,
} from "@/lib/auth/contrasena-en-uso";
import {
  COLUMNAS_DE_USUARIO,
  avisoDeVinculo,
  cambiarActivo,
  codigoDeColaborador,
  dejariaSinAdministrador as wouldLeaveNoActiveAdmin,
  insertarUsuario,
  revisarUsuarioNuevo,
} from "@/lib/usuarios/usuario-servidor";

export const dynamic = "force-dynamic";

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
    // 🔴 Y que el ROL pueda de verdad abrirlo (11-sep-2026). Un módulo que el
    // guard de su pantalla rebota por rol no se puede guardar: así nació el
    // `multifashion` de andrea, una ficha que se pintaba y mandaba de vuelta al
    // Inicio. El editor ya no lo ofrece; acá se cierra también la puerta de
    // atrás, que es la que importa cuando la casilla vuelva por cualquier
    // motivo.
    if (typeof role === "string") {
      const rebota = modulos_override.find((m) => !moduloOfrecible(role, m));
      if (rebota !== undefined) {
        return `El rol '${role}' no puede abrir '${rebota}': la pantalla lo devuelve al Inicio. Quítalo de los permisos personalizados.`;
      }
    }
  } else if (modulos_override !== undefined && modulos_override !== null) {
    return "modulos_override debe ser un arreglo de módulos o null.";
  }
  return null;
}

// `wouldLeaveNoActiveAdmin`, el alta y el activar/desactivar viven en
// `lib/usuarios/usuario-servidor.ts` (9-oct-2026): los usa también el alta de un
// colaborador con «Marcación desde el teléfono» y su baja.

// ¿La contraseña ya la usa otro? — `contrasenaEnUso` (`lib/auth/contrasena-en-uso.ts`),
// la MISMA comprobación que usa el cambio de contraseña propio (14-sep-2026).
// Vivía acá como `passwordInUse`; se movió para que no hubiera dos.

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  // Columnas explícitas SIN `password`: nunca enviar el hash bcrypt al cliente.
  // (El cambio de contraseña se hace escribiendo una nueva en POST/PUT, no
  // leyendo la actual.)
  const { data: users, error } = await supabaseServer
    .from("fg_users")
    .select(COLUMNAS_DE_USUARIO)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Error al cargar" }, { status: 500 });

  // Los módulos se derivan de role_permissions (+ modulos_override por usuario).
  const result = (users || []).map((u) => ({ ...u }));
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { name, password, role, associated_company, modulos_override, empleado_codigo } = await req.json();

  // 🔴 Nombre, largo mínimo (3, Daniel 19-sep-2026), nombre repetido y
  // contraseña repetida (`contrasenaEnUso`: el login no pide usuario, la
  // contraseña ES la identidad) — en `revisarUsuarioNuevo`, la MISMA revisión
  // del alta de un colaborador con acceso.
  const fallo = await revisarUsuarioNuevo(name, password);
  if (fallo) return NextResponse.json({ error: fallo.error }, { status: fallo.status });

  const validationError = validateRoleAndModulos(role, modulos_override);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  // «Colaborador» (opcional): la ficha por la que este usuario marca.
  const r = await insertarUsuario({ name, password, role, associated_company, modulos_override, empleado_codigo });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  // modulos_override (array) = permisos custom por usuario; null = hereda del rol.
  return NextResponse.json(r.user);
}

export async function PUT(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { id, name, password, role, associated_company, modulos_override, empleado_codigo } = await req.json();
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
    // 🔴 El mismo piso de 3 que el alta y que la ventana propia.
    if (String(password).length < LARGO_MINIMO_CONTRASENA) {
      return NextResponse.json({ error: AVISO_CONTRASENA_CORTA }, { status: 400 });
    }
    // Unicidad de contraseña, excluyendo al propio usuario editado.
    if (await contrasenaEnUso(password, id)) {
      return NextResponse.json({ error: AVISO_CONTRASENA_REPETIDA }, { status: 400 });
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

  // «Colaborador»: `undefined` = no se toca; vacío o `null` = sin vincular.
  if (empleado_codigo !== undefined) update.empleado_codigo = codigoDeColaborador(empleado_codigo);

  const { error } = await supabaseServer.from("fg_users").update(update).eq("id", id);
  if (error) {
    // La base exige que la ficha exista y que tenga un solo usuario: se dice en palabras.
    const vinculo = avisoDeVinculo(error);
    if (vinculo) return NextResponse.json({ error: vinculo }, { status: 409 });
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }

  // modulos_override (array) = permisos custom por usuario; null = hereda del rol.
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const { id, active } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // El guard del único administrador y el corte de sesiones al desactivar
  // viven en `cambiarActivo` (la baja de un colaborador usa el mismo).
  const r = await cambiarActivo(id, active);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, sesionesRevocadas: r.sesionesRevocadas });
}
