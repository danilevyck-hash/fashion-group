import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/components/reebok/supabase'
import { requireRole } from '@/lib/requireRole'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const productId = searchParams.get('product_id')

  let query = supabase.from('inventory').select('*').order('size')
  if (productId) query = query.eq('product_id', productId)

  const { data, error } = await query
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'secretaria'])
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const { data, error } = await supabase
    .from('inventory')
    .upsert(body, { onConflict: 'product_id,size' })
    .select()
    .single()
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'secretaria'])
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const { id, ...fields } = body
  const { data, error } = await supabase.from('inventory').update(fields).eq('id', id).select().single()
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'secretaria'])
  if (auth instanceof NextResponse) return auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('inventory').delete().eq('id', id)
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ success: true })
}
