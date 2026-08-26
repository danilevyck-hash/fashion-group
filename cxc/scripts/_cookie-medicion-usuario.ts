// SOLO LECTURA: arma la cookie de sesión reusando UNA sesión de admin activa,
// conservando el NOMBRE REAL del usuario. No escribe nada.
//
// 🩸 POR QUÉ NO ALCANZA `_cookie-medicion-rol.ts`: ese pone
// `userName: "medicion-<rol>"`, y hay endpoints que GRABAN el nombre en la fila
// (el de aprobar descripciones escribe `aprobada_por`). Con el nombre inventado,
// el catálogo del Depurador quedaría firmado por un fantasma. Acá se conserva
// `user_name` de la sesión real, así la auditoría dice quién fue.
//
// 🩸 POR QUÉ NO SE INVENTA UN TOKEN: el middleware valida `sessionToken` contra
// `user_sessions` (revoked=false); una cookie firmada a mano muere ahí y lo que
// se mediría sería la pantalla de LOGIN.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_cookie-medicion-usuario.ts > /tmp/fg-cookie-cat.txt

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await db
    .from("user_sessions")
    .select("session_token, user_name, user_role")
    .eq("revoked", false)
    .eq("user_role", "admin")
    .order("last_seen", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) { console.error("no hay sesión de admin activa:", error?.message); process.exit(1); }
  console.error(`sesión reusada de: ${data.user_name} (${data.user_role})`);
  const body = Buffer.from(JSON.stringify({
    role: data.user_role, userId: "medicion", userName: data.user_name, sessionToken: data.session_token,
  })).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(body).digest("base64url");
  process.stdout.write(`${body}.${sig}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
