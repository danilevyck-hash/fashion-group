import { createClient } from '@supabase/supabase-js'

// Reebok catalog uses its own Supabase project
const supabaseUrl = process.env.NEXT_PUBLIC_REEBOK_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_REEBOK_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Product = {
  id: string
  sku: string | null
  name: string
  description: string | null
  price: number | null
  category: string
  gender: string | null
  sub_category: string | null
  color: string | null
  image_url: string | null
  active: boolean
  on_sale: boolean
  created_at: string
}

export type InventoryItem = {
  id: string
  product_id: string
  size: string
  quantity: number
}
