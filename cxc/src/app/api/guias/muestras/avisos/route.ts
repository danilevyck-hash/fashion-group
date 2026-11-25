/**
 * Despachos › Muestras › «Activa los avisos» (25-nov-2026, `MUESTRAS_AVISO_PUSH_2026_11`).
 *
 *   GET → { clavePublica }        la llave VAPID para suscribir el aparato
 *   PUT { suscripcion } → { ok }  guarda el aparato a nombre de quien tiene la SESIÓN
 *
 * 🔴 Solo el vendedor que manda muestras (`ofreceAvisoDeMuestras` + sus
 * empresas). El usuario sale de la cookie FIRMADA, nunca del cuerpo.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { empresasDeMuestrasDe } from "@/lib/guias/muestras";
import { ofreceAvisoDeMuestras } from "@/lib/guias/muestras-aviso";
import { guardarSuscripcionDeUsuario } from "@/lib/guias/muestras-aviso-server";
import { validarSuscripcion } from "@/lib/marcacion/recordatorios-server";

export const dynamic = "force-dynamic";

function guard(req: NextRequest) {
  const auth = requireRole(req, ["vendedor"]);
  if (auth instanceof NextResponse) return auth;
  if (!ofreceAvisoDeMuestras(auth.role)) return NextResponse.json({ error: "No disponible" }, { status: 404 });
  if (empresasDeMuestrasDe(auth.userName, auth.role).length === 0) {
    return NextResponse.json({ error: "Los avisos de muestras son para el vendedor que las manda" }, { status: 403 });
  }
  return auth;
}

export async function GET(req: NextRequest) {
  const auth = guard(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ clavePublica: process.env.VAPID_PUBLIC_KEY ?? null });
}

export async function PUT(req: NextRequest) {
  const auth = guard(req);
  if (auth instanceof NextResponse) return auth;
  const cuerpo = (await req.json().catch(() => null)) as { suscripcion?: unknown } | null;
  const suscripcion = validarSuscripcion(cuerpo?.suscripcion);
  if (!suscripcion) return NextResponse.json({ error: "Este teléfono no pudo activar los avisos. Intenta de nuevo." }, { status: 400 });
  try {
    await guardarSuscripcionDeUsuario(auth.userName ?? "", suscripcion);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[muestras avisos PUT]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudieron activar los avisos. Intenta de nuevo." }, { status: 500 });
  }
}
