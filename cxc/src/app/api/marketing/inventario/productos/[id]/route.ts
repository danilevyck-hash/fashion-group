import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  deleteProducto,
  getProductoPrecio,
  recalcularEntregasPorPrecio,
  updateProducto,
} from "@/lib/marketing/inventario";

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
      /** `null` explícito quita la foto; ausente la deja como está. */
      fotoPath?: string | null;
    };
    // Precio anterior (para saber si el cambio debe propagarse a las entregas).
    const precioAntes =
      body.precio !== undefined ? await getProductoPrecio(params.id) : null;

    const updated = await updateProducto(params.id, {
      nombre: body.nombre,
      precio: body.precio !== undefined ? Number(body.precio) : undefined,
      stockTotal:
        body.stockTotal !== undefined ? Number(body.stockTotal) : undefined,
      fotoPath: body.fotoPath,
    });

    // Precio vivo: si el precio cambió de verdad, recalcular el total y el
    // total_por_marca de TODAS las entregas que usan este producto.
    let impacto = null;
    if (
      body.precio !== undefined &&
      precioAntes !== null &&
      Math.abs(Number(body.precio) - precioAntes) > 0.005
    ) {
      impacto = await recalcularEntregasPorPrecio(
        params.id,
        Number(body.precio),
        true,
      );
    }

    return NextResponse.json({ ...updated, impacto });
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
