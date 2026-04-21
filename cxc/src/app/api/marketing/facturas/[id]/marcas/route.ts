import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  getMarcasDeFactura,
  setMarcasDeFactura,
} from "@/lib/marketing/factura-marcas";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    const marcas = await getMarcasDeFactura(params.id);
    return NextResponse.json(marcas);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/facturas/[id]/marcas:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT reemplaza toda la lista (setMarcasDeFactura valida suma=100).
// Body: { marcas: [{ marcaId: string, porcentaje: number }, ...] }
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as {
      marcas?: Array<{ marcaId: string; porcentaje: number }>;
    };
    if (!Array.isArray(body.marcas)) {
      return NextResponse.json(
        { error: "Falta campo: marcas (array)" },
        { status: 400 },
      );
    }
    await setMarcasDeFactura(params.id, body.marcas);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("PUT /api/marketing/facturas/[id]/marcas:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
