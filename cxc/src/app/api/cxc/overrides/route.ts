import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

// Overrides de contacto por cliente (cxc_client_overrides). Antes el dashboard
// los leía/escribía client-side con la anon key (fuga: anon podía leer datos de
// contacto de TODOS los clientes vía REST). Ahora pasa por acá con service_role
// tras cerrar la RLS de la tabla. Gate = mismos roles que acceden a CXC.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer.from("cxc_client_overrides").select("*");
  if (error) {
    console.error(`[cxc/overrides] ${error.message}`);
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
  if (!nombre) {
    return NextResponse.json({ error: "nombre_normalized requerido" }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const row = {
    nombre_normalized: nombre,
    correo: str(b.correo),
    telefono: str(b.telefono),
    celular: str(b.celular),
    contacto: str(b.contacto),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseServer
    .from("cxc_client_overrides")
    .upsert(row, { onConflict: "nombre_normalized" });
  if (error) {
    console.error(`[cxc/overrides] upsert: ${error.message}`);
    return NextResponse.json({ error: "Error al guardar contacto" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
