import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { getSession } from "@/lib/require-auth";
import { logActivity } from "@/lib/log-activity";
import { subirComprobante } from "@/lib/reclamos/comprobante-storage";

const RECLAMOS_ROLES = ["admin", "secretaria"];
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Adjunta (o reemplaza) el COMPROBANTE de un reclamo — foto o PDF — SIN cambiar
 * el estado. Es el paso previo obligatorio para marcar Pagado cuando el reclamo
 * aún no tiene comprobante (el flip a Pagado lo valida el endpoint settlements).
 * Body: multipart `file` (obligatorio) + `nota` (opcional).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, RECLAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const { data: current } = await supabaseServer.from("reclamos").select("estado").eq("id", id).eq("deleted", false).maybeSingle();
  if (!current) return NextResponse.json({ error: "Reclamo no encontrado" }, { status: 404 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  const nota = String(formData.get("nota") ?? "").trim();
  if (!file) {
    return NextResponse.json({ error: "Adjunta el comprobante (foto o PDF)." }, { status: 400 });
  }

  try {
    const subido = await subirComprobante(id, file);
    if (!subido) return NextResponse.json({ error: "No se pudo subir el comprobante." }, { status: 500 });

    const { error: updErr } = await supabaseServer.from("reclamos").update({
      comprobante_url: subido.url,
      comprobante_path: subido.path,
      comprobante_nota: nota || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (updErr) { console.error(updErr); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

    const session = getSession(req);
    await supabaseServer.from("reclamo_seguimiento").insert({
      reclamo_id: id,
      nota: `Comprobante adjuntado${nota ? `: ${nota}` : ""}`,
      autor: session?.userName || session?.role || "",
    });
    await logActivity(session?.role || "unknown", "reclamo_comprobante", "reclamos", { reclamoId: id }, session?.userName);

    return NextResponse.json({ ok: true, comprobante_url: subido.url, comprobante_path: subido.path, comprobante_nota: nota || null });
  } catch (err) {
    console.error("comprobante exception:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
