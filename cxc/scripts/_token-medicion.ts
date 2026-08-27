// SOLO LECTURA: imprime el `session_token` de una sesión de admin YA ACTIVA,
// para las mediciones en el navegador. No crea ni toca una sola fila.
//
// 🩸 POR QUÉ SE TOMA PRESTADO: el middleware valida el token contra
// `user_sessions` (revoked=false), así que uno inventado muere ahí y lo que se
// mediría sería la pantalla de LOGIN — verde sin haber mirado nada. El ROL que
// se quiere medir se firma encima, en el payload de la cookie.
import { createClient } from "@supabase/supabase-js";

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await db
    .from("user_sessions")
    .select("session_token")
    .eq("revoked", false)
    .eq("user_role", "admin")
    .order("last_seen", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) {
    console.error("no hay sesión de admin activa:", error?.message);
    process.exit(1);
  }
  process.stdout.write(data.session_token);
}

main().catch((e) => { console.error(e); process.exit(1); });
