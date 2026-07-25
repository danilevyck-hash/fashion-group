// GET /api/catalogo/switch-clientes?marca=reebok|joybees|tommy — directorio de
// clientes de la instancia Switch de la marca, desde la tabla switch_clientes
// (sincronizada a diario por el sync de estado de cuenta — NO toca la API de
// Switch). Lo usa el selector de cliente del checkout; default = Contado (id 1).

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const EMPRESA_POR_MARCA: Record<string, string> = {
  reebok: "active_shoes",
  joybees: "joystep",
  tommy: "fashion_shoes",
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;

  const empresa = EMPRESA_POR_MARCA[req.nextUrl.searchParams.get("marca") || ""];
  if (!empresa) return NextResponse.json({ error: "marca inválida" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("switch_clientes")
    .select("cliente_switch_id, codigo, nombre")
    .eq("empresa_key", empresa)
    .order("nombre", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    clientes: (data ?? []).map((c) => ({ id: c.cliente_switch_id, codigo: c.codigo, nombre: c.nombre })),
  });
}
