// Los aparatos suscritos a avisos push POR USUARIO (25-nov-2026). Tabla
// `push_suscripciones_usuario` (migración `20270125120000`). RLS sin políticas:
// solo el servidor.
import { supabaseServer } from "@/lib/supabase-server";
import type { SuscripcionPush } from "@/lib/marcacion/recordatorios-server";

export const TABLA_SUSCRIPCIONES_USUARIO = "push_suscripciones_usuario";

/** El usuario tal como se guarda: `fg_users.name` en minúscula. */
export const usuarioDeAviso = (nombre: string | null | undefined): string => (nombre ?? "").trim().toLowerCase();

/** Un aparato = una fila por `endpoint`; si cambia de dueño, queda con el último. */
export async function guardarSuscripcionDeUsuario(usuario: string, s: SuscripcionPush): Promise<void> {
  const u = usuarioDeAviso(usuario);
  if (!u) throw new Error("sin usuario");
  const { error } = await supabaseServer.from(TABLA_SUSCRIPCIONES_USUARIO).upsert(
    { usuario: u, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, actualizado_en: new Date().toISOString() },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);
}
