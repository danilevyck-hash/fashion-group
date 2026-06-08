import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { cerrarProyecto } from "@/lib/marketing/mutations";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/marketing/proyectos/[id]/cerrar
// Escribe estado='cerrado'. No toca fechas legacy (se conservan en datos).
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
    await cerrarProyecto(params.id);
    return NextResponse.json({ ok: true, destino: "cerrado" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("POST cerrar:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
