import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

// Bitácora de contactos de cobro (cxc_contact_log). GET = últimos 2000 (para el
// "último contacto" por cliente); POST = registrar un contacto. Antes anon
// client-side; ahora service_role tras cerrar la RLS. Gate = roles de CXC.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("cxc_contact_log")
    .select("*")
    .order("contacted_at", { ascending: false })
    .limit(2000);
  if (error) {
    console.error(`[cxc/contact-log] ${error.message}`);
    return NextResponse.json({ error: "Error al leer contactos" }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const nombre = typeof b.nombre_normalized === "string" ? b.nombre_normalized.trim() : "";
  const method = typeof b.method === "string" ? b.method.trim() : "";
  if (!nombre || !method) {
    return NextResponse.json({ error: "nombre_normalized y method requeridos" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("cxc_contact_log")
    .insert({ nombre_normalized: nombre, method });
  if (error) {
    console.error(`[cxc/contact-log] insert: ${error.message}`);
    return NextResponse.json({ error: "Error al registrar contacto" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
