'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useCart } from './CartProvider'

export default function Navbar() {
  const { getCartCount } = useCart()
  const count = getCartCount()
  const [role, setRole] = useState('')
  const [hasSystem, setHasSystem] = useState(false)

  useEffect(() => {
    const r = sessionStorage.getItem('cxc_role') || ''
    setRole(r)
    setHasSystem(!!sessionStorage.getItem('fg_user_id') || !!r)
  }, [])

  const showManage = role === 'admin' || role === 'vendedor' || role === 'staff'

  return (
    <nav className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          {hasSystem && role !== 'cliente' && (
            <Link href="/plantillas" className="text-xs text-gray-400 hover:text-gray-700 transition">← Sistema</Link>
          )}
          <Link href="/catalogo/reebok">
            <img src="/reebok/reebok-logo.png" alt="Reebok" className="h-7" />
          </Link>
          {showManage && (
            <>
              <Link href="/catalogo/reebok/pedidos" className="text-xs text-gray-500 hover:text-reebok-dark transition font-medium">
                Pedidos
              </Link>
              <Link href="/catalogo/reebok/clientes" className="text-xs text-gray-500 hover:text-reebok-dark transition font-medium">
                Clientes
              </Link>
            </>
          )}
          {role === 'admin' && (
            <Link href="/catalogo/reebok/admin/productos" className="text-xs text-gray-500 hover:text-reebok-dark transition font-medium">
              Admin
            </Link>
          )}
        </div>

        <Link href="/catalogo/reebok/pedido" className="relative p-2">
          <svg className="w-6 h-6 text-reebok-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-reebok-red text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
              {count}
            </span>
          )}
        </Link>
      </div>
    </nav>
  )
}
