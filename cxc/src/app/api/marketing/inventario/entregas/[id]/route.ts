import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { deleteEntrega, updateEntrega } from "@/lib/marketing/inventario";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MarcaPctBody {
  marcaId?: string;
  porcentaje?: number | string;
}

interface UpdateBody {
  notas?: string | null;
  marcas?: MarcaPctBody[];
  items?: Array<{
    productoId?: string;
    cantidad?: number | string;
  }>;
}

function normalizarMarcasBody(
  marcas?: MarcaPctBody[],
): Array<{ marcaId: string; porcentaje: number }> {
  if (!Array.isArray(marcas)) return [];
  return marcas
    .map((m) => ({
      marcaId: String(m.marcaId ?? ""),
      porcentaje: Number(m.porcentaje ?? 0),
    }))
    .filter((m) => m.marcaId);
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
    const body = (await req.json()) as UpdateBody;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "items requerido (no vacío)" },
        { status: 400 },
      );
    }
    const items = body.items.map((it) => ({
      productoId: String(it.productoId ?? ""),
      cantidad: Number(it.cantidad ?? 0),
    }));
    const entrega = await updateEntrega(params.id, {
      items,
      marcas: normalizarMarcasBody(body.marcas),
      notas: body.notas,
    });
    return NextResponse.json(entrega);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/entregas/[id] PATCH:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

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
    await deleteEntrega(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/entregas/[id] DELETE:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
