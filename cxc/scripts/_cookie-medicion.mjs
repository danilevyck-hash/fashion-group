// Toma PRESTADO, solo leyendo, el token de una sesión de admin viva y arma la
// cookie firmada con la que miden los scripts de anchos.
//
//   node scripts/_cookie-medicion.mjs   → escribe /tmp/fg-cookie.txt
//
// 🩸 No alcanza con FIRMAR la cookie: la página valida el `sessionToken` contra
// `user_sessions` y una sesión inventada redirige al login — el medidor mediría
// una pantalla vacía y daría verde sin haber mirado nada.

import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Un reintento: la base está en compute Micro y un blip devuelve vacío, que se
// leería como «no hay ninguna sesión» y mataría la medición por nada.
let viva = null;
for (let i = 0; i < 2 && !viva; i++) {
  const { data } = await sb
    .from("user_sessions")
    .select("session_token, user_name")
    .eq("user_role", "admin")
    .eq("revoked", false)
    .order("last_seen", { ascending: false })
    .limit(5);
  viva = (data ?? []).find((r) => /^medicion/i.test(String(r.user_name))) ?? (data ?? [])[0] ?? null;
  if (!viva && i === 0) await new Promise((r) => setTimeout(r, 2000));
}
if (!viva) throw new Error("No hay ninguna sesión de admin viva de la cual tomar prestado el token");

const body = Buffer.from(
  JSON.stringify({ role: "admin", userId: "medicion", userName: viva.user_name, sessionToken: viva.session_token }),
).toString("base64url");
const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
writeFileSync("/tmp/fg-cookie.txt", `${body}.${sig}`);
console.log(`cookie escrita en /tmp/fg-cookie.txt (prestada de ${viva.user_name})`);
