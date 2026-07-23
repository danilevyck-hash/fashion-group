import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/components/reebok/supabase'
import { reebokServer } from '@/lib/reebok-supabase-server'
import { requireAdmin } from '@/lib/api-auth'
import { logActivity } from '@/lib/log-activity'
import { getSession } from '@/lib/require-auth'
import { esVisibleEnCatalogo } from '@/lib/catalogos/visibilidad'

export const dynamic = "force-dynamic";

// Columnas explícitas (no select('*')): blinda contra fugas de columnas futuras
// agregadas a `products`.
const GET_COLS = 'id,name,sku,description,category,sub_category,gender,color,price,image_url,badge,on_sale,active,existencia,disponibilidad,created_at'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  // scope=admin (solo admin/secretaria): devuelve el catálogo vivo (active=true)
  // MÁS los ocultados a mano (oculto_manual=true, active=false) para poder
  // revertir el toggle desde el admin. Incluye la columna oculto_manual.
  const adminScope = searchParams.get('scope') === 'admin'
  if (adminScope) {
    const denied = requireAdmin(req); if (denied) return denied
  }

  const buildQuery = (cols: string, withOculto: boolean) => {
    let query = supabase.from('products').select(cols).order('created_at', { ascending: false })
    if (adminScope && withOculto) query = query.or('active.is.true,oculto_manual.is.true')
    else if (adminScope || searchParams.get('active') === 'true') query = query.eq('active', true)
    if (searchParams.get('category')) query = query.eq('category', searchParams.get('category'))
    if (searchParams.get('gender')) query = query.eq('gender', searchParams.get('gender'))
    const searchQ = searchParams.get('search')
    if (searchQ) query = query.or(`name.ilike.%${searchQ}%,sku.ilike.%${searchQ}%`)
    return query
  }

  // Fallback pre-migración (DDL 20260723120000): si oculto_manual aún no existe,
  // se responde el catálogo activo sin la columna (comportamiento previo).
  let { data, error } = await buildQuery(adminScope ? `${GET_COLS},oculto_manual` : GET_COLS, adminScope)
  if (error && error.message.includes('oculto_manual')) {
    ({ data, error } = await buildQuery(GET_COLS, false))
  }
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data)
}

// La creación manual de productos fue retirada: el catálogo lo llena el cron
// `reebok-catalogo` desde Switch (no se crean productos a mano). Solo quedan
// GET (lectura), PUT (editar image_url/badge) y DELETE (ocultar).

// Allow-list de columnas editables a mano. TODO lo demás (active, existencia,
// disponibilidad, keep_visible, price, name…) lo maneja el cron `reebok-catalogo`
// y se RECHAZA aquí — el PUT nunca debe pisar el estado de inventario.
const EDITABLE_FIELDS = ['image_url', 'badge'] as const
// badge = etiqueta visual manual. null = sin etiqueta; o uno de estos valores.
const VALID_BADGES = new Set(['nuevo', 'oferta', 'proximamente'])

export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  const { id } = body as Record<string, unknown>
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  }

  // Rechaza cualquier columna fuera de la allow-list (no la ignora silenciosamente).
  const rejected = Object.keys(body).filter((k) => k !== 'id' && !(EDITABLE_FIELDS as readonly string[]).includes(k))
  if (rejected.length > 0) {
    return NextResponse.json({ error: `Campos no editables: ${rejected.join(', ')}` }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const key of EDITABLE_FIELDS) {
    if (key in body) updates[key] = (body as Record<string, unknown>)[key]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  // Validar badge: null (sin etiqueta) o un valor conocido. Evita meter texto libre.
  if ('badge' in updates) {
    const b = updates.badge
    if (b !== null && !(typeof b === 'string' && VALID_BADGES.has(b))) {
      return NextResponse.json({ error: 'Etiqueta inválida' }, { status: 400 })
    }
  }
  // Validar image_url: string o null.
  if ('image_url' in updates) {
    const u = updates.image_url
    if (u !== null && typeof u !== 'string') {
      return NextResponse.json({ error: 'image_url inválido' }, { status: 400 })
    }
  }

  const { data, error } = await reebokServer.from('products').update(updates).eq('id', id).select('id,name,sku,description,category,sub_category,gender,color,price,image_url,badge,on_sale,active,existencia,disponibilidad,created_at').single()
  if (error) { console.error(error); return NextResponse.json({ error: error.message }, { status: 500 }); }
  return NextResponse.json(data)
}

// ── Toggle "Visible en catálogo / Oculto" (decisión Daniel 22-jul-2026) ───────
// Oculta un producto no vendible (ej. 100256591: sin foto, precio 0, con stock)
// SIN tocar código. El flag `oculto_manual` SOBREVIVE al sync: el motor
// (sync-catalogo.ts) lo respeta vía esVisibleEnCatalogo y mantiene active=false
// mientras esté puesto. Reversible: al mostrar se recalcula `active` con la
// MISMA regla del sync (regla única en lib/catalogos/visibilidad.ts).
export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied
  const body = await req.json().catch(() => null)
  const { id, oculto } = (body ?? {}) as Record<string, unknown>
  if (!id || typeof id !== 'string' || typeof oculto !== 'boolean') {
    return NextResponse.json({ error: 'id y oculto (boolean) requeridos' }, { status: 400 })
  }

  // Leer el estado real (select explícito) para recalcular `active` al mostrar.
  const { data: prod, error: readErr } = await reebokServer
    .from('products')
    .select('id,sku,existencia,keep_visible,badge,oculto_manual')
    .eq('id', id)
    .maybeSingle()
  if (readErr) {
    const msg = readErr.message.includes('oculto_manual')
      ? 'Falta correr la migración 20260723120000 (columna oculto_manual).'
      : readErr.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  const active = esVisibleEnCatalogo({
    existencia: prod.existencia ?? 0,
    keepVisible: prod.keep_visible,
    badge: prod.badge,
    ocultoManual: oculto,
  })
  const { data, error } = await reebokServer
    .from('products')
    .update({ oculto_manual: oculto, active })
    .eq('id', id)
    .select('id,sku,active,oculto_manual')
    .single()
  if (error) { console.error(error); return NextResponse.json({ error: error.message }, { status: 500 }); }

  const s = getSession(req)
  await logActivity(s?.role || 'admin', oculto ? 'product_ocultar_catalogo' : 'product_mostrar_catalogo', 'reebok', { productId: id, sku: prod.sku }, s?.userName)
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
