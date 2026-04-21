import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { updateProyectoMarcas } from "@/lib/marketing/mutations";
import type { MarcaPorcentajeInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as { marcas: MarcaPorcentajeInput[] };
    if (!Array.isArray(body?.marcas)) {
      return NextResponse.json(
        { error: "Falta arreglo 'marcas'" },
        { status: 400 },
      );
    }
    await updateProyectoMarcas(params.id, body.marcas);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudieron guardar las marcas";
    console.error("marketing/proyectos/[id]/marcas PUT:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
