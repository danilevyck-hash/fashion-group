import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  createEntrega,
  listAllEntregas,
  listEntregasByProyecto,
  listEntregasPendientes,
} from "@/lib/marketing/inventario";

export const dynamic = "force-dynamic";

interface MarcaPctBody {
  marcaId?: string;
  porcentaje?: number | string;
}

interface CreateEntregaBody {
  proyectoId?: string | null;
  notas?: string | null;
  // Marcas con % entre ellas (1 marca = 100%). Sin empresa interna.
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

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const proyectoId = searchParams.get("proyecto_id");
    let data;
    if (proyectoId === "null" || proyectoId === "pendientes") {
      data = await listEntregasPendientes();
    } else if (proyectoId) {
      data = await listEntregasByProyecto(proyectoId);
    } else {
      data = await listAllEntregas();
    }
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/entregas GET:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = (await req.json()) as CreateEntregaBody;
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
    const entrega = await createEntrega({
      proyectoId: body.proyectoId ?? null,
      items,
      marcas: normalizarMarcasBody(body.marcas),
      notas: body.notas ?? null,
    });
    return NextResponse.json(entrega);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/entregas POST:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
