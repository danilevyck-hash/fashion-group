import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  esFaltaDeTablas,
  getPeriodo,
  renombrarPeriodo,
} from "@/lib/marketing/periodos-io";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MSG_SIN_TABLAS =
  "Todavía no se activaron los períodos. Falta correr la actualización en la base de datos.";

// PATCH /api/marketing/periodos/[id]   body: { nombre }
//
// Renombra el período ABIERTO.
//
// 🔴 UN PERÍODO CERRADO NO SE RENOMBRA. Su nombre ya viaja adentro del reporte
// que se le mandó al proveedor; cambiarlo acá dejaría al sistema llamándolo de
// una forma y al papel de otra.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }

  let nombre = "";
  try {
    const body = (await req.json()) as { nombre?: unknown };
    nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  } catch {
    return NextResponse.json({ error: "No se recibió el nombre" }, { status: 400 });
  }
  if (!nombre) {
    return NextResponse.json(
      { error: "Escribí un nombre para el período." },
      { status: 400 },
    );
  }
  if (nombre.length > 120) {
    return NextResponse.json(
      { error: "El nombre es muy largo. Usá menos de 120 letras." },
      { status: 400 },
    );
  }

  try {
    const periodo = await getPeriodo(params.id);
    if (!periodo) {
      return NextResponse.json(
        { error: "Ese período no existe." },
        { status: 404 },
      );
    }
    if (periodo.estado !== "abierto") {
      return NextResponse.json(
        {
          error:
            "Este período ya se cerró y se reportó, así que su nombre no se puede cambiar.",
        },
        { status: 400 },
      );
    }

    const actualizado = await renombrarPeriodo(params.id, nombre);
    return NextResponse.json({
      id: actualizado.id,
      nombre: actualizado.nombre,
      proveedorKey: actualizado.proveedor_key,
      estado: actualizado.estado,
    });
  } catch (err) {
    if (esFaltaDeTablas(err)) {
      return NextResponse.json({ error: MSG_SIN_TABLAS }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("PATCH /api/marketing/periodos/[id]:", msg);
    return NextResponse.json(
      { error: "No se pudo cambiar el nombre. Intenta de nuevo." },
      { status: 500 },
    );
  }
}
