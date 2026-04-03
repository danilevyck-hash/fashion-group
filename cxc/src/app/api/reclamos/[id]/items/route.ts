import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const { items } = await req.json();

  // Backup current items before replacing
  const { data: backup } = await supabaseServer.from("reclamo_items").select("*").eq("reclamo_id", params.id);

  const { error: delErr } = await supabaseServer.from("reclamo_items").delete().eq("reclamo_id", params.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (items?.length > 0) {
    const rows = items.map((item: Record<string, unknown>) => ({
      reclamo_id: params.id,
      referencia: String(item.referencia || ""),
      descripcion: String(item.descripcion || ""),
      talla: String(item.talla || ""),
      cantidad: Number(item.cantidad) || 1,
      precio_unitario: Number(item.precio_unitario) || 0,
      subtotal: (Number(item.cantidad) || 1) * (Number(item.precio_unitario) || 0),
      motivo: String(item.motivo || "Faltante de Mercancía"),
    }));
    const { error: insErr } = await supabaseServer.from("reclamo_items").insert(rows);
    if (insErr) {
      // Restore backup if insert fails
      if (backup && backup.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        await supabaseServer.from("reclamo_items").insert(backup.map(({ id, ...rest }) => rest));
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "reclamo_items_update", "reclamos", { reclamoId: params.id, itemCount: items?.length || 0 }, session?.userName);

  return NextResponse.json({ ok: true });
}
