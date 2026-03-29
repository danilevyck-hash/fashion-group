import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

// ventas_metas table has column "año" (with ñ) — never renamed

export async function GET(req: NextRequest) {
  const anio = req.nextUrl.searchParams.get("anio");
  if (!anio) return NextResponse.json({ error: "anio requerido" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("ventas_metas")
    .select("*")
    .eq("anio", parseInt(anio, 10))
    .order("empresa", { ascending: true })
    .order("mes", { ascending: true });

  if (error) {
    console.error("[ventas/metas GET]", error.code, error.message);
    if (error.code === "42P01") return NextResponse.json([]);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const body = await req.json();
  const records: { empresa: string; año: number; mes: number; meta: number }[] = Array.isArray(body) ? body : [body];

  if (records.length === 0) return NextResponse.json({ error: "Sin datos" }, { status: 400 });

  for (const r of records) {
    if (!r.empresa || !r.año || !r.mes)
      return NextResponse.json({ error: "empresa, año y mes son requeridos" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("ventas_metas")
    .upsert(
      records.map((r) => ({ empresa: r.empresa, anio: r.año, mes: r.mes, meta: r.meta ?? 0 })),
      { onConflict: "empresa,anio,mes" }
    );

  if (error) {
    console.error("[ventas/metas POST]", error.code, error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;
  const empresa = params.get("empresa");
  const anio = params.get("anio");
  const mes = params.get("mes");

  if (!empresa || !anio || !mes)
    return NextResponse.json({ error: "empresa, anio y mes son requeridos" }, { status: 400 });

  const { error } = await supabaseServer
    .from("ventas_metas")
    .delete()
    .eq("empresa", empresa)
    .eq("anio", parseInt(anio, 10))
    .eq("mes", parseInt(mes, 10));

  if (error) {
    console.error("[ventas/metas DELETE]", error.code, error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
