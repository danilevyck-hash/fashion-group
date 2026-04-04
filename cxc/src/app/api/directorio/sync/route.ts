import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const { nombre_normalized, correo, telefono, celular, contacto } = await req.json();
  if (!nombre_normalized) return NextResponse.json({ error: "nombre required" }, { status: 400 });

  // Find matching contact in directorio by normalized name
  const { data: existing } = await supabaseServer
    .from("directorio_clientes")
    .select("id, nombre")
    .eq("deleted", false);

  const match = (existing || []).find(d =>
    d.nombre.toUpperCase().trim().replace(/\s+/g, " ") === nombre_normalized
  );

  if (match) {
    const updates: Record<string, string> = {};
    if (correo) updates.correo = correo;
    if (telefono) updates.telefono = telefono;
    if (celular) updates.celular = celular;
    if (contacto) updates.contacto = contacto;
    if (Object.keys(updates).length > 0) {
      await supabaseServer.from("directorio_clientes").update(updates).eq("id", match.id);
    }
    return NextResponse.json({ synced: true, id: match.id });
  }
  return NextResponse.json({ synced: false });
}
