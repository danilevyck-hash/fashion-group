import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/components/reebok/supabase'
import { requireRole } from '@/lib/requireRole'

// POST: bulk create/update products from Excel template
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ['admin', 'secretaria', 'upload'])
  if (auth instanceof NextResponse) return auth
  try {
    const { products } = await req.json() as {
      products: {
        sku: string
        name: string
        price?: number
        gender?: string
        category?: string
        quantity?: number
        on_sale?: boolean
        active?: boolean
      }[]
    }

    if (!products || !Array.isArray(products)) {
      return NextResponse.json({ error: 'products array required' }, { status: 400 })
    }

    const results = { created: 0, updated: 0, errors: 0 }

    for (const p of products) {
      if (!p.sku) {
        results.errors++
        continue
      }

      // Check if product with this SKU already exists
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('sku', p.sku)
        .single()

      if (existing) {
        // Update existing — never touch image_url
        const updateData: Record<string, unknown> = {}
        if (p.name) updateData.name = p.name
        if (p.price !== undefined) updateData.price = p.price
        if (p.gender) updateData.gender = p.gender
        if (p.category) updateData.category = p.category
        if (p.on_sale !== undefined) updateData.on_sale = p.on_sale
        if (p.active !== undefined) updateData.active = p.active

        const { error } = await supabase
          .from('products')
          .update(updateData)
          .eq('id', existing.id)

        if (!error) {
          results.updated++
          if (p.quantity !== undefined) {
            await supabase
              .from('inventory')
              .upsert(
                { product_id: existing.id, size: 'UNICA', quantity: p.quantity },
                { onConflict: 'product_id,size' }
              )
          }
        } else {
          results.errors++
        }
      } else {
        // Create new — no image, just data
        const { data: newProd, error } = await supabase
          .from('products')
          .insert({
            sku: p.sku,
            name: p.name || p.sku,
            price: p.price || 30,
            gender: p.gender || 'male',
            category: p.category || 'footwear',
            active: p.active !== false,
            on_sale: p.on_sale || false,
          })
          .select()
          .single()

        if (!error && newProd) {
          results.created++
          if (p.quantity !== undefined) {
            await supabase
              .from('inventory')
              .upsert(
                { product_id: newProd.id, size: 'UNICA', quantity: p.quantity },
                { onConflict: 'product_id,size' }
              )
          }
        } else {
          results.errors++
        }
      }
    }

    return NextResponse.json(results)
  } catch {
    return NextResponse.json({ error: 'Error processing bulk upload' }, { status: 500 })
  }
}
