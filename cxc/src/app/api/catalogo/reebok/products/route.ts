import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/components/reebok/supabase'
import { reebokServer } from '@/lib/reebok-supabase-server'
import { requireAdmin } from '@/lib/api-auth'
import { logActivity } from '@/lib/log-activity'
import { getSession } from '@/lib/require-auth'

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  // Columnas explícitas (no select('*')): endpoint público — blinda contra fugas
  // de columnas futuras agregadas a `products`.
  let query = supabase
    .from('products')
    .select('id,name,sku,description,category,sub_category,gender,color,price,image_url,badge,on_sale,active,created_at')
    .order('created_at', { ascending: false })

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
  const denied = requireAdmin(req); if (denied) return denied
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'Nombre es requerido' }, { status: 400 })
  const { data, error } = await reebokServer.from('products').insert(body).select().single()
  if (error) { console.error(error); return NextResponse.json({ error: error.message }, { status: 500 }); }
  const s = getSession(req)
  await logActivity(s?.role || 'admin', 'product_create', 'reebok', { productId: data.id, name: body.name }, s?.userName)
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied
  const body = await req.json()
  const { id, ...fields } = body
  const { data, error } = await reebokServer.from('products').update(fields).eq('id', id).select().single()
  if (error) { console.error(error); return NextResponse.json({ error: error.message }, { status: 500 }); }
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Soft-delete: desactivamos el producto en vez de borrarlo de forma
  // irreversible. Preserva la fila Y su inventario → reversible (reactivable
  // con active=true). El catalogo publico ya filtra active=true, asi que un
  // producto "borrado" desaparece de las listas activas sin perdida de datos.
  const { data, error } = await reebokServer.from('products').update({ active: false }).eq('id', id).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
  const s = getSession(req)
  await logActivity(s?.role || 'admin', 'product_soft_delete', 'reebok', { productId: id }, s?.userName)
  return NextResponse.json({ success: true, deleted: data.id })
}
