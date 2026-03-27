'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/catalogo/reebok/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()
    if (data.authenticated) {
      sessionStorage.setItem('admin_auth', 'true')
      router.push('/catalogo/reebok/admin/productos')
    } else {
      setError('Contrasena incorrecta')
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-4xl text-reebok-red mb-2">&#9650;</p>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="password"
            placeholder="Contrasena"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            className="w-full border border-gray-300 rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-reebok-red"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="w-full bg-reebok-dark text-white py-3 rounded font-bold text-sm uppercase tracking-wider hover:bg-black transition-colors">
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
