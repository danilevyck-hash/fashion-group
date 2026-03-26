import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const empleadoId = req.nextUrl.searchParams.get("empleado_id");

  let query = supabaseServer
    .from("prestamos_movimientos")
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (empleadoId) {
    query = query.eq("empleado_id", empleadoId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { empleado_id, fecha, concepto, monto, notas } = body;

  if (!empleado_id || !fecha || !concepto || !monto) {
    return NextResponse.json({ error: "Todos los campos son requeridos" }, { status: 400 });
  }
  if (Number(monto) <= 0) {
    return NextResponse.json({ error: "El monto debe ser positivo" }, { status: 400 });
  }

  // Determine estado based on concepto and monto
  let estado = "aprobado";
  if ((concepto === "Préstamo" || concepto === "Cargo por daño") && Number(monto) >= 500) {
    estado = "pendiente_aprobacion";
  }

  const { data, error } = await supabaseServer
    .from("prestamos_movimientos")
    .insert({
      empleado_id,
      fecha,
      concepto,
      monto: Number(monto),
      notas: notas || null,
      estado,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
