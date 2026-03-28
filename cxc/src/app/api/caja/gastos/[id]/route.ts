import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const ALLOWED_FIELDS = ["fecha", "descripcion", "proveedor", "categoria", "subtotal", "itbms", "total", "responsable", "metodo_pago", "numero_factura"];

function pick(body: Record<string, unknown>, fields: string[]) {
  const result: Record<string, unknown> = {};
  for (const f of fields) { if (f in body) result[f] = body[f]; }
  return result;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const fields = pick(body, ALLOWED_FIELDS);

  const { data, error } = await supabaseServer
    .from("caja_gastos")
    .update(fields)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Error al actualizar gasto" }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const { error } = await supabaseServer.from("caja_gastos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Error al eliminar gasto" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
