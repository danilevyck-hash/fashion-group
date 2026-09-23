import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import {
  esFaltaDeTablas,
  getPeriodo,
  renombrarPeriodo,
} from "@/lib/marketing/periodos-io";
import { supabaseServer } from "@/lib/supabase-server";
import { completarPeriodo, esColumnaAusente } from "@/lib/marketing/columnas-opcionales";
import { zipsDelPeriodo } from "@/lib/marketing/zips-del-periodo";
import { ZIP_E_IMPULSADORAS_NUEVO } from "@/lib/marketing/zip-e-impulsadoras";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MSG_SIN_TABLAS =
  "Todavía no se activaron los períodos. Falta correr la actualización en la base de datos.";

// ────────────────────────────────────────────────────────────────────────────
// GET /api/marketing/periodos/[id]   → { zips, sinMigracion }
//
// 🔴 LO QUE YA SE LE MANDÓ A LA MARCA. `mk_periodos.zips_bajados` se llena
// desde el 22-sep-2026 con cada ZIP que se baja (`zips-bajados.ts`), y hasta
// hoy NADIE lo mostraba. Esta puerta solo LEE esa columna — ni un `update`.
//
// 🔴 Falla ABIERTA: sin la columna (`columnas-opcionales.ts`) contesta lista
// vacía y lo dice en `sinMigracion`; la pantalla entonces no dibuja nada.
// ────────────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }
  if (!ZIP_E_IMPULSADORAS_NUEVO) {
    return NextResponse.json({ zips: [], sinMigracion: false });
  }
  try {
    const { data, error } = await supabaseServer
      .from("mk_periodos")
      .select("id, zips_bajados")
      .eq("id", params.id)
      .maybeSingle();
    if (error) {
      if (esColumnaAusente(error)) {
        return NextResponse.json({ zips: [], sinMigracion: true });
      }
      throw new Error(error.message);
    }
    const fila = completarPeriodo((data ?? {}) as Record<string, unknown>);
    return NextResponse.json({
      zips: zipsDelPeriodo(fila.zips_bajados),
      sinMigracion: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/periodos/[id]:", msg);
    return NextResponse.json({ zips: [], sinMigracion: false }, { status: 200 });
  }
}

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
      { error: "Escribe un nombre para el período." },
      { status: 400 },
    );
  }
  if (nombre.length > 120) {
    return NextResponse.json(
      { error: "El nombre es muy largo. Usa menos de 120 letras." },
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
