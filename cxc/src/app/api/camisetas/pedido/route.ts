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

  // Find ALL existing rows for this combo (may have duplicates since no unique constraint)
  const { data: existingRows } = await supabaseServer
    .from("camisetas_pedidos")
    .select("id, paquetes")
    .eq("cliente_id", cliente_id)
    .eq("producto_id", producto_id);

  const rows = existingRows || [];
  const previous_paquetes = rows.length > 0 ? rows[0].paquetes : 0;

  // Clean up duplicates: keep only the first, delete the rest
  if (rows.length > 1) {
    const duplicateIds = rows.slice(1).map(r => r.id);
    await supabaseServer.from("camisetas_pedidos").delete().in("id", duplicateIds);
  }

  if (paquetes <= 0) {
    if (rows.length > 0) {
      await supabaseServer.from("camisetas_pedidos").delete().eq("id", rows[0].id);
      await logActivity(session?.role || "unknown", "pedido_update", "camisetas", { previous_paquetes, new_paquetes: 0, cliente_id, producto_id }, session?.userName);
    }
    return NextResponse.json({ ok: true });
  }

  let error;
  if (rows.length > 0) {
    ({ error } = await supabaseServer
      .from("camisetas_pedidos")
      .update({ paquetes, deleted: false })
      .eq("id", rows[0].id));
  } else {
    ({ error } = await supabaseServer
      .from("camisetas_pedidos")
      .insert({ cliente_id, producto_id, paquetes, deleted: false }));
  }

  if (error) { console.error("pedido save error:", error); return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 }); }
  const action = previous_paquetes > 0 && previous_paquetes !== paquetes ? "pedido_update" : "pedido_create";
  await logActivity(session?.role || "unknown", action, "camisetas", { previous_paquetes, new_paquetes: paquetes, cliente_id, producto_id }, session?.userName);
  return NextResponse.json({ ok: true });
}
