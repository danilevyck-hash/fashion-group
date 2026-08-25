// SOLO LECTURA: una cookie firmada POR ROL, reusando un session_token VIVO (el
// middleware lo valida contra user_sessions). El rol sale del payload firmado,
// que es lo único que leen requireRole/getSession.
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await db.from("user_sessions")
    .select("session_token, user_name, user_role").eq("revoked", false)
    .order("last_seen", { ascending: false }).limit(1).single();
  if (error || !data) { console.error("no hay sesión viva:", error?.message); process.exit(1); }
  const out: Record<string, string> = {};
  for (const role of ["admin", "secretaria", "vendedor"]) {
    const body = Buffer.from(JSON.stringify({
      role, userId: "medicion-t910", userName: "medicion", sessionToken: data.session_token,
    })).toString("base64url");
    const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(body).digest("base64url");
    out[role] = `${body}.${sig}`;
  }
  process.stdout.write(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); });
