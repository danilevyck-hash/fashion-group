import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await supabase.from("cxc_client_overrides").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { nombre_normalized, correo, telefono, celular, contacto } = body;

  const { data, error } = await supabase
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
