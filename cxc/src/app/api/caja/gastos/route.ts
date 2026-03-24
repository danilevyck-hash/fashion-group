import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { periodo_id, fecha, nombre, ruc, dv, factura, subtotal, itbms, total } = body;

  const { data, error } = await supabaseServer
    .from("caja_gastos")
    .insert({ periodo_id, fecha, nombre, ruc, dv, factura, subtotal, itbms, total })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
