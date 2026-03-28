import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const showArchived = req.nextUrl.searchParams.get("archivados") === "1";

  let query = supabaseServer
    .from("prestamos_empleados")
    .select("*, prestamos_movimientos(*)")
    .order("nombre", { ascending: true });

  if (!showArchived) {
    query = query.eq("activo", true);
  }

  const { data, error } = await query;
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { nombre, empresa, deduccion_quincenal, notas } = body;

  if (!nombre) return NextResponse.json({ error: "Nombre es requerido" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("prestamos_empleados")
    .insert({
      nombre,
      empresa: empresa || null,
      deduccion_quincenal: deduccion_quincenal || 0,
      notas: notas || null,
    })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
