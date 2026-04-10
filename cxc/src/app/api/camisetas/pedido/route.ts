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
    if (previous_paquetes > 0) {
      await logActivity(session?.role || "unknown", "pedido_update", "camisetas", { previous_paquetes, new_paquetes: 0, cliente_id, producto_id }, session?.userName);
    }
    return NextResponse.json({ ok: true });
  }

  // Try update first, then insert if not found (works without unique constraint)
  const { data: existingRow } = await supabaseServer
    .from("camisetas_pedidos")
    .select("id")
    .eq("cliente_id", cliente_id)
    .eq("producto_id", producto_id)
    .limit(1)
    .single();

  let error;
  if (existingRow) {
    ({ error } = await supabaseServer
      .from("camisetas_pedidos")
      .update({ paquetes, deleted: false })
      .eq("id", existingRow.id));
  } else {
    ({ error } = await supabaseServer
      .from("camisetas_pedidos")
      .insert({ cliente_id, producto_id, paquetes, deleted: false }));
  }

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  const action = previous_paquetes > 0 && previous_paquetes !== paquetes ? "pedido_update" : "pedido_create";
  await logActivity(session?.role || "unknown", action, "camisetas", { previous_paquetes, new_paquetes: paquetes, cliente_id, producto_id }, session?.userName);
  return NextResponse.json({ ok: true });
}
