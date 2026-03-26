import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const año = req.nextUrl.searchParams.get("año");
  if (!año) return NextResponse.json({ error: "año required" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("ventas_metas")
    .select("*")
    .eq("año", parseInt(año));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!Array.isArray(body)) return NextResponse.json({ error: "Expected array" }, { status: 400 });

  const { error } = await supabaseServer
    .from("ventas_metas")
    .upsert(body.map((r: { empresa: string; año: number; mes: number; meta: number }) => ({
      empresa: r.empresa, año: r.año, mes: r.mes, meta: r.meta,
    })), { onConflict: "empresa,año,mes" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
