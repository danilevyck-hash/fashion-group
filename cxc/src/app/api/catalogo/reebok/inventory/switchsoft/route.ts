import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/components/reebok/supabase'
import { reebokServer } from '@/lib/reebok-supabase-server'
import { requireRole } from '@/lib/requireRole'

function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'secretaria', 'upload'])
  if (auth instanceof NextResponse) return auth
  try {
    const { items, empresa } = await req.json() as {
      items: { codigo: string; existencia: number; descripcion: string }[]
      empresa?: 'shoes' | 'wear'
    }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'items array required' }, { status: 400 })
    }

    // Get all products with current inventory
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, sku, name, active, category')
    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })

    const { data: inventoryData, error: invErr } = await supabase
      .from('inventory')
      .select('product_id, quantity, size')
    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

    // Build inventory lookup: product_id -> total quantity
    const currentQtyMap = new Map<string, number>()
    for (const inv of inventoryData || []) {
      currentQtyMap.set(
        inv.product_id,
        (currentQtyMap.get(inv.product_id) || 0) + inv.quantity
      )
    }

    // Build exact SKU map (case-sensitive)
    const skuMap = new Map<string, { id: string; name: string; active: boolean; category: string }>()
    for (const p of products || []) {
      if (p.sku) skuMap.set(p.sku, { id: p.id, name: p.name, active: p.active, category: p.category })
    }

    // Track which SKUs from the DB were seen in the CSV
    const csvSkus = new Set<string>()
    for (const item of items) {
      csvSkus.add(item.codigo)
    }

    const updated: { sku: string; name: string; anterior: number; nueva: number }[] = []
    const wentToZero: { sku: string; name: string }[] = []
    const notFound: { codigo: string; descripcion: string }[] = []

    for (const item of items) {
      const match = skuMap.get(item.codigo)
      if (!match) {
        // Only report not-found if they have stock — zero-stock codes not in website are irrelevant
        if (item.existencia > 0) {
          notFound.push({ codigo: item.codigo, descripcion: item.descripcion })
        }
        continue
      }

      const previousQty = currentQtyMap.get(match.id) || 0

      const { error } = await reebokServer
        .from('inventory')
        .upsert(
          { product_id: match.id, size: 'UNICA', quantity: item.existencia },
          { onConflict: 'product_id,size' }
        )

      if (!error) {
        updated.push({
          sku: item.codigo,
          name: match.name,
          anterior: previousQty,
          nueva: item.existencia,
        })

        // Track products that went to zero from a positive quantity
        if (item.existencia === 0 && previousQty > 0) {
          wentToZero.push({ sku: item.codigo, name: match.name })
        }
      }
    }

    // Find active products in DB that were NOT in this CSV, filtered by empresa
    const notInCSV: { sku: string; name: string }[] = []
    for (const p of products || []) {
      if (!p.sku || !p.active || csvSkus.has(p.sku)) continue

      if (empresa === 'shoes' && p.category !== 'footwear') continue
      if (empresa === 'wear' && p.category !== 'apparel' && p.category !== 'accessories') continue

      notInCSV.push({ sku: p.sku, name: p.name })
    }

    return NextResponse.json({ updated, wentToZero, notFound, notInCSV })
  } catch {
    return NextResponse.json({ error: 'Error processing Switch Soft CSV' }, { status: 500 })
  }
}
