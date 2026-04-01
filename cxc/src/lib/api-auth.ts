import { NextRequest, NextResponse } from 'next/server'

const ADMIN_ROLES = ['admin', 'secretaria']

export function getRole(req: NextRequest): string | null {
  const session = req.cookies.get('cxc_session')?.value
  if (!session) return null
  try {
    const parsed = JSON.parse(Buffer.from(session, 'base64url').toString('utf-8'))
    return parsed.role || null
  } catch { return null }
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  const role = getRole(req)
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  return null
}
