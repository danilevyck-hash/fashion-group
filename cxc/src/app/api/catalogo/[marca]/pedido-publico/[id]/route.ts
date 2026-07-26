import { NextRequest, NextResponse } from "next/server";
import { getMarcaConfig } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";
// Sin Data Cache en los fetch internos (gotcha Next.js + supabase-js): sin esto
// el GET servía un snapshot viejo del pedido (p.ej. seguía respondiendo 200
// tras un soft-delete, o convertida=false tras confirmar). Los clients server
// ya traen cache:'no-store'; fetchCache refuerza a nivel de ruta.
export const fetchCache = "force-no-store";

// Columnas del link público. Las columnas nuevas se piden de más a menos y se
// cae al siguiente juego si la migración aún no corrió (tolerante):
//   stock_confirmacion    — DDL 20260725130000 (foto del stock al confirmar)
//   confirmado_cliente_at — DDL 20260724120000
const COLS_BASE =
  "short_id,cliente_nombre,items,total,convertida,convertida_at,ped_order_number,created_at,id,deleted";
const COLS_CONFIRM = `${COLS_BASE},confirmado_cliente_at`;
const COLS_FULL = `${COLS_CONFIRM},stock_confirmacion`;
const COLS_INTENTOS = [COLS_FULL, COLS_CONFIRM, COLS_BASE];

/**
 * Ruta PÚBLICA (sin auth) para el link compartible de un pedido. La consume la
 * página pública /pedido-<marca>/[short_id]. Lee de cfg.publicosTable por
 * short_id. Columnas explícitas (no select("*")): endpoint público — evita
 * filtrar columnas futuras por el link. Incluye estado_cliente
 * ('Confirmado' | 'En proceso') sin exponer el pipeline interno.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { marca: string; id: string } },
) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  try {
    const supabase = await cfg.publicosDb();
    const { id } = params;

    let data: Record<string, unknown> | null = null;
    let error: { message: string } | null = null;
    for (const cols of COLS_INTENTOS) {
      const res = await supabase
        .from(cfg.publicosTable)
        .select(cols)
        .eq("short_id", id)
        .maybeSingle();
      data = (res.data as Record<string, unknown> | null) ?? null;
      error = res.error;
      if (!error) break;
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
        .from(cfg.ordersTable)
        .select("status")
        .eq("order_number", row.ped_order_number)
        .maybeSingle();
      // 'confirmado' es el estado con el que entra un pedido del link (lo pone
      // la confirmación pública antes de mandarlo a Switch): para el CLIENTE
      // eso sigue siendo "Confirmado". "En proceso" queda para cuando el
      // pedido avanzó más en el pipeline interno.
      const status = (order?.status as string | undefined) || "";
      if (status && status !== "borrador" && status !== "confirmado") {
        estado_cliente = "En proceso";
      }
    }

    const { deleted: _deleted, ...pub } = data as Record<string, unknown>;
    return NextResponse.json({
      ...pub,
      confirmado_cliente_at: (data.confirmado_cliente_at as string | null) ?? null,
      // Foto del stock al confirmar (null mientras la DDL 20260725130000 no
      // corra) — la página del pedido la usa para decir la cantidad REAL.
      stock_confirmacion: (data.stock_confirmacion as unknown[] | null) ?? null,
      estado_cliente,
    });
  } catch (err) {
    console.error(`[${params.marca}/pedido-publico] Error:`, err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
