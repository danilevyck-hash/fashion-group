import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { createFactura } from "@/lib/marketing/mutations";
import type { CreateFacturaInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = (await req.json()) as Partial<CreateFacturaInput>;
    if (
      !body?.proyectoId ||
      !body.numeroFactura ||
      !body.fechaFactura ||
      !body.proveedor ||
      !body.concepto ||
      body.subtotal === undefined
    ) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 },
      );
    }
    const factura = await createFactura({
      proyectoId: body.proyectoId,
      numeroFactura: body.numeroFactura,
      fechaFactura: body.fechaFactura,
      proveedor: body.proveedor,
      concepto: body.concepto,
      subtotal: Number(body.subtotal),
      itbms: body.itbms !== undefined ? Number(body.itbms) : 0,
    });
    return NextResponse.json(factura);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo crear la factura";
    console.error("marketing/facturas POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
