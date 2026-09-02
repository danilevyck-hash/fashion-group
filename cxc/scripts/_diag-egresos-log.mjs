/**
 * SOLO LECTURA — qué le pasó al sync de EGRESOS VARIOS, empresa por empresa.
 *
 * Lee `switch_sync_log` y muestra estado, renglones escritos, descartes y el
 * mensaje de error de cada corrida. No escribe nada y no toca Switch.
 *
 * 🩸 ES LA HERRAMIENTA CON LA QUE SE DIAGNOSTICÓ LA 2ª OLA (2-sep-2026). El
 * `error_message` guarda el motivo del PRIMER renglón que no se pudo leer, y
 * ese motivo trae la celda entera verbatim: de ahí salió el formato nuevo
 * (`"6.03.98.00.00 - GASTO DE TARJETA DE CREDITO"`) sin abrir una sola sesión
 * web en Switch — que es lo que expulsa a Daniel del panel.
 *
 *   node scripts/_diag-egresos-log.mjs [desde=2026-08-20]
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(raiz, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ]),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const desde = process.argv[2] ?? "2026-08-20";

const { data, error } = await sb
  .from("switch_sync_log")
  .select("empresa_key,status,started_at,records_inserted,records_skipped,skip_details,error_message")
  .eq("sync_type", "egresos_varios")
  .gte("started_at", desde)
  .order("started_at", { ascending: false })
  .limit(200);

if (error) {
  console.error("no pude leer switch_sync_log:", error.message);
  process.exit(1);
}

for (const r of data) {
  const det = Array.isArray(r.skip_details) ? r.skip_details.length : r.skip_details == null ? 0 : "?";
  console.log(
    `${r.started_at.slice(0, 16)} ${r.empresa_key.padEnd(22)} ${String(r.status).padEnd(8)} ` +
      `ins=${r.records_inserted} skip=${r.records_skipped} detalle=${det}`,
  );
  if (r.error_message) console.log(`      ↳ ${r.error_message}`);
  if (Array.isArray(r.skip_details)) {
    for (const d of r.skip_details.slice(0, 5)) {
      console.log(`      · ${d.campo} ${d.secuencial}: ${JSON.stringify(d.valorCrudo)}`);
    }
  }
}
