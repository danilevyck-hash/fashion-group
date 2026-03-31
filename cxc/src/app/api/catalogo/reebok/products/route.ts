import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/components/reebok/supabase'
import { reebokServer } from '@/lib/reebok-supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  let query = supabase.from('products').select('*').order('created_at', { ascending: false })

  if (searchParams.get('active') === 'true') query = query.eq('active', true)
  if (searchParams.get('category')) query = query.eq('category', searchParams.get('category'))
  if (searchParams.get('gender')) query = query.eq('gender', searchParams.get('gender'))
  const searchQ = searchParams.get('search')
  if (searchQ) query = query.or(`name.ilike.%${searchQ}%,sku.ilike.%${searchQ}%`)

  const { data, error } = await query
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await reebokServer.from('products').insert(body).select().single()
  if (error) { console.error(error); return NextResponse.json({ error: error.message }, { status: 500 }); }
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body
  const { data, error } = await reebokServer.from('products').update(fields).eq('id', id).select().single()
  if (error) { console.error(error); return NextResponse.json({ error: error.message }, { status: 500 }); }
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Log which key reebokServer is using
  const keyUsed = process.env.REEBOK_SERVICE_ROLE_KEY ? 'REEBOK_SERVICE_ROLE_KEY'
    : process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY'
    : process.env.NEXT_PUBLIC_REEBOK_SUPABASE_ANON_KEY ? 'NEXT_PUBLIC_REEBOK_SUPABASE_ANON_KEY (FALLBACK!)'
    : 'NEXT_PUBLIC_SUPABASE_ANON_KEY (FALLBACK!)'
  console.log(`[DELETE product] id=${id}, key=${keyUsed}`)

  // Delete inventory first (explicit, in case CASCADE fails)
  const invResult = await reebokServer.from('inventory').delete().eq('product_id', id).select('id')
  console.log(`[DELETE inventory] deleted=${invResult.data?.length || 0}, error=${invResult.error?.message || 'none'}`)

  // Delete the product
  const { data, error } = await reebokServer.from('products').delete().eq('id', id).select('id').maybeSingle()
  console.log(`[DELETE product] data=${JSON.stringify(data)}, error=${error?.message || 'none'}`)

  if (error) { return NextResponse.json({ error: error.message }, { status: 500 }); }
  if (!data) { return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 }); }
  return NextResponse.json({ success: true, deleted: data.id })
}
