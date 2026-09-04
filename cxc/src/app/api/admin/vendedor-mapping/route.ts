// GET/PUT /api/admin/vendedor-mapping — mapeo fg_user → vendedor de Switch por
// empresa (tabla fg_user_switch_vendedor, DDL 20260705100000). Lo administra
// Sistema → Usuarios; lo consume el checkout de catálogos (vendedor automático
// por login). Admin-only.
//
// Historia (jul-2026): si PostgREST contestaba "esa tabla no existe" (PGRST205),
// las tres operaciones respondían 503 "Falta correr el DDL". Tolerancia retirada
// el 3-sep-2026: la tabla existe desde 20260705100000_fg_user_switch_vendedor.sql
// (verificado en producción). Hoy un "no existe" es un permiso, un cambio de
// esquema o un timeout mal leído, y disfrazarlo de "falta correr el SQL" mandaba
// a Daniel a correr una migración que ya está corrida. Cualquier error → 500 con
// el mensaje.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const TABLE = "fg_user_switch_vendedor";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from(TABLE)
    .select("user_id, empresa_key, vendedor_id, vendedor_nombre");
  if (error) {
    console.error("[admin/vendedor-mapping] GET:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ mappings: data ?? [] });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const userId = typeof body?.user_id === "string" ? body.user_id : null;
  const empresa = typeof body?.empresa_key === "string" ? body.empresa_key : null;
  if (!userId || !empresa) {
    return NextResponse.json({ error: "user_id y empresa_key requeridos" }, { status: 400 });
  }

  // vendedor_id null/ausente = quitar el mapeo.
  if (body.vendedor_id == null) {
    const { error } = await supabaseServer.from(TABLE).delete().eq("user_id", userId).eq("empresa_key", empresa);
    if (error) {
      console.error("[admin/vendedor-mapping] DELETE:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, removed: true });
  }

  const vendedorId = Number(body.vendedor_id);
  if (!Number.isInteger(vendedorId) || vendedorId <= 0) {
    return NextResponse.json({ error: "vendedor_id inválido" }, { status: 400 });
  }
  const { error } = await supabaseServer.from(TABLE).upsert({
    user_id: userId,
    empresa_key: empresa,
    vendedor_id: vendedorId,
    vendedor_nombre: typeof body.vendedor_nombre === "string" ? body.vendedor_nombre : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,empresa_key" });
  if (error) {
    console.error("[admin/vendedor-mapping] PUT:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
