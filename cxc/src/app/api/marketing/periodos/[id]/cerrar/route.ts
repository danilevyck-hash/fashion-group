import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { esFaltaDeTablas } from "@/lib/marketing/periodos-io";
import {
  ErrorDeCierre,
  MSG_SIN_TABLAS,
  cerrarPeriodoDeMarca,
  validarNombreSiguiente,
} from "../../cerrar";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/marketing/periodos/[id]/cerrar   body: { nombreSiguiente }
//
// Cierra el período abierto de UNA marca y abre el siguiente en cero.
//
// 🔑 LOS PROYECTOS NO SE CIERRAN. Lo que se congela es la parte de ESA marca:
// un proyecto con Tommy y Reebok, al cerrar Tommy, conserva su parte de Reebok
// viva y se le puede seguir cargando gasto.
//
// La operación entera vive en `../../cerrar.ts` — la MISMA que usa "Cerrar las
// tres". Dos copias del cierre serían dos reportes distintos según qué botón se
// apretó.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }

  let nombreSiguiente = "";
  try {
    const body = (await req.json()) as { nombreSiguiente?: unknown };
    nombreSiguiente = validarNombreSiguiente(body?.nombreSiguiente);
  } catch (err) {
    if (err instanceof ErrorDeCierre) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "No se recibió el nombre del próximo período." },
      { status: 400 },
    );
  }

  try {
    const r = await cerrarPeriodoDeMarca({
      periodoId: params.id,
      nombreSiguiente,
      cerradoPor: auth.userName || auth.role,
    });
    return NextResponse.json({
      cerrado: {
        id: r.cerrado.id,
        nombre: r.cerrado.nombre,
        // El nombre viejo se conserva para no romper a quien ya lo lee.
        proveedorKey: r.cerrado.marcaCodigo,
        marcaCodigo: r.cerrado.marcaCodigo,
        marcaNombre: r.cerrado.marcaNombre,
        totales: r.cerrado.totales,
      },
      siguiente: r.siguiente,
      zip: r.zip,
    });
  } catch (err) {
    if (err instanceof ErrorDeCierre) {
      return NextResponse.json(
        { error: err.message, ...(err.extra ?? {}) },
        { status: err.status },
      );
    }
    if (esFaltaDeTablas(err)) {
      return NextResponse.json({ error: MSG_SIN_TABLAS }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("POST /api/marketing/periodos/[id]/cerrar:", msg);
    return NextResponse.json(
      { error: "No se pudo cerrar el período. Intenta de nuevo." },
      { status: 500 },
    );
  }
}
