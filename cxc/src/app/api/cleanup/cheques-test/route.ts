import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { error } = await supabaseServer
    .from("cheques")
    .delete()
    .in("cliente", ["q", "prueba", "1w", "test", "TEST"]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, message: "Test records deleted" });
}
