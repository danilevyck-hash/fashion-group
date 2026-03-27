import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/components/reebok/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  let query = supabase.from('products').select('*').order('created_at', { ascending: false })

  if (searchParams.get('active') === 'true') query = query.eq('active', true)
  if (searchParams.get('category')) query = query.eq('category', searchParams.get('category'))
  if (searchParams.get('gender')) query = query.eq('gender', searchParams.get('gender'))
  const searchQ = searchParams.get('search')
  if (searchQ) query = query.or(`name.ilike.%${searchQ}%,sku.ilike.%${searchQ}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase.from('products').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body
  const { data, error } = await supabase.from('products').update(fields).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
