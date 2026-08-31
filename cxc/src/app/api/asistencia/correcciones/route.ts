// GET    /api/asistencia/correcciones?codigo=&fecha=   → el historial de ese día
// POST   /api/asistencia/correcciones                  → corregir / agregar
// DELETE /api/asistencia/correcciones?id=               → deshacer
//
// ── 🔴 LO QUE ESTA RUTA NO HACE ─────────────────────────────────────────────
//
// NO toca `asistencia_marcaciones`. Ni un UPDATE, ni un DELETE. Lo único que le
// hace es LEER una fila para validar que la corrección apunta a la persona y al
// día que dice. La marcación del reloj es la única prueba de a qué hora entró
// alguien —y eso define un pago—: pisarla la destruiría para siempre.
//
// ── QUIÉN PUEDE ─────────────────────────────────────────────────────────────
//
// TODOS los roles que hoy entran a Asistencia (`asistenciaRoles()`: admin,
// secretaria, contabilidad). Es decisión explícita de Daniel: *"1. todos pueden
// corregir"*. Por eso mismo la FIRMA no es opcional: sin ella, "todos pueden"
// se vuelve "nadie sabe quién fue".

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { diaPanama } from "@/lib/asistencia/reporte";
import {
  avisoMigracionCorrecciones,
  fechaValida,
  motivoValido,
  normalizarHora,
  normalizarMotivo,
} from "@/lib/asistencia/correcciones";
import {
  anularCorreccion,
  crearCorreccion,
  leerHistorialDelDia,
  leerMarcacion,
  type ResultadoEscritura,
} from "@/lib/asistencia/correcciones-server";

export const dynamic = "force-dynamic";

/**
 * Quién firma. Nunca puede quedar vacío: el nombre de la sesión, y si no lo
 * hubiera, el rol. Un `creada_por` en blanco lo rechaza el CHECK de la base
 * —y con razón—, así que el respaldo vive acá y no en un `?? ""`.
 */
function firma(auth: { userName?: string | null; role?: string | null }): string {
  const n = String(auth.userName ?? "").trim();
  if (n) return n;
  const r = String(auth.role ?? "").trim();
  return r || "desconocido";
}

function respuestaEscritura(r: ResultadoEscritura): NextResponse {
  if (r.ok) return NextResponse.json({ ok: true, id: r.id });
  if (r.faltaMigracion) {
    // 503 y no 500: no está roto, falta preparar la base. Y el texto dice qué
    // archivo hay que correr — nadie deduce de un 500 que falta un CREATE TABLE.
    return NextResponse.json({ error: avisoMigracionCorrecciones() }, { status: 503 });
  }
  return NextResponse.json({ error: r.error }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const codigo = (sp.get("codigo") ?? "").trim();
  const fecha = (sp.get("fecha") ?? "").trim();
  if (!codigo || !fechaValida(fecha)) {
    return NextResponse.json({ error: "Falta la persona o la fecha." }, { status: 400 });
  }

  try {
    const { historial, faltaMigracion } = await leerHistorialDelDia(codigo, fecha);
    return NextResponse.json({
      historial,
      // La pantalla usa esto para NO ofrecer corregir cuando todavía no se puede.
      // Ofrecer un botón que siempre falla es peor que no tenerlo.
      disponible: !faltaMigracion,
      aviso: faltaMigracion ? avisoMigracionCorrecciones() : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/correcciones GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    // 🔴 EL MOTIVO SE VALIDA PRIMERO Y NO SE NEGOCIA. Vacío o solo espacios no
    // sirve: es lo que teclea quien quiere saltarse el campo, y sin razón
    // escrita, en tres meses nadie sabe por qué esa hora difiere del reloj.
    if (!motivoValido(body?.motivo)) {
      return NextResponse.json(
        { error: "Escribe por qué se corrige. Sin razón no se puede guardar." },
        { status: 400 },
      );
    }
    const motivo = normalizarMotivo(body?.motivo);

    const hora = normalizarHora(body?.hora);
    if (!hora) {
      return NextResponse.json(
        { error: "La hora no sirve. Se espera algo como 8:00 o 17:04:30." },
        { status: 400 },
      );
    }

    const marcacionId = String(body?.marcacionId ?? "").trim() || null;
    let codigo = String(body?.codigo ?? "").trim();
    let fecha = String(body?.fecha ?? "").trim();

    if (marcacionId) {
      // ── CORREGIR una marcación que existe ────────────────────────────────
      //
      // 🔑 La persona y el día SALEN DE LA MARCACIÓN, no de lo que mandó el
      // navegador. Aceptar el `fecha` del cuerpo dejaría mover las horas de una
      // marcación a otro día —o sea, plata de una quincena a otra— sin que nada
      // lo avisara.
      const m = await leerMarcacion(marcacionId);
      if (!m) {
        return NextResponse.json(
          { error: "Esa marcación ya no está. Actualiza la pantalla y vuelve a intentar." },
          { status: 404 },
        );
      }
      codigo = m.empleadoCodigo;
      fecha = diaPanama(m.ocurrioEn);
    } else {
      // ── AGREGAR una marcación que el reloj nunca registró ────────────────
      if (!codigo) {
        return NextResponse.json({ error: "Falta la persona." }, { status: 400 });
      }
      if (!fechaValida(fecha)) {
        return NextResponse.json({ error: "La fecha no sirve." }, { status: 400 });
      }
    }

    return respuestaEscritura(
      await crearCorreccion({
        marcacionId,
        empleadoCodigo: codigo,
        fecha,
        hora,
        motivo,
        creadaPor: firma(auth),
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/correcciones POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Deshacer. La corrección se ANULA con firma; la fila queda. */
export async function DELETE(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta cuál corrección." }, { status: 400 });

  try {
    return respuestaEscritura(await anularCorreccion(id, firma(auth)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/correcciones DELETE]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
