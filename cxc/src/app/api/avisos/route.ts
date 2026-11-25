/**
 * /api/avisos — «Activa los avisos» al entrar a la app (25-nov-2026, `AVISOS_AL_ENTRAR_2026_11`).
 *
 *   GET → { clavePublica }        la llave VAPID para suscribir el aparato
 *   PUT { suscripcion } → { ok }  guarda el aparato a nombre de quien tiene la SESIÓN
 *
 * Cualquier usuario con sesión. El usuario sale de la cookie FIRMADA, nunca del
 * cuerpo. 🔴 Si el usuario tiene ficha de colaborador (marca asistencia), el
 * aparato se guarda TAMBIÉN donde lo busca el recordatorio de Marcación: cada
 * aviso lee una sola tabla, así que ninguno llega dos veces.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session-cookie";
import { AVISOS_AL_ENTRAR_2026_11 } from "@/lib/avisos/al-entrar";
import { guardarSuscripcionDeUsuario, usuarioDeAviso } from "@/lib/avisos/suscripciones-server";
import { guardarSuscripcion, validarSuscripcion } from "@/lib/marcacion/recordatorios-server";
import { leerEmpleadoCodigo } from "@/lib/marcacion/acceso";

export const dynamic = "force-dynamic";

function sesion(req: NextRequest) {
  if (!AVISOS_AL_ENTRAR_2026_11) return NextResponse.json({ error: "No disponible" }, { status: 404 });
  const s = verifySession(req.cookies.get("cxc_session")?.value);
  if (!s || !usuarioDeAviso(s.userName)) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return s;
}

export async function GET(req: NextRequest) {
  const s = sesion(req);
  if (s instanceof NextResponse) return s;
  return NextResponse.json({ clavePublica: process.env.VAPID_PUBLIC_KEY ?? null });
}

export async function PUT(req: NextRequest) {
  const s = sesion(req);
  if (s instanceof NextResponse) return s;
  const cuerpo = (await req.json().catch(() => null)) as { suscripcion?: unknown } | null;
  const suscripcion = validarSuscripcion(cuerpo?.suscripcion);
  if (!suscripcion) return NextResponse.json({ error: "Este teléfono no pudo activar los avisos. Intenta de nuevo." }, { status: 400 });
  try {
    await guardarSuscripcionDeUsuario(s.userName ?? "", suscripcion);
  } catch (e) {
    console.error("[avisos PUT]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudieron activar los avisos. Intenta de nuevo." }, { status: 500 });
  }
  // Marcación: aparte y sin frenar; lo de arriba ya quedó guardado.
  try {
    const codigo = await leerEmpleadoCodigo(s.userId);
    if (codigo) await guardarSuscripcion(codigo, suscripcion);
  } catch (e) {
    console.error("[avisos PUT marcacion]", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
