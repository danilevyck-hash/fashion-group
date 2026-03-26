import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const empresa = req.nextUrl.searchParams.get("empresa");
  const año = req.nextUrl.searchParams.get("año");
  const mes = req.nextUrl.searchParams.get("mes");
  if (!empresa || !año || !mes) return NextResponse.json({ error: "empresa, año, mes required" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("ventas_clientes")
    .select("*")
    .eq("empresa", empresa)
    .eq("año", parseInt(año))
    .eq("mes", parseInt(mes))
    .order("ventas", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!Array.isArray(body)) return NextResponse.json({ error: "Expected array" }, { status: 400 });

  const { error } = await supabaseServer
    .from("ventas_clientes")
    .upsert(body.map((r: { empresa: string; año: number; mes: number; cliente: string; ventas: number }) => ({
      empresa: r.empresa, año: r.año, mes: r.mes, cliente: r.cliente, ventas: r.ventas,
    })), { onConflict: "empresa,año,mes,cliente" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
