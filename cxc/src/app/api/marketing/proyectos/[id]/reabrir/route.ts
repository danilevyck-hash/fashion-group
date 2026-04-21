import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  reabrirProyecto,
  puedeReabrirProyecto,
  eliminarCobranzasBorrador,
} from "@/lib/marketing/mutations";

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
    const check = await puedeReabrirProyecto(params.id);
    if (!check.puede) {
      return NextResponse.json(
        { error: check.razon ?? "No se puede reabrir" },
        { status: 409 },
      );
    }
    const borradorEliminadas = await eliminarCobranzasBorrador(params.id);
    await reabrirProyecto(params.id);
    return NextResponse.json({ ok: true, borradorEliminadas });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo reabrir el proyecto";
    console.error("marketing/proyectos/[id]/reabrir POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
