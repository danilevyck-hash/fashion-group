import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { getSession } from "@/lib/require-auth";
import { logActivity } from "@/lib/log-activity";

const RECLAMOS_ROLES = ["admin", "secretaria"];
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pasa un reclamo de "Creado" → "En proceso".
 * EXIGE una foto de comprobante (multipart `file`); la nota es opcional (`nota`).
 * Guarda la foto en el bucket reclamo-fotos (subcarpeta /comprobante) y escribe
 * comprobante_url/path/nota + estado en el reclamo, más una nota de seguimiento.
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
  if (!file) {
    return NextResponse.json({ error: "Debes subir una foto de comprobante para pasar a En proceso." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const storagePath = `${id}/comprobante/${crypto.randomUUID()}.${ext}`;
    const contentType = file.type ||
      (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");

    const { error: uploadError } = await supabaseServer.storage
      .from("reclamo-fotos")
      .upload(storagePath, buffer, { contentType, upsert: true });
    if (uploadError) {
      console.error("Comprobante upload error:", JSON.stringify(uploadError));
      return NextResponse.json({ error: "No se pudo subir el comprobante." }, { status: 500 });
    }

    const { data: urlData } = supabaseServer.storage.from("reclamo-fotos").getPublicUrl(storagePath);

    const { error: updErr } = await supabaseServer.from("reclamos").update({
      estado: "En proceso",
      comprobante_url: urlData.publicUrl,
      comprobante_path: storagePath,
      comprobante_nota: nota || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (updErr) { console.error(updErr); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

    // Nota de seguimiento (queda en el historial del reclamo).
    const session = getSession(req);
    await supabaseServer.from("reclamo_seguimiento").insert({
      reclamo_id: id,
      nota: `Pasó a "En proceso" — comprobante subido${nota ? `: ${nota}` : ""}`,
      autor: session?.userName || session?.role || "",
    });
    await logActivity(session?.role || "unknown", "reclamo_en_proceso", "reclamos", { reclamoId: id }, session?.userName);

    return NextResponse.json({ ok: true, comprobante_url: urlData.publicUrl, comprobante_path: storagePath, comprobante_nota: nota || null });
  } catch (err) {
    console.error("en-proceso exception:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
