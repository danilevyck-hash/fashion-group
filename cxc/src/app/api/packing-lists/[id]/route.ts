import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { requireRole } from "@/lib/requireRole";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ_ROLES = ["admin", "secretaria", "bodega", "vendedor"];
const DELETE_ROLES = ["admin", "secretaria"];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, READ_ROLES);
  if (auth instanceof NextResponse) return auth;

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const { data: pl, error: plErr } = await supabaseServer
    .from("packing_lists")
    .select("*")
    .eq("id", params.id)
    .is("deleted_at", null)
    .single();

  if (plErr || !pl) {
    return NextResponse.json({ error: "Packing list no encontrado" }, { status: 404 });
  }

  const { data: items, error: itemsErr } = await supabaseServer
    .from("pl_items")
    .select("*")
    .eq("pl_id", params.id)
    .order("estilo", { ascending: true });

  if (itemsErr) {
    console.error(itemsErr);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  return NextResponse.json({ ...pl, items: items || [] });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, DELETE_ROLES);
  if (auth instanceof NextResponse) return auth;

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const { data: existing } = await supabaseServer
    .from("packing_lists")
    .select("id, numero_pl")
    .eq("id", params.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Packing list no encontrado" }, { status: 404 });
  }

  // Soft delete: marca deleted_at. El PL y sus pl_items se conservan (red de
  // retención 90 días); el cron purga físicamente después, con snapshot previo.
  const { error } = await supabaseServer
    .from("packing_lists")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.id)
    .is("deleted_at", null);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  await logActivity(
    auth.role,
    "packing_list_delete",
    "packing_lists",
    { plId: params.id, numeroPL: existing.numero_pl },
    auth.userName,
  );

  return NextResponse.json({ ok: true });
}
