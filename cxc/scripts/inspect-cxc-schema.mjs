import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .split("\n").filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1 fila de cxc_rows para ver columnas reales
const { data, error } = await sb.from("cxc_rows").select("*").limit(1).maybeSingle();
if (error) { console.error(error); process.exit(1); }
console.log("Columnas reales de cxc_rows:");
console.log(Object.keys(data ?? {}).sort().join(", "));
console.log("\nFila ejemplo:");
console.log(JSON.stringify(data, null, 2));
