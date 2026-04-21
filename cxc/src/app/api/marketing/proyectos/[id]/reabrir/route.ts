import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  reabrirProyecto,
  puedeReabrirProyecto,
  eliminarCobranzasBorrador,
  revertirCobranzasCobradas,
} from "@/lib/marketing/mutations";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const check = await puedeReabrirProyecto(params.id);
    return NextResponse.json(check);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    // Si hay cobradas, las revierte a 'enviada'. Luego borra borradores.
    const revertidas = await revertirCobranzasCobradas(params.id);
    const borradorEliminadas = await eliminarCobranzasBorrador(params.id);

    // Consulta cobranzas restantes para decidir estado objetivo del proyecto.
    const { data: restantes } = await supabaseServer
      .from("mk_cobranzas")
      .select("estado")
      .eq("proyecto_id", params.id)
      .is("anulado_en", null);
    const hayEnviadas = (restantes ?? []).some(
      (r) => String((r as { estado: string }).estado) === "enviada",
    );

    if (hayEnviadas) {
      // Volver a 'enviado' (proyecto con cobranzas aún enviadas sin cobrar)
      const { error } = await supabaseServer
        .from("mk_proyectos")
        .update({ estado: "enviado", fecha_cierre: null })
        .eq("id", params.id);
      if (error) throw new Error(error.message);
    } else {
      // Sin cobranzas activas — vuelve a 'abierto'
      await reabrirProyecto(params.id);
    }

    return NextResponse.json({
      ok: true,
      revertidas,
      borradorEliminadas,
      destino: hayEnviadas ? "enviado" : "abierto",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo reabrir el proyecto";
    console.error("marketing/proyectos/[id]/reabrir POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
