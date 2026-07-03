import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { getSession } from "@/lib/require-auth";
import { logActivity } from "@/lib/log-activity";
import { subirComprobante } from "@/lib/reclamos/comprobante-storage";

const RECLAMOS_ROLES = ["admin", "secretaria"];
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pasa un reclamo de "Creado" → "En proceso".
 * El comprobante (multipart `file`, foto o PDF) es OPCIONAL en este paso; la nota
 * también (`nota`). Si viene archivo, se guarda en el bucket reclamo-fotos
 * (subcarpeta /comprobante) y se escribe comprobante_url/path/nota.
 * El comprobante OBLIGATORIO se exige al marcar Pagado (endpoint settlements).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, RECLAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  // Solo desde "Creado" (la transición es de un paso).
  const { data: current } = await supabaseServer.from("reclamos").select("estado").eq("id", id).eq("deleted", false).maybeSingle();
  if (!current) return NextResponse.json({ error: "Reclamo no encontrado" }, { status: 404 });
  if (current.estado !== "Creado") {
    return NextResponse.json({ error: `Solo se puede pasar a "En proceso" desde "Creado".` }, { status: 400 });
  }

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  const nota = String(formData.get("nota") ?? "").trim();

  try {
    const updates: Record<string, unknown> = { estado: "En proceso", updated_at: new Date().toISOString() };
    let subido: { url: string; path: string } | null = null;
    if (file) {
      subido = await subirComprobante(id, file);
      if (!subido) return NextResponse.json({ error: "No se pudo subir el comprobante." }, { status: 500 });
      updates.comprobante_url = subido.url;
      updates.comprobante_path = subido.path;
      updates.comprobante_nota = nota || null;
    }

    const { error: updErr } = await supabaseServer.from("reclamos").update(updates).eq("id", id);
    if (updErr) { console.error(updErr); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

    // Nota de seguimiento (queda en el historial del reclamo).
    const session = getSession(req);
    await supabaseServer.from("reclamo_seguimiento").insert({
      reclamo_id: id,
      nota: subido
        ? `Pasó a "En proceso" — comprobante adjuntado${nota ? `: ${nota}` : ""}`
        : `Pasó a "En proceso"${nota ? ` — ${nota}` : ""}`,
      autor: session?.userName || session?.role || "",
    });
    await logActivity(session?.role || "unknown", "reclamo_en_proceso", "reclamos", { reclamoId: id, conComprobante: !!subido }, session?.userName);

    return NextResponse.json({
      ok: true,
      comprobante_url: subido?.url ?? null,
      comprobante_path: subido?.path ?? null,
      comprobante_nota: subido ? (nota || null) : null,
    });
  } catch (err) {
    console.error("en-proceso exception:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
