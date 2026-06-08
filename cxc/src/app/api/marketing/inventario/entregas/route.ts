import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  createEntrega,
  listAllEntregas,
  listEntregasByProyecto,
  listEntregasPendientes,
} from "@/lib/marketing/inventario";

export const dynamic = "force-dynamic";

interface RepartoEntryBody {
  marcaId?: string;
  empresa?: string | null;
  cantidad?: number | string;
}

interface CreateEntregaBody {
  proyectoId?: string | null;
  notas?: string | null;
  items?: Array<{
    productoId?: string;
    reparto?: RepartoEntryBody[];
  }>;
}

// Normaliza el `reparto[]` del body. La empresa se deja undefined (default
// desde marca.empresa_codigo lo resuelve el backend).
function normalizarRepartoBody(it: {
  reparto?: RepartoEntryBody[];
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
  return [];
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
      reparto: normalizarRepartoBody(it),
    }));
    const entrega = await createEntrega({
      proyectoId: body.proyectoId ?? null,
      items,
      notas: body.notas ?? null,
    });
    return NextResponse.json(entrega);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/entregas POST:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
