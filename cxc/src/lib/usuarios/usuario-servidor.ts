// ─────────────────────────────────────────────────────────────────────────────
// CREAR, VINCULAR Y DESACTIVAR UN USUARIO — UN solo lugar (9-oct-2026).
//
// Daniel: «hoy agregué una, pero mañana puedo necesitar eliminarla y crear
// otra». Un colaborador que marca desde el teléfono son cuatro cosas —ficha,
// horario, usuario y el vínculo `fg_users.empleado_codigo`— y el vínculo no lo
// escribía ninguna pantalla. Ahora lo escriben dos: Usuarios (campo
// «Colaborador») y Asistencia › «+ Nuevo colaborador» (interruptor «Marcación
// desde el teléfono»). Las DOS pasan por estas funciones: mismo hash, misma
// regla de contraseña repetida, mismo corte de sesiones al desactivar.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import {
  AVISO_CONTRASENA_CORTA,
  AVISO_CONTRASENA_REPETIDA,
  LARGO_MINIMO_CONTRASENA,
  contrasenaEnUso,
} from "@/lib/auth/contrasena-en-uso";

/** Las columnas que viajan al navegador. NUNCA `password`. */
export const COLUMNAS_DE_USUARIO =
  "id, name, role, active, associated_company, modulos_override, empleado_codigo, is_owner, created_at, updated_at";

export type Fallo = { ok: false; error: string; status: number };

/** `""`, `null` o `undefined` = sin vincular. */
export function codigoDeColaborador(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

/**
 * Lo que la base contesta cuando el vínculo no se puede guardar, en palabras.
 * La base es la que manda: la ficha tiene que existir (FK) y un colaborador
 * tiene un solo usuario (índice único `fg_users_empleado_codigo_uniq`).
 */
export function avisoDeVinculo(err: { code?: string; message?: string } | null | undefined): string | null {
  if (!err) return null;
  const texto = `${err.code ?? ""} ${err.message ?? ""}`;
  if (/23505/.test(texto) && /empleado_codigo/.test(texto)) {
    return "Ese colaborador ya está vinculado a otro usuario. Quita el vínculo del otro usuario primero.";
  }
  if (/23503/.test(texto) && /empleado_codigo/.test(texto)) {
    return "Ese colaborador no tiene ficha en Asistencia. Crea la ficha primero.";
  }
  return null;
}

/**
 * Todo lo que puede frenar un usuario nuevo, ANTES de escribir nada: nombre,
 * largo de la contraseña, nombre repetido y contraseña repetida (el login no
 * pide usuario: la contraseña ES la identidad).
 */
export async function revisarUsuarioNuevo(name: unknown, password: unknown): Promise<Fallo | null> {
  const fallo = (error: string): Fallo => ({ ok: false, error, status: 400 });
  if (!name || !password) return fallo("Nombre y contraseña requeridos");
  const nombre = String(name).trim();
  if (nombre.length < 3) return fallo("El nombre debe tener al menos 3 caracteres");
  if (String(password).length < LARGO_MINIMO_CONTRASENA) return fallo(AVISO_CONTRASENA_CORTA);
  const { data: existing } = await supabaseServer.from("fg_users").select("id").eq("name", nombre).limit(1);
  if (existing && existing.length > 0) return fallo("Ya existe un usuario con ese nombre");
  if (await contrasenaEnUso(String(password))) return fallo(AVISO_CONTRASENA_REPETIDA);
  return null;
}

export interface UsuarioNuevo {
  name: string;
  password: string;
  role?: string | null;
  associated_company?: string | null;
  modulos_override?: string[] | null;
  empleado_codigo?: string | null;
}

/** Hash bcrypt + insert. Quien llama ya pasó por `revisarUsuarioNuevo`. */
export async function insertarUsuario(u: UsuarioNuevo): Promise<{ ok: true; user: Record<string, unknown> } | Fallo> {
  const bcrypt = (await import("bcryptjs")).default;
  const hashed = await bcrypt.hash(u.password, 10);
  const overrideVal = Array.isArray(u.modulos_override) && u.modulos_override.length > 0 ? u.modulos_override : null;
  const { data: user, error } = await supabaseServer
    .from("fg_users")
    .insert({
      name: u.name.trim(),
      password: hashed,
      role: u.role || "vendedor",
      associated_company: u.associated_company || null,
      modulos_override: overrideVal,
      empleado_codigo: codigoDeColaborador(u.empleado_codigo),
    })
    .select(COLUMNAS_DE_USUARIO)
    .single();
  if (error || !user) {
    const vinculo = avisoDeVinculo(error);
    if (vinculo) return { ok: false, error: vinculo, status: 409 };
    return { ok: false, error: "Error al crear usuario", status: 500 };
  }
  return { ok: true, user: user as Record<string, unknown> };
}

/** ¿Desactivar a `targetId` dejaría al sistema sin administradores activos? */
export async function dejariaSinAdministrador(targetId: string): Promise<boolean> {
  const { data } = await supabaseServer.from("fg_users").select("id").eq("role", "admin").eq("active", true);
  const activos = data || [];
  return activos.length === 1 && activos[0].id === targetId;
}

/**
 * Activa o desactiva. Al DESACTIVAR corta sus sesiones vivas: el middleware
 * valida `user_sessions.revoked`, no `fg_users.active`. Nada se borra.
 */
export async function cambiarActivo(
  id: string,
  active: boolean,
): Promise<{ ok: true; name: string; sesionesRevocadas: number } | Fallo> {
  if (active === false && (await dejariaSinAdministrador(id))) {
    return { ok: false, error: "No puedes desactivar al único administrador activo.", status: 400 };
  }
  const { data: updatedUser, error } = await supabaseServer
    .from("fg_users")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("name")
    .single();
  if (error || !updatedUser) return { ok: false, error: "Error al actualizar", status: 500 };

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
  return { ok: true, name: String(updatedUser.name), sesionesRevocadas };
}

/** El usuario vinculado a una ficha, o `null`. Un colaborador tiene a lo sumo uno. */
export async function usuarioDelColaborador(
  codigo: string,
): Promise<{ id: string; name: string; active: boolean } | null> {
  const { data } = await supabaseServer
    .from("fg_users")
    .select("id, name, active")
    .eq("empleado_codigo", codigo)
    .maybeSingle();
  const u = data as { id: string; name: string; active: boolean } | null;
  return u ? { id: String(u.id), name: String(u.name), active: !!u.active } : null;
}
