import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]); if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer.from("cxc_client_overrides").select("*");
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const { nombre_normalized, correo, telefono, celular, contacto, resultado_contacto, proximo_seguimiento } = body;

  // Build update object — only include contact tracking fields if provided
  const upsertData: Record<string, unknown> = {
    nombre_normalized,
    correo,
    telefono,
    celular,
    contacto,
    updated_at: new Date().toISOString(),
  };
  if (resultado_contacto !== undefined) upsertData.resultado_contacto = resultado_contacto;
  if (proximo_seguimiento !== undefined) upsertData.proximo_seguimiento = proximo_seguimiento;

  const { data, error } = await supabaseServer
    .from("cxc_client_overrides")
    .upsert(upsertData, { onConflict: "nombre_normalized" })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
