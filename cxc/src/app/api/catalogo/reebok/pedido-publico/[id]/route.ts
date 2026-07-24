import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Columnas del link público. confirmado_cliente_at es de la migración
// 20260724120000 — si aún no corrió, se reintenta sin ella (tolerante).
const COLS_BASE =
  "short_id,cliente_nombre,items,total,convertida,convertida_at,ped_order_number,created_at,id,deleted";
const COLS_FULL = `${COLS_BASE},confirmado_cliente_at`;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Columnas explícitas (no select("*")): endpoint público — evita que una
    // columna futura se filtre sin querer por el link compartido.
    let { data, error } = await supabase
      .from("reebok_pedidos_publicos")
      .select(COLS_FULL)
      .eq("short_id", id)
      .maybeSingle();
    if (error) {
      // Migración pendiente (columna confirmado_cliente_at ausente) → fallback.
      const retry = await supabase
        .from("reebok_pedidos_publicos")
        .select(COLS_BASE)
        .eq("short_id", id)
        .maybeSingle();
      data = retry.data as typeof data;
      error = retry.error;
    }

    if (error || !data || (data as { deleted?: boolean }).deleted) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    // Estado para el CLIENTE (español simple, sin exponer el pipeline interno
    // ni Switch): 'Confirmado' al entrar; 'En proceso' si el pedido ya avanzó.
    let estado_cliente: "Confirmado" | "En proceso" | null = null;
    const row = data as { convertida?: boolean; ped_order_number?: string | null };
    if (row.convertida && row.ped_order_number) {
      estado_cliente = "Confirmado";
      const { data: order } = await supabase
        .from("reebok_orders")
        .select("status")
        .eq("order_number", row.ped_order_number)
        .maybeSingle();
      const status = (order?.status as string | undefined) || "";
      if (status && status !== "borrador") estado_cliente = "En proceso";
    }

    const { deleted: _deleted, ...pub } = data as Record<string, unknown>;
    return NextResponse.json({
      ...pub,
      confirmado_cliente_at: (data as { confirmado_cliente_at?: string | null }).confirmado_cliente_at ?? null,
      estado_cliente,
    });
  } catch (err) {
    console.error("Error fetching public order:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
