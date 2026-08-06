// GET /api/admin/switch-vendedores?empresa=<empresa de un catálogo> — vendedores
// EN VIVO de la instancia Switch de un catálogo (para el mapeo fg_user →
// vendedor en Sistema → Usuarios). Admin-only, uso esporádico → se cierra la
// sesión de Switch al terminar (higiene sesión única).

import { NextRequest, NextResponse } from "next/server";
import { EMPRESAS_CATALOGO } from "@/lib/catalogo/marcas";
import { requireRole } from "@/lib/requireRole";
import { createSwitchClient, logoutAllSwitchSessions } from "@/lib/switch-api/client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

// Empresas Switch de los catálogos — DERIVADAS de las marcas (fuente única en
// lib/catalogo/marcas.ts). Escribirlas a mano fue lo que dejó a Tommy sin
// vendedor asignable durante semanas.

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const empresa = req.nextUrl.searchParams.get("empresa") || "";
  if (!EMPRESAS_CATALOGO.has(empresa)) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }

  try {
    const client = createSwitchClient(empresa);
    const vendedores: Array<{ id: number; nombre: string }> = [];
    for (let pagina = 1; pagina <= 10; pagina++) {
      const data = await client.listVendedores({ porPagina: 50, paginaActual: pagina });
      const rows = data.vendedores ?? [];
      for (const v of rows) {
        if (typeof v.id === "number") vendedores.push({ id: v.id, nombre: String(v.nombre ?? v.id) });
      }
      if (rows.length < 50) break;
    }
    vendedores.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return NextResponse.json({ empresa, vendedores });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Switch no respondió: ${msg}` }, { status: 502 });
  } finally {
    await logoutAllSwitchSessions();
  }
}
