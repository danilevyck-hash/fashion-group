import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const { cliente_id, producto_id, paquetes } = await req.json();
  if (!cliente_id || !producto_id) return NextResponse.json({ error: "cliente_id and producto_id required" }, { status: 400 });

  if (paquetes <= 0) {
    await supabaseServer.from("camisetas_pedidos").delete().eq("cliente_id", cliente_id).eq("producto_id", producto_id);
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabaseServer
    .from("camisetas_pedidos")
    .upsert({ cliente_id, producto_id, paquetes }, { onConflict: "cliente_id,producto_id" });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
