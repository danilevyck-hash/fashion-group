import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  const { error } = await supabaseServer
    .from("caja_gastos")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
