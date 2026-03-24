import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("caja_periodos")
    .select("*, caja_gastos(total)")
    .order("numero", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data || []).map((p) => ({
    ...p,
    total_gastado: (p.caja_gastos || []).reduce((s: number, g: { total: number }) => s + (g.total || 0), 0),
  }));

  return NextResponse.json(result);
}

export async function POST() {
  // Auto-increment numero
  const { data: last } = await supabaseServer
    .from("caja_periodos")
    .select("numero")
    .order("numero", { ascending: false })
    .limit(1)
    .single();

  const numero = (last?.numero || 0) + 1;
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseServer
    .from("caja_periodos")
    .insert({ numero, fecha_apertura: today, fondo_inicial: 200, estado: "abierto" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
