import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import {
  getProyectoById,
  getFacturasByProyecto,
} from "@/lib/marketing/queries";
import { getMarcasDeFactura } from "@/lib/marketing/factura-marcas";
import {
  updateProyecto,
  actualizarRepartoProyecto,
} from "@/lib/marketing/mutations";
import { firmarAdjuntos } from "@/lib/marketing/storage";
import { logAudit } from "@/lib/marketing/audit";
import type {
  MarcaPorcentajeInput,
  UpdateProyectoInput,
} from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
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

interface PatchProyectoBody extends UpdateProyectoInput {
  marcas?: MarcaPorcentajeInput[];
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
    const body = (await req.json()) as PatchProyectoBody;

    // Snapshot before.
    const proyectoBefore = await getProyectoById(params.id);
    if (!proyectoBefore) {
      return NextResponse.json(
        { error: "Proyecto no encontrado" },
        { status: 404 },
      );
    }

    const { marcas, ...patch } = body;

    let updated = proyectoBefore;
    const tieneCamposBase =
      patch.tienda !== undefined ||
      patch.tiendaCodigo !== undefined ||
      patch.nombre !== undefined ||
      patch.fecha_inicio !== undefined ||
      patch.notas !== undefined;

    if (tieneCamposBase) {
      const u = await updateProyecto(params.id, patch);
      updated = { ...proyectoBefore, ...u };
    }

    if (Array.isArray(marcas)) {
      await actualizarRepartoProyecto(params.id, marcas);
    }

    // Releer estado final con reparto.
    const proyectoAfter = await getProyectoById(params.id);

    await logAudit({
      action: "update",
      entityType: "mk_proyectos",
      entityId: params.id,
      userRole: auth.role,
      userName: auth.userName,
      before: {
        proyecto: proyectoBefore,
        marcas: proyectoBefore.marcas,
      },
      after: {
        proyecto: proyectoAfter ?? updated,
        marcas: proyectoAfter?.marcas ?? null,
      },
    });

    return NextResponse.json(proyectoAfter ?? updated);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo actualizar";
    console.error("marketing/proyectos/[id] PATCH:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// 🩸 «ELIMINAR DEFINITIVAMENTE» SE RETIRÓ (22-sep-2026). Daniel: con «Anular»
// basta. La puerta se queda para contestar que NO —403, con el porqué— en vez
// de un 404 que parecería un bug. Los 12 borrados duros de la historia quedan
// en `activity_logs` (`delete_definitivo`); no se construye nada encima.
const MSG_BORRADO_RETIRADO =
  "Eliminar definitivamente ya no existe. Anula el proyecto: queda plegado y se puede restaurar.";
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  return NextResponse.json({ error: MSG_BORRADO_RETIRADO }, { status: 403 });
}
