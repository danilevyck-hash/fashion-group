// Runner mínimo de SQL por la Management API (proyecto rspocgqhtpveytgbtler).
// Uso: SQL="select 1" node scripts/_sql-boston-catalogos.mjs
//      node scripts/_sql-boston-catalogos.mjs supabase/migrations/xxx.sql
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = "rspocgqhtpveytgbtler";
const query = process.env.SQL || readFileSync(process.argv[2], "utf8");

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const t = await r.text();
console.log(r.status, t.slice(0, 6000));
if (!r.ok) process.exit(1);
