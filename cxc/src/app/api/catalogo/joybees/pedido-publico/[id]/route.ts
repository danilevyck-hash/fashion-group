import { NextRequest, NextResponse } from "next/server";
import { joybeesServer } from "@/lib/joybees-supabase-server";

export const dynamic = "force-dynamic";
// Sin Data Cache en los fetch internos (gotcha Next.js + supabase-js), espejo
// del GET Reebok. joybeesServer ya trae cache:'no-store'; esto refuerza.
export const fetchCache = "force-no-store";

// Columnas del link público. confirmado_cliente_at es de la migración
// 20260724120000 — si aún no corrió, se reintenta sin ella (tolerante).
const COLS_BASE =
  "short_id,cliente_nombre,items,total,convertida,convertida_at,ped_order_number,created_at,id,deleted";
const COLS_FULL = `${COLS_BASE},confirmado_cliente_at`;

/**
 * Ruta PÚBLICA (sin auth) para el link compartible de un pedido Joybees. La
 * consume la página pública /pedido-joybees/[short_id]. Lee de
 * joybees_pedidos_publicos por short_id. Columnas explícitas (no select("*")):
 * endpoint público — evita filtrar columnas futuras por el link. Incluye
 * estado_cliente ('Confirmado' | 'En proceso') sin exponer el pipeline interno.
 * Espejo de reebok/pedido-publico/[id].
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    let { data, error } = await joybeesServer
      .from("joybees_pedidos_publicos")
      .select(COLS_FULL)
      .eq("short_id", params.id)
      .maybeSingle();
    if (error) {
      // Migración pendiente (columna confirmado_cliente_at ausente) → fallback.
      const retry = await joybeesServer
        .from("joybees_pedidos_publicos")
        .select(COLS_BASE)
        .eq("short_id", params.id)
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
      const { data: order } = await joybeesServer
        .from("joybees_orders")
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
    console.error("[joybees/pedido-publico] Error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
