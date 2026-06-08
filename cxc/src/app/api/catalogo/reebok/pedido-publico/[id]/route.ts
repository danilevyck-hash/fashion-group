import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const { data, error } = await supabase
      .from("reebok_pedidos_publicos")
      // Columnas explícitas (no select("*")): endpoint público — evita que una
      // columna futura se filtre sin querer por el link compartido.
      .select(
        "short_id,cliente_nombre,items,total,convertida,convertida_at,ped_order_number,created_at,id",
      )
      .eq("short_id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("Error fetching public order:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
