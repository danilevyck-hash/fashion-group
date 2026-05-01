import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { asignarEntregaAProyecto } from "@/lib/marketing/inventario";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Body {
  proyectoId?: string;
}

// PATCH /api/marketing/inventario/entregas/[id]/asignar-proyecto
//   body: { proyectoId }
//   Asigna una entrega pendiente (proyecto_id NULL) a un proyecto.
//   Falla si la entrega ya tiene proyecto asignado.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as Body;
    const proyectoId = String(body.proyectoId ?? "");
    if (!uuidRegex.test(proyectoId)) {
      return NextResponse.json(
        { error: "proyectoId inválido" },
        { status: 400 },
      );
    }
    const entrega = await asignarEntregaAProyecto(params.id, proyectoId);
    return NextResponse.json(entrega);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/entregas/[id]/asignar-proyecto PATCH:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
