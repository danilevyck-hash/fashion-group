import { NextRequest, NextResponse } from "next/server";
import { supabaseServer, HAS_SERVICE_ROLE } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

const MISCONFIG = NextResponse.json(
  { error: "Falta SUPABASE_SERVICE_ROLE_KEY en este entorno: no se puede editar el catálogo." },
  { status: 503 }
);

/**
 * Activa / desactiva una descripción del catálogo (SOLO admin).
 * Desactivar NO borra: la fila y su auditoría quedan (histórico).
 * Body: { activa: boolean }.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;
  if (!HAS_SERVICE_ROLE) return MISCONFIG;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  if (typeof body.activa !== "boolean") {
    return NextResponse.json({ error: "Falta el campo activa (true/false)." }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("depurador_descripciones")
    .update({ activa: body.activa })
    .eq("id", params.id)
    .select("id, marca, descripcion, activa")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "No se pudo actualizar. Intenta de nuevo." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "La descripción no existe." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, row: data });
}
