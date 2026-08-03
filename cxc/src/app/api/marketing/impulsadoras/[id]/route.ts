import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { eliminarImpulsadora, actualizarImpulsadora } from "@/lib/marketing/impulsadoras";
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

// PUT /api/marketing/impulsadoras/[id] — edita la ficha (nombre, monto mensual
// y/o reparto de marcas).
//
// 🩸 Antes NO existía: subirle el sueldo a alguien exigía borrarla y crearla de
// nuevo, lo que parte su historial en dos fichas. Daniel lo pidió el 3-ago-2026.
//
// ⚠️ NO recalcula los pagos ya registrados, a propósito: un pago es lo que se
// pagó ese mes con el reparto vigente entonces. Reescribirlo movería gastos de
// meses ya cerrados. El cambio aplica del PRÓXIMO pago en adelante.
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as {
      nombre?: string;
      montoMensual?: number;
      marcas?: Array<{ marcaId: string; porcentaje: number }>;
    };
    const imp = await actualizarImpulsadora(params.id, body);
    logActivity(
      auth.role,
      "impulsadora_editada",
      "marketing",
      { id: params.id, campos: Object.keys(body) },
      auth.userName,
    ).catch(() => {});
    return NextResponse.json(imp);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("marketing/impulsadoras/[id] PUT:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
