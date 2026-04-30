import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  createEntrega,
  listAllEntregas,
  listEntregasByProyecto,
} from "@/lib/marketing/inventario";

export const dynamic = "force-dynamic";

interface CreateEntregaBody {
  proyectoId?: string;
  items?: Array<{
    productoId?: string;
    cantidadPorMarca?: Record<string, unknown>;
  }>;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const proyectoId = searchParams.get("proyecto_id");
    const data = proyectoId
      ? await listEntregasByProyecto(proyectoId)
      : await listAllEntregas();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/entregas GET:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = (await req.json()) as CreateEntregaBody;
    if (!body.proyectoId || !Array.isArray(body.items)) {
      return NextResponse.json(
        { error: "proyectoId e items son requeridos" },
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
    const entrega = await createEntrega({
      proyectoId: body.proyectoId,
      items,
    });
    return NextResponse.json(entrega);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/entregas POST:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
