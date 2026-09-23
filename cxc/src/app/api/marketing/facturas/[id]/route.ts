import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { getFacturaById } from "@/lib/marketing/queries";
import { updateFactura } from "@/lib/marketing/mutations";
import { firmarAdjuntos } from "@/lib/marketing/storage";
import type { UpdateFacturaInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const factura = await getFacturaById(params.id);
    if (!factura) {
      return NextResponse.json(
        { error: "Factura no encontrada" },
        { status: 404 },
      );
    }
    const adjuntosFirmados = await firmarAdjuntos(factura.adjuntos);
    return NextResponse.json({ ...factura, adjuntos: adjuntosFirmados });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("marketing/facturas/[id] GET:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as UpdateFacturaInput;
    const updated = await updateFactura(params.id, body);
    return NextResponse.json(updated);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo actualizar";
    console.error("marketing/facturas/[id] PATCH:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// 🩸 «ELIMINAR DEFINITIVAMENTE» SE RETIRÓ (22-sep-2026). Daniel: con «Anular»
// basta. La puerta se queda para contestar que NO —403, con el porqué— en vez
// de un 404 que parecería un bug. Los 12 borrados duros de la historia quedan
// en `activity_logs` (`delete_definitivo`); no se construye nada encima.
const MSG_BORRADO_RETIRADO =
  "Eliminar definitivamente ya no existe. Anula el registro: queda plegado y se puede restaurar.";
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  return NextResponse.json({ error: MSG_BORRADO_RETIRADO }, { status: 403 });
}
