import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";

const CHEQUES_ROLES = ["admin", "secretaria", "director"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || !CHEQUES_ROLES.includes(session.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const { data, error } = await supabaseServer
    .from("cheques")
    .select("*")
    .eq("deleted", false)
    .order("fecha_deposito", { ascending: true });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const s = getSession(req);
  if (!s || !CHEQUES_ROLES.includes(s.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const body = await req.json();
  const { cliente, empresa, banco, numero_cheque, monto, fecha_deposito, notas, vendedor } = body;

  if (!monto || monto <= 0) return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("cheques")
    .insert({ cliente, empresa, banco, numero_cheque, monto, fecha_deposito, notas: notas || "", vendedor: vendedor || "", estado: "pendiente" })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
