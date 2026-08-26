// POST /api/asistencia/aprobaciones
//   { desde, hasta, aprobado, personas: [{ codigo, minutos }] }
//
// Aprobar (o desaprobar) las horas extra de una o varias personas en UN período.
//
// ── 🔴 POR QUÉ ACÁ NO HAY GET ────────────────────────────────────────────────
//
// La LISTA de lo que hay para aprobar sale de `/api/asistencia/planilla`
// (`?aprobaciones=1`), y no de una segunda ruta que rearme la misma cuenta. Los
// minutos de hora extra salen de paginar todas las marcaciones del período,
// aplicar las correcciones, armar el reporte y clasificar día por día: una
// segunda copia de ese camino sería una segunda verdad, y el día que las dos se
// separen la pantalla de aprobar diría una cosa y la que paga, otra. Es
// exactamente el error que ya pasó con `motivosDeQuienNoMarco`.
//
// Acá solo se ESCRIBE.

import { NextRequest, NextResponse } from "next/server";
import { aprobacionesRoles } from "@/lib/asistencia/roles";
import { requireRole } from "@/lib/requireRole";
import {
  avisoMigracionAprobaciones,
  claveAprobacion,
} from "@/lib/asistencia/aprobaciones";
import { guardarAprobaciones } from "@/lib/asistencia/aprobaciones-server";

export const dynamic = "force-dynamic";

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  // 🔴 EL CANDADO DE VERDAD ESTÁ ACÁ, no en que la pestaña se vea o no. Quien
  // no puede aprobar no aprueba ni entrando por la URL. Ver la nota larga de
  // `APROBACIONES_ROLES`: hoy es solo `admin` porque Julio Garay todavía no
  // tiene usuario en el sistema y crearle uno lo decide Daniel.
  const auth = requireRole(req, aprobacionesRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const desde = String(body?.desde ?? "").trim();
    const hasta = String(body?.hasta ?? "").trim();
    if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta) || hasta < desde) {
      return NextResponse.json(
        { error: "Período inválido. Se esperan dos fechas como 2026-07-16." },
        { status: 400 },
      );
    }

    const aprobado = body?.aprobado !== false;
    const crudas = Array.isArray(body?.personas) ? (body!.personas as unknown[]) : [];

    // 🔑 `minutos` es el TESTIGO, no el pago. Nunca se multiplica por una rata:
    // lo que se paga lo vuelve a calcular el motor con la base vigente el día
    // del cuadro. Por eso aceptarlo de la pantalla es inofensivo — lo único que
    // podría salir mal es que el aviso «cambió desde que se aprobó» aparezca de
    // más, que es del lado seguro. Igual se normaliza: entero y nunca negativo.
    const minutosPorCodigo = new Map<string, number>();
    for (const c of crudas) {
      const o = c as Record<string, unknown> | null;
      const codigo = String(o?.codigo ?? "").trim();
      if (!codigo) continue;
      const n = Number(o?.minutos ?? 0);
      minutosPorCodigo.set(codigo, Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
    }

    if (minutosPorCodigo.size === 0) {
      return NextResponse.json({ error: "No se indicó a quién aprobar." }, { status: 400 });
    }

    const guardado = await guardarAprobaciones({
      desde,
      hasta,
      minutosPorCodigo,
      aprobado,
      // Queda registro de QUIÉN. Lo pidió Daniel explícitamente.
      por: auth.userName || auth.role,
      cuando: new Date().toISOString(),
    });

    return NextResponse.json(
      guardado
        ? {
          ok: true,
          aprobado,
          personas: minutosPorCodigo.size,
          claves: [...minutosPorCodigo.keys()].map((c) => claveAprobacion(c, desde, hasta)),
        }
        : { ok: false, aviso: avisoMigracionAprobaciones() },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/aprobaciones POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
