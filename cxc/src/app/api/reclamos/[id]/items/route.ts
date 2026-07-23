import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";
import { validateReclamoItems } from "@/lib/reclamos/validate";
import { buildReclamoItemRows } from "@/lib/reclamos/item-rows";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const { items } = await req.json();

  // Obligatoriedad: >= 1 ítem y cada uno completo. Se valida ANTES de borrar los
  // existentes para no dejar el reclamo sin ítems si el payload es inválido.
  const vErr = validateReclamoItems(items);
  if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });

  // Backup current items before replacing
  const { data: backup } = await supabaseServer.from("reclamo_items").select("*").eq("reclamo_id", params.id);

  const { error: delErr } = await supabaseServer.from("reclamo_items").delete().eq("reclamo_id", params.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (items?.length > 0) {
    // subtotal NO se envía (la columna no existe en la tabla — se deriva al vuelo)
    // y nro_factura/nro_orden_compra SÍ (antes se perdían al editar).
    const rows = buildReclamoItemRows(params.id, items);
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
