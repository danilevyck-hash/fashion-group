import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { deleteProducto, updateProducto } from "@/lib/marketing/inventario";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const body = (await req.json()) as {
      nombre?: string;
      precio?: number;
      stockTotal?: number;
    };
    const updated = await updateProducto(params.id, {
      nombre: body.nombre,
      precio: body.precio !== undefined ? Number(body.precio) : undefined,
      stockTotal:
        body.stockTotal !== undefined ? Number(body.stockTotal) : undefined,
    });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/productos/[id] PATCH:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
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
    await deleteProducto(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/productos/[id] DELETE:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
