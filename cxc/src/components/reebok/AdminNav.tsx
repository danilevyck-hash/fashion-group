'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/catalogo/reebok/admin/productos', label: 'Productos' },
  { href: '/catalogo/reebok/admin/importar', label: 'Importar CSV' },
  { href: '/catalogo/reebok/admin/upload', label: 'Upload Fotos' },
  { href: '/catalogo/reebok/admin/inventario', label: 'Inventario' },
  { href: '/catalogo/reebok/admin/exportar', label: 'Exportar' },
]

export default function AdminNav() {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 mb-6 bg-reebok-grey rounded-lg p-1 overflow-x-auto">
      {links.map(link => (
        <Link
          key={link.href}
          href={link.href}
          className={`px-4 py-2 rounded text-sm font-medium whitespace-nowrap transition-colors ${
            pathname.startsWith(link.href)
              ? 'bg-white text-reebok-dark shadow-sm'
              : 'text-gray-600 hover:text-reebok-dark'
          }`}
        >
          {link.label}
        </Link>
      ))}
    </div>
  )
}
