import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  getProyectoById,
  getFacturasByProyecto,
} from "@/lib/marketing/queries";
import { getMarcasDeFactura } from "@/lib/marketing/factura-marcas";
import { updateProyecto } from "@/lib/marketing/mutations";
import { firmarAdjuntos } from "@/lib/marketing/storage";
import type { UpdateProyectoInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const proyecto = await getProyectoById(params.id);
    if (!proyecto) {
      return NextResponse.json(
        { error: "Proyecto no encontrado" },
        { status: 404 },
      );
    }
    // Incluimos facturas en la misma respuesta para evitar un segundo fetch
    // que estaba devolviendo array vacío en prod por razones no determinables
    // desde build estático. Fuente única del detalle.
    const facturasRaw = await getFacturasByProyecto(params.id);
    const facturas = await Promise.all(
      facturasRaw.map(async (f) => ({
        ...f,
        adjuntos: await firmarAdjuntos(f.adjuntos ?? []),
        marcas: await getMarcasDeFactura(f.id),
      })),
    );
    return NextResponse.json({ ...proyecto, facturas });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("marketing/proyectos/[id] GET:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    const body = (await req.json()) as UpdateProyectoInput;
    const updated = await updateProyecto(params.id, body);
    return NextResponse.json(updated);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo actualizar";
    console.error("marketing/proyectos/[id] PATCH:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
