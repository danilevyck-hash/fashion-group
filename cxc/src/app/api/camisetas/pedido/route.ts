import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { getSession } from "@/lib/require-auth";
import { logActivity } from "@/lib/log-activity";

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const session = getSession(req);
  const { cliente_id, producto_id, paquetes } = await req.json();
  if (!cliente_id || !producto_id) return NextResponse.json({ error: "cliente_id and producto_id required" }, { status: 400 });

  // Query previous value for audit trail
  const { data: existing } = await supabaseServer
    .from("camisetas_pedidos")
    .select("paquetes")
    .eq("cliente_id", cliente_id)
    .eq("producto_id", producto_id)
    .single();
  const previous_paquetes = existing?.paquetes ?? 0;

  if (paquetes <= 0) {
    await supabaseServer.from("camisetas_pedidos").delete().eq("cliente_id", cliente_id).eq("producto_id", producto_id);
    await logActivity(session?.role || "unknown", "pedido_change", "camisetas", { previous_paquetes, new_paquetes: 0, cliente_id, producto_id }, session?.userName);
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabaseServer
    .from("camisetas_pedidos")
    .upsert({ cliente_id, producto_id, paquetes }, { onConflict: "cliente_id,producto_id" });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  await logActivity(session?.role || "unknown", "pedido_change", "camisetas", { previous_paquetes, new_paquetes: paquetes, cliente_id, producto_id }, session?.userName);
  return NextResponse.json({ ok: true });
}
