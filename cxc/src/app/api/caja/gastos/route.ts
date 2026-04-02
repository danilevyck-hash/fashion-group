import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session || !["admin", "secretaria"].includes(session.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const body = await req.json();
  const { periodo_id, fecha, descripcion, proveedor, nro_factura, responsable, categoria, empresa, subtotal, itbms, total } = body;

  const { data, error } = await supabaseServer
    .from("caja_gastos")
    .insert({
      periodo_id, fecha,
      descripcion: descripcion || "",
      proveedor: proveedor || "",
      nro_factura: nro_factura || "",
      responsable: responsable || "",
      categoria: categoria || "Varios",
      empresa: empresa || "",
      subtotal, itbms, total,
      // Keep old fields populated for backwards compat
      nombre: descripcion || "",
    })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
