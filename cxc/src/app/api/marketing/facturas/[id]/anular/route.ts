import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { anularFactura } from "@/lib/marketing/mutations";
import { getFacturaById } from "@/lib/marketing/queries";
import { logAudit } from "@/lib/marketing/audit";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const body = (await req.json()) as { motivo?: string };
    const motivo = (body?.motivo ?? "").trim();
    if (!motivo) {
      return NextResponse.json(
        { error: "El motivo es obligatorio" },
        { status: 400 },
      );
    }
    const before = await getFacturaById(params.id);
    await anularFactura(params.id, motivo);
    const after = await getFacturaById(params.id);

    await logAudit({
      action: "delete",
      entityType: "mk_facturas",
      entityId: params.id,
      userRole: auth.role,
      userName: auth.userName,
      before,
      after,
      extra: { motivo },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo anular la factura";
    console.error("marketing/facturas/[id]/anular POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
