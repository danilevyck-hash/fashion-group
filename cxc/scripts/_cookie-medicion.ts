// SOLO LECTURA: arma la cookie de sesión para las mediciones en el navegador,
// reusando una sesión de admin YA ACTIVA (el middleware valida el token contra
// `user_sessions`). No escribe nada.
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_cookie-medicion.ts > /tmp/fg-cookie.txt
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
const body = Buffer.from(JSON.stringify({
  role: data.user_role, userId: "medicion", userName: data.user_name, sessionToken: data.session_token,
})).toString("base64url");
const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(body).digest("base64url");
process.stdout.write(`${body}.${sig}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
