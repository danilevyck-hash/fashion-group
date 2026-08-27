// SOLO LECTURA: arma la cookie de sesión de UN ROL para las mediciones en el
// navegador. No escribe nada.
//
// 🩸 POR QUÉ NO SE INVENTA UN TOKEN: el middleware valida `sessionToken` contra
// `user_sessions` (revoked=false) y una cookie firmada a mano muere ahí — lo que
// se mediría sería la pantalla de LOGIN, y la medición daría verde sin haber
// mirado nada. Así que se REUSA el token de una sesión de admin ya activa y solo
// se cambia el `role` del payload, que es lo que leen `getSession`/`requireRole`
// y lo que decide los 200/403. Ni una fila se crea, ni una se toca.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_cookie-medicion-rol.ts bodega > /tmp/fg-cookie-bodega.txt
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const ROL = process.argv[2];
const ROLES = ["admin", "secretaria", "vendedor", "bodega", "contabilidad", "gerente_acs", "gerente_boston"];
if (!ROL || !ROLES.includes(ROL)) {
  console.error(`uso: _cookie-medicion-rol.ts <${ROLES.join("|")}>`);
  process.exit(1);
}

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
  const body = Buffer.from(JSON.stringify({
    role: ROL, userId: "medicion", userName: `medicion-${ROL}`, sessionToken: data.session_token,
  })).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(body).digest("base64url");
  process.stdout.write(`${body}.${sig}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
