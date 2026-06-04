import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  createProducto,
  listProductos,
} from "@/lib/marketing/inventario";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const productos = await listProductos();
    return NextResponse.json(productos);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/productos GET:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = (await req.json()) as {
      nombre?: string;
      precio?: number;
      stockTotal?: number;
    };
    if (!body.nombre || body.precio === undefined || body.stockTotal === undefined) {
      return NextResponse.json(
        { error: "nombre, precio y stockTotal son requeridos" },
        { status: 400 },
      );
    }
    const producto = await createProducto({
      nombre: body.nombre,
      precio: Number(body.precio),
      stockTotal: Number(body.stockTotal),
    });
    return NextResponse.json(producto);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/productos POST:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
