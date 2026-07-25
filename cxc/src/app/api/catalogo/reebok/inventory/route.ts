import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/components/reebok/supabase'
import { reebokServer } from '@/lib/reebok-supabase-server'
import { requireRole } from '@/lib/requireRole'
import { invalidarCatalogoPublico } from '@/lib/catalogo/cache'

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const productId = searchParams.get('product_id')

  // Columnas explícitas (no select('*')): endpoint público.
  let query = supabase.from('inventory').select('id,product_id,size,quantity').order('size')
  if (productId) query = query.eq('product_id', productId)

  const { data, error } = await query
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'secretaria'])
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const { data, error } = await reebokServer
    .from('inventory')
    .upsert(body, { onConflict: 'product_id,size' })
    .select('id,product_id,size,quantity')
    .single()
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  // El payload público de Reebok incluye `inventory`: tocarlo cambia lo que ve
  // el cliente (tallas/cantidades) aunque no mueva `active`.
  invalidarCatalogoPublico('reebok')
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'secretaria'])
  if (auth instanceof NextResponse) return auth
  const body = await req.json()
  const { id, ...fields } = body
  const { data, error } = await reebokServer.from('inventory').update(fields).eq('id', id).select('id,product_id,size,quantity').single()
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  invalidarCatalogoPublico('reebok')
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'secretaria'])
  if (auth instanceof NextResponse) return auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await reebokServer.from('inventory').delete().eq('id', id)
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  invalidarCatalogoPublico('reebok')
  return NextResponse.json({ success: true })
}
