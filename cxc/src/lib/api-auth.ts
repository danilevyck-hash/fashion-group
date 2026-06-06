import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/session-cookie'

const ADMIN_ROLES = ['admin', 'secretaria']

export function getRole(req: NextRequest): string | null {
  return verifySession(req.cookies.get('cxc_session')?.value)?.role ?? null
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  const role = getRole(req)
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  return null
}
