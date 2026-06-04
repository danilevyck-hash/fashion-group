import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { reabrirProyecto } from "@/lib/marketing/mutations";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/marketing/proyectos/[id]/reabrir
// Transición: cobrado → enviado (limpia fecha_cobrado)
//             enviado → abierto (limpia fecha_enviado)
// Devuelve el nuevo estado en { destino }.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const destino = await reabrirProyecto(params.id);
    return NextResponse.json({ ok: true, destino });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("POST reabrir:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
