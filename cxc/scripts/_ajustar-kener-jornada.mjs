// 🔴 ESCRIBE EN PRODUCCIÓN — aprobado por Daniel (10-sep-2026): «kener 40h».
// Kener Hernández (código 17) tenía jornada 48 h y la contable le paga con 40
// (rata 600 ÷ 173,33 = $3,46, no $2,88). Cambia SOLO `jornada_semanal` de esa
// ficha, y solo si sigue en 48. Idempotente.
//   node scripts/_ajustar-kener-jornada.mjs            (muestra)
//   node scripts/_ajustar-kener-jornada.mjs --escribir (escribe)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CODIGO = "17";
const { data: antes, error } = await s.from("asistencia_personas").select("empleado_codigo, nombre, jornada_semanal, empresa").eq("empleado_codigo", CODIGO).maybeSingle();
if (error) throw error;
console.log("antes:", antes);
if (!antes) throw new Error("no existe la ficha 17");
if (antes.jornada_semanal === 40) { console.log("ya está en 40 h: nada que hacer"); process.exit(0); }
if (!process.argv.includes("--escribir")) { console.log("(sin --escribir no se toca nada) → pasaría a 40"); process.exit(0); }
const { error: e2 } = await s.from("asistencia_personas").update({ jornada_semanal: 40 }).eq("empleado_codigo", CODIGO).eq("jornada_semanal", 48);
if (e2) throw e2;
const { data: despues } = await s.from("asistencia_personas").select("empleado_codigo, nombre, jornada_semanal").eq("empleado_codigo", CODIGO).maybeSingle();
console.log("después:", despues);
