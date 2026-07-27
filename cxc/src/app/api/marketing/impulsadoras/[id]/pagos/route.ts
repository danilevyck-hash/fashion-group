import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { registrarPagoImpulsadora } from "@/lib/marketing/impulsadoras";
import { logActivity } from "@/lib/log-activity";
import type { RegistrarPagoImpulsadoraInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/marketing/impulsadoras/[id]/pagos — registra un pago por PERÍODO
// TRABAJADO (desde/hasta: quincena, mes completo o un solo día).
// Crea 1 factura por marca (estado Pagado) con el comprobante adjunto.
// Comprobante OBLIGATORIO: sin él responde 400 y no guarda nada.
// Dos pagos en el mismo mes se permiten; lo que se rechaza es que el período
// se solape con otro pago ya registrado (ver registrarPagoImpulsadora).
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
    const body = (await req.json()) as Partial<RegistrarPagoImpulsadoraInput>;
    if (!body?.desde || !body?.hasta || body.monto === undefined) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 },
      );
    }
    if (!body.comprobante?.path) {
      return NextResponse.json(
        { error: "El comprobante es obligatorio" },
        { status: 400 },
      );
    }
    const res = await registrarPagoImpulsadora(params.id, {
      desde: body.desde,
      hasta: body.hasta,
      monto: Number(body.monto),
      comprobante: body.comprobante,
    });
    logActivity(
      auth.role,
      "impulsadora_pago",
      "marketing",
      {
        id: params.id,
        desde: body.desde,
        hasta: body.hasta,
        monto: body.monto,
        facturas: res.facturasCreadas,
      },
      auth.userName,
    ).catch(() => {});
    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
