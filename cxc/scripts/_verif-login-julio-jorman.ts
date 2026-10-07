// Verificación (solo lectura): repite EXACTAMENTE lo que hace POST /api/auth.
import bcrypt from "bcryptjs";
import { supabaseServer } from "../src/lib/supabase-server";

function isHash(s: string): boolean { return s.startsWith("$2a$") || s.startsWith("$2b$"); }

async function main() {
  const { data: users } = await supabaseServer
    .from("fg_users").select("id, name, role, password, active").eq("active", true);
  for (const password of ["julio", "jorman", "Julio", "JORMAN"]) {
    const matches: string[] = [];
    for (const u of users!) {
      if (!isHash(u.password)) continue;
      if (await bcrypt.compare(password, u.password) || await bcrypt.compare(password.toLowerCase(), u.password)) {
        matches.push(`${u.name} (${u.role})`);
      }
    }
    const veredicto = matches.length === 1 ? "ENTRA ✓" : matches.length === 0 ? "RECHAZADA ✗" : "AMBIGUA ✗";
    console.log(`  "${password}" → ${veredicto}  ${matches.join(" + ") || "(sin match)"}`);
  }
  console.log("\nSin hash (no pueden entrar):", users!.filter(u => !isHash(u.password)).map(u => u.name).join(", ") || "ninguno");
}
main().catch((e) => { console.error(e); process.exit(1); });
