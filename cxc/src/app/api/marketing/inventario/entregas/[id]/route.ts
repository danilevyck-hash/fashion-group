import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { deleteEntrega, updateEntrega } from "@/lib/marketing/inventario";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UpdateBody {
  items?: Array<{
    productoId?: string;
    cantidadPorMarca?: Record<string, unknown>;
  }>;
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
    const body = (await req.json()) as UpdateBody;
    if (!Array.isArray(body.items)) {
      return NextResponse.json(
        { error: "items requerido" },
        { status: 400 },
      );
    }
    const items = body.items.map((it) => {
      const cant: Record<string, number> = {};
      for (const [k, v] of Object.entries(it.cantidadPorMarca ?? {})) {
        const n = Number(v);
        if (Number.isFinite(n)) cant[String(k)] = n;
      }
      return {
        productoId: String(it.productoId ?? ""),
        cantidadPorMarca: cant,
      };
    });
    const entrega = await updateEntrega(params.id, { items });
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
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
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
