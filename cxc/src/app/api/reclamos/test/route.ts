import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("id, nro_reclamo")
    .limit(3);

  const { data: contactos, error: cErr } = await supabaseServer
    .from("reclamo_contactos")
    .select("*")
    .limit(5);

  return NextResponse.json({
    ok: !error,
    error: error?.message,
    reclamos: data,
    contactos,
    contactosError: cErr?.message,
  });
}
