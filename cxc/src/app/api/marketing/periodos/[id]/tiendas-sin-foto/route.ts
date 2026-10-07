import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { MKT_SOLO_COBRABLE_2026_10, tiendasSinFoto } from "@/lib/marketing/solo-cobrable-2026-10";

export const dynamic = "force-dynamic";

// GET /api/marketing/periodos/[id]/tiendas-sin-foto?tiendas=D-170,D-14
//
// 🔴 SOLO LO COBRABLE (7-oct-2026, apagado): qué tiendas del período abierto
// no tienen ninguna foto, para AVISAR al cerrar —nunca para frenar—. SOLO LEE
// una tabla chica (las fotos de esas tiendas).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;
  if (!MKT_SOLO_COBRABLE_2026_10) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const tiendas = String(req.nextUrl.searchParams.get("tiendas") ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z0-9-]{1,20}$/.test(c))
    .slice(0, 200);
  if (tiendas.length === 0) return NextResponse.json({ sinFoto: [] });

  const { data, error } = await supabaseServer
    .from("mk_adjuntos")
    .select("tienda_codigo, periodo_id")
    .eq("tipo", "foto_proyecto")
    .in("tienda_codigo", tiendas);
  if (error) return NextResponse.json({ error: "No se pudo leer las fotos" }, { status: 500 });

  return NextResponse.json({
    sinFoto: tiendasSinFoto(
      tiendas,
      (data ?? []) as Array<{ tienda_codigo: string | null; periodo_id: string | null }>,
      String(params.id),
    ),
  });
}
