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
import { requireAsistencia } from "@/lib/asistencia/guard";
import {
  avisoMigracionAprobaciones,
  claveDia,
} from "@/lib/asistencia/aprobaciones";
import { guardarAprobaciones, type DiaAAprobar } from "@/lib/asistencia/aprobaciones-server";

export const dynamic = "force-dynamic";

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  // 🔴 EL CANDADO DE VERDAD ESTÁ ACÁ, no en que la pestaña se vea o no. Quien
  // no puede aprobar no aprueba ni entrando por la URL. Ver la nota larga de
  // `APROBACIONES_ROLES`: hoy es solo `admin` porque Julio Garay todavía no
  // tiene usuario en el sistema y crearle uno lo decide Daniel.
  const auth = requireAsistencia(req, aprobacionesRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const aprobado = body?.aprobado !== false;
    const crudas = Array.isArray(body?.dias) ? (body!.dias as unknown[]) : [];

    // 🔑 `minutos` es el TESTIGO, no el pago. Nunca se multiplica por una rata:
    // lo que se paga lo vuelve a calcular el motor con la base vigente el día
    // del cuadro. Por eso aceptarlo de la pantalla es inofensivo — lo único que
    // podría salir mal es que el aviso «cambió desde que se aprobó» aparezca de
    // más, que es del lado seguro. Igual se normaliza: entero y nunca negativo.
    // 🔑 Se deduplica por (código, fecha): dos veces el mismo día en el mismo
    // cuerpo tiene que producir UNA fila, no reventar el upsert de Postgres —
    // que rechaza la sentencia entera si trae la misma llave dos veces.
    const porClave = new Map<string, DiaAAprobar>();
    for (const c of crudas) {
      const o = c as Record<string, unknown> | null;
      const codigo = String(o?.codigo ?? "").trim();
      const fecha = String(o?.fecha ?? "").trim();
      if (!codigo || !ES_FECHA.test(fecha)) continue;
      const n = Number(o?.minutos ?? 0);
      porClave.set(claveDia(codigo, fecha), {
        codigo,
        fecha,
        minutos: Number.isFinite(n) && n > 0 ? Math.round(n) : 0,
      });
    }
    const dias = [...porClave.values()];

    if (dias.length === 0) {
      return NextResponse.json(
        { error: "No se indicó qué día aprobar." },
        { status: 400 },
      );
    }

    const guardado = await guardarAprobaciones({
      dias,
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
          dias: dias.length,
          claves: [...porClave.keys()],
        }
        : { ok: false, aviso: avisoMigracionAprobaciones() },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/aprobaciones POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
