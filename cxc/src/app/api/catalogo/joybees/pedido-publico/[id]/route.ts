import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";

export const dynamic = "force-dynamic";

/**
 * Ruta PÚBLICA (sin auth) para el link compartible de un pedido Joybees. La
 * consume la página pública /pedido-joybees/[short_id]. Lee de
 * joybees_pedidos_publicos por short_id (Fase 2). Columnas explícitas (no
 * select("*")): endpoint público — evita filtrar columnas futuras por el link.
 * Espejo de reebok/pedido-publico/[id].
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { data, error } = await joybeesServer
      .from("joybees_pedidos_publicos")
      .select(
        "short_id, cliente_nombre, items, total, convertida, convertida_at, ped_order_number, created_at, id",
      )
      .eq("short_id", params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[joybees/pedido-publico] Error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
