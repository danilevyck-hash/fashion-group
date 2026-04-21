import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getAdjuntosByProyecto } from "@/lib/marketing/queries";
import { firmarAdjuntos } from "@/lib/marketing/storage";

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
    const adjuntos = await getAdjuntosByProyecto(params.id);
    const firmados = await firmarAdjuntos(adjuntos);
    return NextResponse.json(firmados);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("marketing/proyectos/[id]/fotos GET:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
