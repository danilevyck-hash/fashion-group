// GET    /api/asistencia/correcciones?codigo=&fecha=   → el historial de ese día
// POST   /api/asistencia/correcciones                  → corregir / agregar / QUITAR
// DELETE /api/asistencia/correcciones?id=               → deshacer
//
// ── 🔴 LA TERCERA FORMA ENTRA POR ACÁ DESDE EL 18-sep-2026 ──────────────────
//
// La contadora, por WhatsApp el 17-sep-2026, textual:
//
//     «el motivo de que no me deja cerrar es porque hay marcaciones de mas y no
//      me deja eliminar»
//
// y Daniel, aclarando de cuáles habla: *«las marcaciones del reloj, no las del
// app que hicimos»*.
//
// 🩸 QUITAR una marcación existía desde el 14-sep-2026 —`asistencia_correcciones.quita`—
// pero SOLO por `/api/marcacion/deshacer`, la puerta del reloj del teléfono, que
// mira la última marca de quien está con la sesión abierta y solo dentro de dos
// minutos. La pantalla de ella no podía llamarla, así que **una marca del reloj
// físico no se podía quitar de ninguna forma** y el cierre de la quincena se
// quedaba trabado. Ahora esta ruta acepta `quita: true` con el MISMO mecanismo,
// la misma tabla, el mismo motivo obligatorio y el mismo `anulada_en`.
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
import { rechazarFueraDeAlcance } from "@/lib/asistencia/alcance-boston-server";
import { supabaseServer } from "@/lib/supabase-server";
import { TABLA_CORRECCIONES } from "@/lib/asistencia/correcciones";
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
    return NextResponse.json({ error: "Falta el colaborador o la fecha." }, { status: 400 });
  }
  // 🔴 EL ALCANCE DE DAVID (23-sep-2026): el historial de alguien ajeno, 403.
  const fuera = await rechazarFueraDeAlcance(auth.role, [codigo]);
  if (fuera) return fuera;

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

    // 🔴 QUITAR NO LLEVA HORA, Y NO ES UN DESCUIDO: no vale ninguna, porque esa
    // marcación deja de contar. El CHECK de la base lo exige
    // (`asistencia_correcciones_quita_sin_hora`) y acá se decide antes de pedir
    // la hora, para no rechazar una petición correcta por un campo que no va.
    const quita = body?.quita === true;

    const hora = quita ? null : normalizarHora(body?.hora);
    if (!quita && !hora) {
      return NextResponse.json(
        { error: "La hora no sirve. Se espera algo como 8:00 o 17:04:30." },
        { status: 400 },
      );
    }

    const marcacionId = String(body?.marcacionId ?? "").trim() || null;
    let codigo = String(body?.codigo ?? "").trim();
    let fecha = String(body?.fecha ?? "").trim();

    // 🔴 NO SE QUITA UNA MARCACIÓN QUE NO EXISTE. Sin `marcacionId` no hay nada
    // que dejar de contar: lo que se «quitaría» sería una marcación agregada a
    // mano, y ésa se deshace con DELETE (`anulada_en`), que es otra cosa.
    if (quita && !marcacionId) {
      return NextResponse.json(
        { error: "Elige cuál marcación se quita. Solo se puede quitar una que el reloj registró." },
        { status: 400 },
      );
    }

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
        return NextResponse.json({ error: "Falta el colaborador." }, { status: 400 });
      }
      if (!fechaValida(fecha)) {
        return NextResponse.json({ error: "La fecha no sirve." }, { status: 400 });
      }
    }

    // 🔴 EL ALCANCE DE DAVID (23-sep-2026): con la persona ya resuelta (de la
    // marcación o del cuerpo), se rechaza si no es de su empresa.
    const fuera = await rechazarFueraDeAlcance(auth.role, [codigo]);
    if (fuera) return fuera;

    return respuestaEscritura(
      await crearCorreccion({
        marcacionId,
        empleadoCodigo: codigo,
        fecha,
        hora,
        motivo,
        creadaPor: firma(auth),
        // ⚠️ Viaja SOLO cuando se quita: `crearCorreccion` no manda la columna
        // si va en `false`, para que el alta de una corrección normal siga
        // funcionando aunque la migración no hubiera corrido.
        ...(quita ? { quita: true } : {}),
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
  // 🔴 EL ALCANCE DE DAVID (23-sep-2026): se mira de QUIÉN es antes de anularla.
  const fuera = await rechazarFueraDeAlcance(auth.role, await codigoDeCorreccion(id));
  if (fuera) return fuera;

  try {
    return respuestaEscritura(await anularCorreccion(id, firma(auth)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/correcciones DELETE]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** El código de la persona de una corrección, para el recorte por alcance. Sin fila, nada que recortar. */
async function codigoDeCorreccion(id: string): Promise<string[]> {
  const { data } = await supabaseServer
    .from(TABLA_CORRECCIONES)
    .select("empleado_codigo")
    .eq("id", id)
    .maybeSingle();
  const codigo = (data as { empleado_codigo?: string | null } | null)?.empleado_codigo;
  return codigo ? [String(codigo)] : [];
}
