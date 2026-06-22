import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { recalcularEntregasPorPrecio } from "@/lib/marketing/inventario";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/marketing/inventario/productos/[id]/impacto-precio?precio=X
//
// Preview (read-only) del impacto de cambiar el precio de un producto a `precio`:
// cuántas entregas se recalculan y cómo cambia el total de muebles. NO escribe.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  const precioStr = req.nextUrl.searchParams.get("precio");
  const precio = Number(precioStr);
  if (precioStr === null || !Number.isFinite(precio) || precio < 0) {
    return NextResponse.json({ error: "precio inválido" }, { status: 400 });
  }
  try {
    const impacto = await recalcularEntregasPorPrecio(params.id, precio, false);
    return NextResponse.json(impacto);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/productos/[id]/impacto-precio GET:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
