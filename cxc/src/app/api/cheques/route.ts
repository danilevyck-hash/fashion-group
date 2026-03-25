import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("cheques")
    .select("*")
    .order("fecha_deposito", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { cliente, empresa, banco, numero_cheque, monto, fecha_deposito, notas } = body;

  const { data, error } = await supabaseServer
    .from("cheques")
    .insert({ cliente, empresa, banco, numero_cheque, monto, fecha_deposito, notas: notas || "" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
