// GET /api/catalogo/mi-vendedor?empresa=active_shoes|joystep — el vendedor de
// Switch mapeado al usuario LOGUEADO (fg_user_switch_vendedor). Lo usa el
// checkout de catálogos para setear el vendedor del pedido automáticamente.
// Devuelve { vendedor: null } si el usuario no tiene mapeo (el checkout lo
// muestra y bloquea el envío con mensaje accionable).

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const EMPRESAS_CATALOGO = new Set(["active_shoes", "joystep"]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;

  const empresa = req.nextUrl.searchParams.get("empresa") || "";
  if (!EMPRESAS_CATALOGO.has(empresa)) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }
  if (!auth.userId) {
    return NextResponse.json({ vendedor: null });
  }

  const { data, error } = await supabaseServer
    .from("fg_user_switch_vendedor")
    .select("vendedor_id, vendedor_nombre")
    .eq("user_id", auth.userId)
    .eq("empresa_key", empresa)
    .maybeSingle();
  if (error) {
    // Tabla ausente (DDL pendiente) u otro error → sin mapeo, el checkout avisa.
    return NextResponse.json({ vendedor: null });
  }
  return NextResponse.json({
    vendedor: data ? { id: data.vendedor_id, nombre: data.vendedor_nombre } : null,
  });
}
