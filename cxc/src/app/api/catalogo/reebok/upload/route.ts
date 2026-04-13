import { NextRequest, NextResponse } from 'next/server'
import { reebokServer } from '@/lib/reebok-supabase-server'
import { requireRole } from '@/lib/requireRole'

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'secretaria', 'upload'])
  if (auth instanceof NextResponse) return auth
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const filename = `products/${Date.now()}-${file.name}`

  const { error: uploadError } = await reebokServer.storage
    .from('product-images')
    .upload(filename, buffer, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = reebokServer.storage
    .from('product-images')
    .getPublicUrl(filename)

  return NextResponse.json({ url: publicUrl })
}
