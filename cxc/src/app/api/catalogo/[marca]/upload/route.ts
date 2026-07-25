// Upload de fotos de producto. QUIRK heredado (unificar con OK de Daniel):
// roles y Storage difieren por marca — Reebok permite admin+secretaria y sube
// al Storage del proyecto Reebok (path products/); Joybees solo admin y sube al
// Storage del proyecto principal (path joybees/). Ver cfg.upload en marcas.ts.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";

// Lowercase + alfanuméricos, punto, guion, guion bajo — el resto → '_'.
// El path de Storage debe ser determinístico por SKU para que una re-subida
// sobrescriba el mismo objeto.
function normalizeSku(sku: string): string {
  return sku.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
}

export async function POST(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, cfg.upload.roles);
  if (auth instanceof NextResponse) return auth;

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Validación: solo imágenes reales y de tamaño razonable. Evita que un .txt
  // renombrado o un archivo de 0 bytes pase como "foto subida".
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "El archivo no es una imagen valida (usa JPG, PNG, WEBP o AVIF)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 5 * 1024) {
    return NextResponse.json({ error: "La imagen es muy pequena o esta danada (minimo 5KB)." }, { status: 400 });
  }

  // Con SKU (subida por fila) → path determinístico: cada re-subida sobrescribe
  // el mismo objeto (sin huérfanos en Storage). Sin SKU (subida masiva legacy) →
  // path con timestamp para no pisar subidas ajenas.
  const rawSku = (formData.get("sku") as string | null)?.trim() || "";
  const skuKey = rawSku ? normalizeSku(rawSku) : "";
  const filename = skuKey
    ? `${cfg.upload.pathPrefix}/${skuKey}`
    : `${cfg.upload.pathPrefix}/${Date.now()}-${file.name}`;

  const storageDb = cfg.upload.storage === "main" ? await cfg.mainDb() : await cfg.db();

  // cacheControl 1 año: la URL guardada lleva `?v=` nuevo en cada re-subida,
  // así que el objeto puede cachearse como inmutable (browser + CDN). Sin esto
  // Supabase sirve `cache-control: no-cache` y cada PDF/catálogo re-descarga
  // TODAS las fotos en cada generación.
  const { error: uploadError } = await storageDb.storage
    .from("product-images")
    .upload(filename, buffer, { contentType: file.type, upsert: true, cacheControl: "31536000" });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = storageDb.storage
    .from("product-images")
    .getPublicUrl(filename);

  // Cache-buster: con path determinístico la URL es estable; sin `?v=` el
  // browser seguiría sirviendo los bytes viejos cacheados tras una re-subida.
  // El `v` se fija UNA vez aquí y queda persistido en image_url — solo cambia
  // cuando cambia la foto (nunca por render).
  const url = skuKey ? `${publicUrl}?v=${Date.now()}` : publicUrl;

  return NextResponse.json({ url });
}
