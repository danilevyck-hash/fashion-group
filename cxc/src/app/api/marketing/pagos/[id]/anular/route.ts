import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketing/pagos/[id]/anular
 * Soft delete de un pago: marca anulado_en = now(). No requiere motivo
 * (la tabla mk_pagos no tiene columna anulado_motivo).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  if (!params.id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  try {
    const { error } = await supabaseServer
      .from("mk_pagos")
      .update({ anulado_en: new Date().toISOString() })
      .eq("id", params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
