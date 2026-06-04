import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { deleteEntrega, updateEntrega } from "@/lib/marketing/inventario";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RepartoEntryBody {
  marcaId?: string;
  empresa?: string | null;
  cantidad?: number | string;
}

interface UpdateBody {
  notas?: string | null;
  items?: Array<{
    productoId?: string;
    reparto?: RepartoEntryBody[];
    cantidadPorMarca?: Record<string, number | string>;
  }>;
}

function normalizarRepartoBody(it: {
  reparto?: RepartoEntryBody[];
  cantidadPorMarca?: Record<string, number | string>;
}): Array<{ marcaId: string; empresa?: string | null; cantidad: number }> {
  if (Array.isArray(it.reparto) && it.reparto.length > 0) {
    return it.reparto.map((r) => ({
      marcaId: String(r.marcaId ?? ""),
      empresa:
        r.empresa === undefined
          ? undefined
          : r.empresa === null
            ? null
            : String(r.empresa),
      cantidad: Number(r.cantidad ?? 0),
    }));
  }
  if (it.cantidadPorMarca && typeof it.cantidadPorMarca === "object") {
    return Object.entries(it.cantidadPorMarca).map(([marcaId, cant]) => ({
      marcaId: String(marcaId),
      cantidad: Number(cant ?? 0),
    }));
  }
  return [];
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
      reparto: normalizarRepartoBody(it),
    }));
    const entrega = await updateEntrega(params.id, {
      items,
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
