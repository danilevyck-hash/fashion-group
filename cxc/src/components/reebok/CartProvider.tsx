/**
 * @deprecated No usar. El carrito unificado usa sessionStorage('reebok_cart') directamente.
 * Ver productos/page.tsx y producto/[id]/page.tsx para la implementación actual.
 * Este archivo se mantiene temporalmente para evitar romper imports existentes.
 */
'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type CartItem = {
  productId: string
  productName: string
  color: string
  size: string
  quantity: number
  imageUrl: string
  price: number | null
}

type CartContextType = {
  items: CartItem[]
  addToCart: (item: CartItem) => void
  removeFromCart: (productId: string, size: string) => void
  updateQuantity: (productId: string, size: string, quantity: number) => void
  clearCart: () => void
  getCartCount: () => number
}

const CartContext = createContext<CartContextType | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('reebok-cart')
    if (saved) setItems(JSON.parse(saved))
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (loaded) localStorage.setItem('reebok-cart', JSON.stringify(items))
  }, [items, loaded])

  const addToCart = (item: CartItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.productId === item.productId && i.size === item.size)
      if (existing) {
        return prev.map(i =>
          i.productId === item.productId && i.size === item.size
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        )
      }
      return [...prev, item]
    })
  }

  const removeFromCart = (productId: string, size: string) => {
    setItems(prev => prev.filter(i => !(i.productId === productId && i.size === size)))
  }

  const updateQuantity = (productId: string, size: string, quantity: number) => {
    if (quantity <= 0) return removeFromCart(productId, size)
    setItems(prev =>
      prev.map(i =>
        i.productId === productId && i.size === size ? { ...i, quantity } : i
      )
    )
  }

  const clearCart = () => setItems([])
  const getCartCount = () => items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, getCartCount }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
