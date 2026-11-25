// El I/O del aviso push de Muestras (25-nov-2026): le manda el aviso al
// vendedor. El aparato lo guarda «Activa los avisos» al entrar (`/api/avisos`). Mismo mecanismo que los recordatorios de
// Marcación (web-push + VAPID, `/api/recordatorios-marcacion`); la tabla es
// `push_suscripciones_usuario` porque Rey y Edwin no tienen ficha de colaborador.
//
// 🔴 NUNCA FALLA HACIA AFUERA: las muestras ya quedaron guardadas. Cualquier
// error se registra y se devuelve 0.
import webpush from "web-push";
import { supabaseServer } from "@/lib/supabase-server";
import { TABLA_SUSCRIPCIONES_USUARIO } from "@/lib/avisos/suscripciones-server";
import type { AvisoDeMuestras } from "./muestras-aviso";

const CONTACTO_VAPID = "mailto:notificaciones@fashiongr.com";

/** Manda el aviso a todos los aparatos de cada usuario. Devuelve cuántos salieron. */
export async function mandarAvisoDeMuestras(aviso: AvisoDeMuestras | null): Promise<number> {
  if (!aviso) return 0;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    console.error("[muestras aviso] faltan las llaves VAPID");
    return 0;
  }
  try {
    const { data, error } = await supabaseServer
      .from(TABLA_SUSCRIPCIONES_USUARIO)
      .select("id, endpoint, p256dh, auth")
      .in("usuario", [...aviso.usuarios]);
    if (error) throw new Error(error.message);
    webpush.setVapidDetails(CONTACTO_VAPID, pub, priv);
    const cuerpo = JSON.stringify({ title: aviso.title, body: aviso.body, url: aviso.url, tag: aviso.tag });
    let enviados = 0;
    for (const s of (data ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, { TTL: 24 * 60 * 60, urgency: "high" });
        enviados += 1;
      } catch (err) {
        const codigoHttp = (err as { statusCode?: number }).statusCode;
        if (codigoHttp === 404 || codigoHttp === 410) {
          await supabaseServer.from(TABLA_SUSCRIPCIONES_USUARIO).delete().eq("id", s.id);
        } else {
          console.error("[muestras aviso] no se pudo mandar:", codigoHttp, err instanceof Error ? err.message : err);
        }
      }
    }
    return enviados;
  } catch (e) {
    console.error("[muestras aviso]", e instanceof Error ? e.message : e);
    return 0;
  }
}
