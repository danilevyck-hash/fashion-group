import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("reebok_pedidos_publicos")
    .select("id, short_id, items, total, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching reebok pedidos:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  // Pedidos viejos guardaron `total` sin multiplicar por bulto; recalcular
  // siempre desde `items` para que admin coincida con el link del cliente.
  const rows = (data || []).map((row) => ({
    ...row,
    total: calculateReebokOrderTotal(row.items || []),
  }));

  return NextResponse.json(rows);
}
