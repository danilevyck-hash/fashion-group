import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${params.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabaseServer.storage
    .from("reclamo-fotos")
    .upload(path, file, { contentType: file.type });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: urlData } = supabaseServer.storage.from("reclamo-fotos").getPublicUrl(path);

  const { data, error } = await supabaseServer
    .from("reclamo_fotos")
    .insert({ reclamo_id: params.id, storage_path: path, url: urlData.publicUrl })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { foto_id, storage_path } = body;

  await supabaseServer.storage.from("reclamo-fotos").remove([storage_path]);
  await supabaseServer.from("reclamo_fotos").delete().eq("id", foto_id);

  return NextResponse.json({ ok: true });
}
