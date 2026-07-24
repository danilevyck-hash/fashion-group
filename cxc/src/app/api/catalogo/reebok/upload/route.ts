import { NextRequest, NextResponse } from 'next/server'
import { reebokServer } from '@/lib/reebok-supabase-server'
import { requireRole } from '@/lib/requireRole'

export const dynamic = "force-dynamic";

// Lowercase + keep alphanumerics, period, hyphen, underscore — everything else → '_'.
// Storage paths must be deterministic per SKU so a re-upload overwrites the same object.
function normalizeSku(sku: string): string {
  return sku.toLowerCase().replace(/[^a-z0-9._-]/g, '_')
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'secretaria'])
  if (auth instanceof NextResponse) return auth
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Validacion: solo imagenes reales y de tamano razonable. Evita que un .txt
  // renombrado o un archivo de 0 bytes pase como "foto subida".
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'El archivo no es una imagen valida (usa JPG, PNG, WEBP o AVIF).' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length < 5 * 1024) {
    return NextResponse.json({ error: 'La imagen es muy pequena o esta danada (minimo 5KB).' }, { status: 400 })
  }

  // When the caller supplies the resolved SKU we use a deterministic path so
  // every re-upload overwrites the same Storage object (no orphans). The path
  // intentionally has no extension — the browser uses Content-Type to render.
  // Callers that do not send a SKU (legacy product-form upload) fall back to
  // the timestamped path to avoid clobbering unrelated uploads.
  const rawSku = (formData.get('sku') as string | null)?.trim() || ''
  const skuKey = rawSku ? normalizeSku(rawSku) : ''
  const filename = skuKey
    ? `products/${skuKey}`
    : `products/${Date.now()}-${file.name}`

  // cacheControl 1 año: la URL guardada lleva `?v=` nuevo en cada re-subida,
  // así que el objeto puede cachearse como inmutable (browser + CDN). Sin esto
  // Supabase sirve `cache-control: no-cache` y cada PDF/catálogo re-descarga
  // TODAS las fotos en cada generación.
  const { error: uploadError } = await reebokServer.storage
    .from('product-images')
    .upload(filename, buffer, { contentType: file.type, upsert: true, cacheControl: '31536000' })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = reebokServer.storage
    .from('product-images')
    .getPublicUrl(filename)

  // Cache-buster: the deterministic path means the URL is stable; without `?v=`
  // the browser would keep serving the old cached bytes after a re-upload.
  // El `v` se fija UNA vez aquí y queda persistido en products.image_url —
  // solo cambia cuando cambia la foto (nunca por render).
  const url = skuKey ? `${publicUrl}?v=${Date.now()}` : publicUrl

  return NextResponse.json({ url })
}
