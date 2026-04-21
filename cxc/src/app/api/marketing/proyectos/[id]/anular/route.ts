import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { anularProyecto } from "@/lib/marketing/mutations";

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
    const body = (await req.json()) as { motivo?: string };
    const motivo = (body?.motivo ?? "").trim();
    if (!motivo) {
      return NextResponse.json(
        { error: "El motivo es obligatorio" },
        { status: 400 },
      );
    }
    await anularProyecto(params.id, motivo);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo anular el proyecto";
    console.error("marketing/proyectos/[id]/anular POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
