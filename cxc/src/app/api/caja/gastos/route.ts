import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { periodo_id, fecha, descripcion, proveedor, nro_factura, responsable, categoria, subtotal, itbms, total } = body;

  const { data, error } = await supabaseServer
    .from("caja_gastos")
    .insert({
      periodo_id, fecha,
      descripcion: descripcion || "",
      proveedor: proveedor || "",
      nro_factura: nro_factura || "",
      responsable: responsable || "",
      categoria: categoria || "Varios",
      subtotal, itbms, total,
      // Keep old fields populated for backwards compat
      nombre: descripcion || "",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
