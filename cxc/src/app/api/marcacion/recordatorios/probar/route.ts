// POST /api/marcacion/recordatorios/probar — «Probar aviso» (17-nov-2026).
//
// Manda AL INSTANTE un aviso de prueba a ESTE teléfono: la suscripción que
// trae el navegador de su propia sesión. 🔴 Exige sesión de Marcación y nunca
// recibe a quién mandar: con ficha, la suscripción se guarda a nombre del
// código de la SESIÓN (la misma que usa el recordatorio de verdad) y se manda
// a esa; sin ficha (Daniel, admin) se manda solo a la de este aparato, sin
// guardar nada. Nunca toca la suscripción de otra persona.

import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { leerEmpleadoCodigo, requireMarcacion } from "@/lib/marcacion/acceso";
import { TEXTO_AVISO_PRUEBA, TITULO_AVISO_PRUEBA } from "@/lib/marcacion/recordatorios";
import { guardarSuscripcion, validarSuscripcion } from "@/lib/marcacion/recordatorios-server";

export const dynamic = "force-dynamic";

const CONTACTO_VAPID = "mailto:notificaciones@fashiongr.com";

export async function POST(req: NextRequest) {
  const auth = requireMarcacion(req);
  if (auth instanceof NextResponse) return auth;

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: "Los avisos todavía no están disponibles." }, { status: 503 });

  const cuerpo = (await req.json().catch(() => null)) as { suscripcion?: unknown } | null;
  const suscripcion = validarSuscripcion(cuerpo?.suscripcion);
  if (!suscripcion) {
    return NextResponse.json({ error: "Este teléfono no pudo activar los avisos. Intenta de nuevo." }, { status: 400 });
  }

  try {
    const codigo = await leerEmpleadoCodigo(auth.userId);
    if (codigo) await guardarSuscripcion(codigo, suscripcion);
    webpush.setVapidDetails(CONTACTO_VAPID, pub, priv);
    await webpush.sendNotification(
      suscripcion,
      JSON.stringify({ title: TITULO_AVISO_PRUEBA, body: TEXTO_AVISO_PRUEBA, url: "/marcacion" }),
      { TTL: 5 * 60, urgency: "high" },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const codigoHttp = (e as { statusCode?: number }).statusCode;
    console.error("[marcacion probar aviso]", codigoHttp, e instanceof Error ? e.message : e);
    const vencida = codigoHttp === 404 || codigoHttp === 410;
    return NextResponse.json(
      { error: vencida ? "Este teléfono dejó de recibir avisos. Toca «Probar aviso» otra vez." : "No se pudo mandar el aviso. Intenta de nuevo en unos segundos." },
      { status: vencida ? 410 : 502 },
    );
  }
}
