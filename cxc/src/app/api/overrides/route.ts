import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer.from("cxc_client_overrides").select("*");
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { nombre_normalized, correo, telefono, celular, contacto } = body;

  const { data, error } = await supabaseServer
    .from("cxc_client_overrides")
    .upsert(
      {
        nombre_normalized,
        correo,
        telefono,
        celular,
        contacto,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "nombre_normalized" }
    )
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
