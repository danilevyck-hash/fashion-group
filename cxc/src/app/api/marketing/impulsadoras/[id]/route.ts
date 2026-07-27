import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { eliminarImpulsadora } from "@/lib/marketing/impulsadoras";
import { logActivity } from "@/lib/log-activity";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE /api/marketing/impulsadoras/[id] — elimina una impulsadora.
//
// La decisión de borrar de verdad u ocultar NO la toma el navegador: la toma
// el servidor mirando si hay gastos que apunten a esa impulsadora (ver
// eliminarImpulsadora). El front solo muestra lo que el servidor respondió.
// Mismo guard que el resto de Marketing: admin y secretaria (admin siempre
// pasa por requireRole).
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const res = await eliminarImpulsadora(params.id);
    logActivity(
      auth.role,
      res.accion === "eliminada" ? "impulsadora_eliminada" : "impulsadora_ocultada",
      "marketing",
      { id: params.id, nombre: res.nombre },
      auth.userName,
    ).catch(() => {});
    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("marketing/impulsadoras/[id] DELETE:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
