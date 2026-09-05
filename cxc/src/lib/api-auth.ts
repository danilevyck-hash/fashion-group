/* ─────────────────────────────────────────────────────────────────────────────
 * Guardas de rol para rutas API.
 *
 * 🔴 5-sep-2026 — `requireAdmin` se llamaba así y dejaba pasar a la SECRETARIA.
 *
 * El nombre mentía. Cualquiera que leyera `requireAdmin(req)` en una ruta daba
 * por hecho que solo pasaba `admin`, y ya había DOS comentarios de aviso
 * pegados a mano en Marketing («⚠️ NO usar requireAdmin: ese incluye a la
 * secretaria») más dos tests barriendo que nadie la usara ahí. Cuando hay que
 * poner carteles alrededor de una función para que no se use mal, el problema
 * es el nombre.
 *
 * 🔴 LO QUE **NO** CAMBIÓ: la conducta. La secretaria SÍ debe pasar — el
 * módulo Catálogos lo administra ella (`CATALOGO_ADMIN_ROLES` en
 * `src/lib/catalogo/roles.ts` es exactamente admin + secretaria) y también
 * carga y edita Reclamos. Se renombró la función, no los permisos: los mismos
 * roles entran hoy que ayer, en las mismas 10 rutas.
 *
 * Para «solo admin, de verdad» se usa `requireRole(req, ["admin"])` de
 * `src/lib/requireRole.ts` — es lo que hace Marketing › Mobiliario con los
 * costos del proveedor.
 *
 * Candado: `src/__tests__/lib/require-admin-no-miente.test.ts`
 * ────────────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/session-cookie'

/**
 * Roles que administran Catálogos y Reclamos.
 *
 * La secretaria está adentro A PROPÓSITO: administrar catálogos es trabajo
 * suyo (ver `CATALOGO_ADMIN_ROLES`) y es quien carga los reclamos. No es una
 * concesión ni un descuido — sacarla de aquí le apaga dos módulos.
 */
const ROLES_ADMIN_Y_SECRETARIA = ['admin', 'secretaria']

export function getRole(req: NextRequest): string | null {
  return verifySession(req.cookies.get('cxc_session')?.value)?.role ?? null
}

/**
 * Deja pasar a **admin y secretaria**; a todo lo demás le contesta 403.
 *
 * El nombre dice los dos roles a propósito: se llamaba `requireAdmin` y eso
 * hacía creer que la secretaria quedaba afuera. Si necesitas admin y NADA más,
 * `requireRole(req, ["admin"])`.
 */
export function requireAdminOSecretaria(req: NextRequest): NextResponse | null {
  const role = getRole(req)
  if (!role || !ROLES_ADMIN_Y_SECRETARIA.includes(role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  return null
}
