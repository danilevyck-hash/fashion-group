import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;
  const año = req.nextUrl.searchParams.get("anio");
  const empresa = req.nextUrl.searchParams.get("empresa");
  if (!año) return NextResponse.json({ error: "año required" }, { status: 400 });

  let q = supabaseServer.from("ventas_mensuales").select("*").eq("año", parseInt(año));
  if (empresa) q = q.eq("empresa", empresa);
  q = q.order("mes", { ascending: true });

  const { data, error } = await q;
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const { empresa, año, mes, ventas_brutas, notas_credito, notas_debito, costo_total } = body;
  if (!empresa || !año || !mes) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("ventas_mensuales")
    .upsert({ empresa, año, mes, ventas_brutas: ventas_brutas || 0, notas_credito: notas_credito || 0, notas_debito: notas_debito || 0, costo_total: costo_total || 0, updated_at: new Date().toISOString() }, { onConflict: "empresa,año,mes" })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
