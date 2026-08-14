/**
 * Crea una sesión de MEDICIÓN y escribe la cookie firmada en /tmp/fg-cookie.txt.
 *
 * ⚠️ ESCRIBE UNA FILA en `user_sessions` (y solo eso). Es el mismo mecanismo que
 * usa el login; la sesión se revoca sola con el cron de limpieza. Con
 * `--revocar` se marca revocada al terminar de medir.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_mint-cookie-medicion.ts [--revocar]
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { supabaseServer } from "../src/lib/supabase-server";
import { signSession } from "../src/lib/session-cookie";

const USUARIO = "medicion-t203b";

async function main() {
  const sb = supabaseServer;

  if (process.argv.includes("--revocar")) {
    const { error } = await sb.from("user_sessions").update({ revoked: true }).eq("user_name", USUARIO);
    console.log(error ? `ERROR: ${error.message}` : "sesiones de medición revocadas");
    return;
  }

  const token = randomUUID();
  const { error } = await sb.from("user_sessions").insert({
    user_name: USUARIO,
    user_role: "admin",
    session_token: token,
    ip_address: "127.0.0.1",
    last_seen: new Date().toISOString(),
  });
  if (error) throw new Error(`no pude crear la sesión: ${error.message}`);

  const cookie = signSession({
    role: "admin",
    userId: USUARIO,
    userName: USUARIO,
    sessionToken: token,
  });
  writeFileSync("/tmp/fg-cookie.txt", cookie);
  console.log(`cookie escrita en /tmp/fg-cookie.txt (${cookie.length} chars)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
