import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Validacion: solo imagenes reales y de tamano razonable. Evita que un .txt
  // renombrado o un archivo de 0 bytes pase como "foto subida".
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "El archivo no es una imagen valida (usa JPG, PNG, WEBP o AVIF)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 5 * 1024) {
    return NextResponse.json({ error: "La imagen es muy pequena o esta danada (minimo 5KB)." }, { status: 400 });
  }

  const filename = `joybees/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabaseServer.storage
    .from("product-images")
    .upload(filename, buffer, { contentType: file.type, upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = supabaseServer.storage
    .from("product-images")
    .getPublicUrl(filename);

  return NextResponse.json({ url: publicUrl });
}
