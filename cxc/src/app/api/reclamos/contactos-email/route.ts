import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

// Libreta GLOBAL de contactos de correo (tabla contactos_email). Compartida por
// todos los reclamos/proveedores: correos frecuentes para agregar como To/CC al
// enviar un reclamo. Protegida por los roles del módulo (admin/secretaria).

const RECLAMOS_ROLES = ["admin", "secretaria"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, RECLAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("contactos_email")
    .select("id, email, nombre, created_at")
    .order("nombre", { ascending: true, nullsFirst: false })
    .order("email");

  if (error) return NextResponse.json({ error: "Error al cargar la libreta" }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, RECLAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  const nombre = String(body.nombre ?? "").trim() || null;
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("contactos_email")
    .insert({ email, nombre })
    .select("id, email, nombre, created_at")
    .single();

  if (error) {
    // 23505 = unique_violation (el correo ya está en la libreta).
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Ese correo ya está en la libreta" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al guardar el contacto" }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, RECLAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if ("email" in body) {
    const email = String(body.email ?? "").trim();
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
    fields.email = email;
  }
  if ("nombre" in body) {
    fields.nombre = String(body.nombre ?? "").trim() || null;
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("contactos_email")
    .update(fields)
    .eq("id", id)
    .select("id, email, nombre, created_at")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Ese correo ya está en la libreta" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al actualizar el contacto" }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, RECLAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const { error } = await supabaseServer.from("contactos_email").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Error al eliminar el contacto" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
