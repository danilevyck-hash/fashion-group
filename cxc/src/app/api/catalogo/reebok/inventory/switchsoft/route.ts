import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/components/reebok/supabase'

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json() as {
      items: { codigo: string; existencia: number }[]
    }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'items array required' }, { status: 400 })
    }

    // Get all products to map SKU -> product info
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, sku, name')
    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })

    // Build exact SKU map (case-sensitive)
    const skuMap = new Map<string, { id: string; name: string }>()
    for (const p of products || []) {
      if (p.sku) skuMap.set(p.sku, { id: p.id, name: p.name })
    }

    const updated: { sku: string; name: string; existencia: number }[] = []
    const notFound: string[] = []

    for (const item of items) {
      const match = skuMap.get(item.codigo)
      if (!match) {
        notFound.push(item.codigo)
        continue
      }

      const { error } = await supabase
        .from('inventory')
        .upsert(
          { product_id: match.id, size: 'UNICA', quantity: item.existencia },
          { onConflict: 'product_id,size' }
        )

      if (!error) {
        updated.push({ sku: item.codigo, name: match.name, existencia: item.existencia })
      }
    }

    return NextResponse.json({ updated, notFound })
  } catch {
    return NextResponse.json({ error: 'Error processing Switch Soft CSV' }, { status: 500 })
  }
}
