import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

const RECLAMOS_ROLES = ["admin", "secretaria"];
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, RECLAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    console.log(`Foto upload: ${file.name}, size: ${buffer.length} bytes`);

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const storagePath = `${id}/${fileName}`;

    const contentType = file.type ||
      (ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
       ext === "png" ? "image/png" :
       ext === "gif" ? "image/gif" :
       ext === "webp" ? "image/webp" : "image/jpeg");

    const { error: uploadError } = await supabaseServer.storage
      .from("reclamo-fotos")
      .upload(storagePath, buffer, { contentType, upsert: true });

    if (uploadError) {
      console.error("Storage upload error:", JSON.stringify(uploadError));
      return NextResponse.json({ error: uploadError.message, details: uploadError }, { status: 500 });
    }

    const { data: urlData } = supabaseServer.storage.from("reclamo-fotos").getPublicUrl(storagePath);

    const { data, error: dbError } = await supabaseServer
      .from("reclamo_fotos")
      .insert({ reclamo_id: id, storage_path: storagePath, url: urlData.publicUrl })
      .select()
      .single();

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    console.error("Foto upload exception:", err);
    console.error(err); return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, RECLAMOS_ROLES);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const { foto_id, storage_path } = body;

  await supabaseServer.storage.from("reclamo-fotos").remove([storage_path]);
  await supabaseServer.from("reclamo_fotos").delete().eq("id", foto_id);

  return NextResponse.json({ ok: true });
}
