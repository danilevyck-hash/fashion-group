import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getFacturaById } from "@/lib/marketing/queries";
import { getMarcasDeFactura } from "@/lib/marketing/factura-marcas";
import {
  updateFactura,
  eliminarFacturaDefinitiva,
} from "@/lib/marketing/mutations";
import { firmarAdjuntos } from "@/lib/marketing/storage";
import { logAudit } from "@/lib/marketing/audit";
import { supabaseServer } from "@/lib/supabase-server";
import type { UpdateFacturaInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
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
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin"]);
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
    const marcasBefore = await getMarcasDeFactura(params.id);
    const { data: adjBefore } = await supabaseServer
      .from("mk_adjuntos")
      .select("*")
      .eq("factura_id", params.id);

    await eliminarFacturaDefinitiva(params.id);

    await logAudit({
      action: "delete_definitivo",
      entityType: "mk_facturas",
      entityId: params.id,
      userRole: auth.role,
      userName: auth.userName,
      before: {
        factura,
        marcas: marcasBefore,
        adjuntos: adjBefore ?? [],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo eliminar la factura";
    console.error("marketing/facturas/[id] DELETE:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
