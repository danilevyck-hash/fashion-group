import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/components/reebok/supabase'
import { logActivity } from '@/lib/log-activity'
import { getSession } from '@/lib/require-auth'
import { requireRole } from '@/lib/requireRole'

// POST: bulk update inventory from CSV (SKU + quantity)
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'secretaria', 'upload'])
  if (auth instanceof NextResponse) return auth
  try {
    const { items } = await req.json() as { items: { sku: string; quantity: number }[] }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'items array required' }, { status: 400 })
    }

    // Get all products to map SKU -> product_id
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, sku')
    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })

    const skuMap = new Map(products?.map(p => [p.sku?.toUpperCase(), p.id]) || [])

    const results = { updated: 0, skipped: 0, notFound: [] as string[] }

    for (const item of items) {
      const productId = skuMap.get(item.sku?.toUpperCase())
      if (!productId) {
        results.notFound.push(item.sku)
        results.skipped++
        continue
      }

      // Upsert inventory with size 'UNICA' (bulk = no size tracking)
      const { error } = await supabase
        .from('inventory')
        .upsert(
          { product_id: productId, size: 'UNICA', quantity: item.quantity },
          { onConflict: 'product_id,size' }
        )

      if (error) {
        results.skipped++
      } else {
        results.updated++
      }
    }

    const session = getSession(req)
    await logActivity(session?.role || 'unknown', 'inventory_upload', 'reebok', { updated: results.updated, skipped: results.skipped }, session?.userName)
    return NextResponse.json(results)
  } catch (err) {
    return NextResponse.json({ error: 'Error processing bulk upload' }, { status: 500 })
  }
}
