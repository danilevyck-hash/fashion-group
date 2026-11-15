// GET /api/catalogo/mi-vendedor?empresa=<empresa de un catálogo> — el vendedor de
// Switch mapeado al usuario LOGUEADO (fg_user_switch_vendedor). Lo usa el
// checkout de catálogos para setear el vendedor del pedido automáticamente.
// Devuelve { vendedor: null } si el usuario no tiene mapeo (el checkout lo
// muestra y bloquea el envío con mensaje accionable).

import { NextRequest, NextResponse } from "next/server";
import { EMPRESAS_CATALOGO } from "@/lib/catalogo/marcas";
import { requireRole } from "@/lib/requireRole";
import { leerMiVendedor, ROLES_MI_VENDEDOR } from "@/lib/catalogo/mi-vendedor";

export const dynamic = "force-dynamic";

// Empresas Switch de los catálogos — DERIVADAS de las marcas (fuente única en
// lib/catalogo/marcas.ts). Ver el porqué en EMPRESAS_CATALOGO.

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ROLES_MI_VENDEDOR);
  if (auth instanceof NextResponse) return auth;

  const empresa = req.nextUrl.searchParams.get("empresa") || "";
  if (!EMPRESAS_CATALOGO.has(empresa)) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }
  if (!auth.userId) {
    return NextResponse.json({ vendedor: null });
  }

  const vendedor = await leerMiVendedor(auth.userId, empresa);
  return NextResponse.json({ vendedor: vendedor ?? null });
}
