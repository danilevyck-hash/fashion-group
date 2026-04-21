import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  marcarCobranzaCobrada,
  setEstadoProyecto,
} from "@/lib/marketing/mutations";
import { getCobranzaById } from "@/lib/marketing/queries";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    await marcarCobranzaCobrada(params.id);

    const cobranza = await getCobranzaById(params.id);
    if (cobranza) {
      const { data: hermanas } = await supabaseServer
        .from("mk_cobranzas")
        .select("estado")
        .eq("proyecto_id", cobranza.proyecto_id)
        .is("anulado_en", null);
      const todasCobradas =
        (hermanas ?? []).length > 0 &&
        (hermanas ?? []).every(
          (r) => String((r as { estado: string }).estado) === "cobrada",
        );
      if (todasCobradas) {
        await setEstadoProyecto(cobranza.proyecto_id, "cobrado");
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo marcar como cobrada";
    console.error("marketing/cobranzas/[id]/cobrar POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
