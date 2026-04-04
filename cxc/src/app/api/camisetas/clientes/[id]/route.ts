import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const { estado } = await req.json();
  if (!estado) return NextResponse.json({ error: "estado required" }, { status: 400 });

  const { error } = await supabaseServer
    .from("camisetas_clientes")
    .update({ estado })
    .eq("id", params.id);

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;

  const { data: existing } = await supabaseServer.from("camisetas_clientes").select("nombre").eq("id", id).maybeSingle();

  // Soft delete: mark pedidos and client as deleted
  // Requires: ALTER TABLE camisetas_pedidos ADD COLUMN IF NOT EXISTS deleted boolean DEFAULT false;
  const { error: pedErr } = await supabaseServer.from("camisetas_pedidos").update({ deleted: true }).eq("cliente_id", id);
  if (pedErr) {
    console.error("Error soft-deleting pedidos for client", id, pedErr.message);
    return NextResponse.json({ error: `Error al eliminar pedidos: ${pedErr.message}` }, { status: 500 });
  }

  // Requires: ALTER TABLE camisetas_clientes ADD COLUMN IF NOT EXISTS deleted boolean DEFAULT false;
  const { error } = await supabaseServer.from("camisetas_clientes").update({ deleted: true }).eq("id", id);
  if (error) {
    console.error("Error soft-deleting client", id, error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "camisetas_cliente_delete", "camisetas", { clienteId: id, nombre: existing?.nombre }, session?.userName);

  return NextResponse.json({ ok: true });
}
