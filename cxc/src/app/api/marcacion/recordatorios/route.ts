// /api/marcacion/recordatorios — los recordatorios de quien marca (16-nov-2026).
//
//   GET → los cuatro renglones (lo guardado, o apagado con la hora de su
//         horario) y la llave pública para suscribir el aparato. Sin ficha
//         (Daniel, admin, 17-nov-2026) contesta solo la llave, con
//         `recordatorios: null`: así puede usar «Probar aviso».
//   PUT → guarda los renglones y, si viene, la suscripción de este aparato.
//
// 🔴 El código sale de la SESIÓN, nunca del cuerpo.

import { NextResponse, type NextRequest } from "next/server";
import { leerEmpleadoCodigo, requireMarcacion } from "@/lib/marcacion/acceso";
import { AVISO_SIN_CODIGO } from "@/lib/marcacion/marcacion";
import { recordatoriosDe, validarRecordatorios } from "@/lib/marcacion/recordatorios";
import {
  guardarRecordatorios,
  guardarSuscripcion,
  leerHorarioDeMarcacion,
  leerRecordatoriosGuardados,
  validarSuscripcion,
} from "@/lib/marcacion/recordatorios-server";

export const dynamic = "force-dynamic";

const ERROR_LEER = "No se pudieron leer tus recordatorios. Intenta de nuevo en unos segundos.";
const ERROR_GUARDAR = "No se pudieron guardar tus recordatorios. Intenta de nuevo en unos segundos.";

async function estado(codigo: string) {
  const [horario, guardados] = await Promise.all([leerHorarioDeMarcacion(codigo), leerRecordatoriosGuardados(codigo)]);
  return {
    recordatorios: recordatoriosDe(guardados, horario),
    clavePublica: process.env.VAPID_PUBLIC_KEY ?? null,
  };
}

export async function GET(req: NextRequest) {
  const auth = requireMarcacion(req);
  if (auth instanceof NextResponse) return auth;
  const codigo = await leerEmpleadoCodigo(auth.userId);
  if (!codigo) return NextResponse.json({ recordatorios: null, clavePublica: process.env.VAPID_PUBLIC_KEY ?? null });
  try {
    return NextResponse.json(await estado(codigo));
  } catch (e) {
    console.error("[marcacion recordatorios GET]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: ERROR_LEER }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireMarcacion(req);
  if (auth instanceof NextResponse) return auth;
  const codigo = await leerEmpleadoCodigo(auth.userId);
  if (!codigo) return NextResponse.json({ error: AVISO_SIN_CODIGO }, { status: 404 });

  const cuerpo = (await req.json().catch(() => null)) as { recordatorios?: unknown; suscripcion?: unknown } | null;
  const recordatorios = validarRecordatorios(cuerpo?.recordatorios);
  if (!recordatorios) {
    return NextResponse.json({ error: "Revisa las horas: un recordatorio encendido necesita su hora." }, { status: 400 });
  }
  const suscripcion = cuerpo?.suscripcion == null ? null : validarSuscripcion(cuerpo.suscripcion);
  if (cuerpo?.suscripcion != null && !suscripcion) {
    return NextResponse.json({ error: "Este teléfono no pudo activar los avisos. Intenta de nuevo." }, { status: 400 });
  }
  try {
    if (suscripcion) await guardarSuscripcion(codigo, suscripcion);
    await guardarRecordatorios(codigo, recordatorios);
    return NextResponse.json(await estado(codigo));
  } catch (e) {
    console.error("[marcacion recordatorios PUT]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: ERROR_GUARDAR }, { status: 500 });
  }
}
