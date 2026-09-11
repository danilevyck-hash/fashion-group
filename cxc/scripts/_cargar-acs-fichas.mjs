// 🔴 ESCRIBE EN PRODUCCIÓN — la única excepción, aprobada por Daniel (10-sep-2026):
// *«a los de multifashion que te mandé la foto configúralos»*.
//
// Carga las 5 fichas de Multifashion (`asistencia_personas`, empresa
// `american_classic`, salario NULL: lo llena la contable) y su horario
// (`asistencia_horarios`: 10:00 → 19:00, almuerzo 60 = `ALMUERZO_POR_EMPRESA`).
// IDEMPOTENTE: no pisa una ficha ni un horario que ya exista. No toca a nadie más.
//   node scripts/_cargar-acs-fichas.mjs            (muestra qué haría)
//   node scripts/_cargar-acs-fichas.mjs --escribir (escribe)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ESCRIBIR = process.argv.includes("--escribir");

const LOS_CINCO = [
  ["301", "Jenifer Miranda"],
  ["302", "Milagros Torres"],
  ["303", "Jailine Quispe"],
  ["304", "Sheynee Batista"],
  ["305", "Angel Pizza"],
];
const EMPRESA = "american_classic";
const HORARIO = { entrada: "10:00", salida: "19:00", almuerzo_minutos: 60 };

async function main() {
  const codigos = LOS_CINCO.map(([c]) => c);
  const { data: fichas, error: e1 } = await s.from("asistencia_personas").select("empleado_codigo, nombre, empresa").in("empleado_codigo", codigos);
  if (e1) throw e1;
  const { data: horarios, error: e2 } = await s.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos").in("empleado_codigo", codigos);
  if (e2) throw e2;
  const tieneFicha = new Set((fichas ?? []).map((f) => String(f.empleado_codigo)));
  const tieneHorario = new Set((horarios ?? []).map((h) => String(h.empleado_codigo)));

  const fichasNuevas = LOS_CINCO.filter(([c]) => !tieneFicha.has(c)).map(([c, n]) => ({
    empleado_codigo: c, nombre: n, empresa: EMPRESA, salario_mensual: null,
  }));
  const horariosNuevos = LOS_CINCO.filter(([c]) => !tieneHorario.has(c)).map(([c, n]) => ({
    empleado_codigo: c, empleado_nombre: n, ...HORARIO,
  }));
  console.log(`fichas que ya existen: ${[...tieneFicha].join(", ") || "ninguna"} · horarios que ya existen: ${[...tieneHorario].join(", ") || "ninguno"}`);
  console.log(`a crear: ${fichasNuevas.length} fichas (${fichasNuevas.map((f) => f.empleado_codigo).join(", ") || "—"}) · ${horariosNuevos.length} horarios (${horariosNuevos.map((h) => h.empleado_codigo).join(", ") || "—"})`);
  if (!ESCRIBIR) { console.log("(sin --escribir no se toca nada)"); return; }

  if (fichasNuevas.length) {
    const { error } = await s.from("asistencia_personas").insert(fichasNuevas);
    if (error) throw error;
    console.log(`✓ ${fichasNuevas.length} fichas creadas`);
  }
  if (horariosNuevos.length) {
    const { error } = await s.from("asistencia_horarios").insert(horariosNuevos);
    if (error) throw error;
    console.log(`✓ ${horariosNuevos.length} horarios creados`);
  }
  const { data: despues } = await s.from("asistencia_personas").select("empleado_codigo, nombre, empresa, salario_mensual").in("empleado_codigo", codigos).order("empleado_codigo");
  const { data: hDespues } = await s.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos").in("empleado_codigo", codigos).order("empleado_codigo");
  console.log("fichas:", despues);
  console.log("horarios:", hDespues);
}
main().catch((e) => { console.error(e); process.exit(1); });
