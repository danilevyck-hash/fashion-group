import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { createPago } from "@/lib/marketing/mutations";

export const dynamic = "force-dynamic";

interface Body {
  cobranzaId?: string;
  fechaPago?: string;
  monto?: number;
  referencia?: string;
  comprobanteUrl?: string;
  notas?: string;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.cobranzaId || !body.fechaPago) {
    return NextResponse.json(
      { error: "cobranzaId y fechaPago requeridos" },
      { status: 400 }
    );
  }

  try {
    const pago = await createPago({
      cobranzaId: body.cobranzaId,
      fechaPago: body.fechaPago,
      monto: Number(body.monto ?? 0),
      referencia: body.referencia,
      comprobanteUrl: body.comprobanteUrl,
      notas: body.notas,
    });
    return NextResponse.json(pago);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
