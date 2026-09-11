// Medición SOLO LECTURA contra producción: cuántos colaboradores activos entran
// a los chips de la lista con la regla vieja («Falta configurar» = sin ficha o
// sin salario; «Sin saldo» = sin fecha de ingreso o sin saldo) y con la nueva
// («Falta para pagar» / «Falta completar», `lib/asistencia/que-le-falta.ts`).
//   npx tsx scripts/_medir-falta-configurar.ts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { queLeFalta, contarFaltantes, textoFaltantes, type FichaParaFaltantes } from "../src/lib/asistencia/que-le-falta";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const DIAS = 180;

async function main() {
  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();
  const codigos = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await s.from("asistencia_marcaciones").select("empleado_codigo").gte("ocurrio_en", desde).order("ocurrio_en").order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) if (r.empleado_codigo) codigos.add(String(r.empleado_codigo).trim());
    if (!data || data.length < 1000) break;
  }
  const { data: fichas, error: e1 } = await s.from("asistencia_personas").select("*");
  if (e1) throw e1;
  const { data: horarios, error: e2 } = await s.from("asistencia_horarios").select("empleado_codigo");
  if (e2) throw e2;
  const { data: ign } = await s.from("asistencia_codigos_ignorados").select("empleado_codigo").eq("activo", true);
  const ignorados = new Set((ign ?? []).map((r) => String(r.empleado_codigo)));
  const conHorario = new Set((horarios ?? []).map((r) => String(r.empleado_codigo)));
  const porCodigo = new Map((fichas ?? []).map((f) => [String(f.empleado_codigo), f]));
  for (const f of fichas ?? []) codigos.add(String(f.empleado_codigo));

  const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
  const activos: (FichaParaFaltantes & { codigo: string; nombre: string })[] = [];
  for (const c of [...codigos].sort()) {
    if (ignorados.has(c)) continue;
    const f = porCodigo.get(c);
    if (f && ES_FECHA.test(String(f.fecha_salida ?? ""))) continue; // dado de baja
    activos.push({
      codigo: c,
      nombre: f?.nombre ?? "(sin ficha)",
      configurado: !!f,
      empresa: f?.empresa ?? null,
      servicioProfesional: f?.servicio_profesional === true,
      noMarcaReloj: f?.no_marca_reloj === true,
      salarioMensual: f && f.salario_mensual !== null ? Number(f.salario_mensual) : null,
      tieneHorario: conHorario.has(c),
      posicion: f?.posicion ?? null,
      cedula: f?.cedula ?? null,
      fechaIngreso: f?.fecha_ingreso ?? null,
      saldoVacacionesDias: f && f.saldo_vacaciones_dias !== null ? Number(f.saldo_vacaciones_dias) : null,
      saldoVacacionesCorte: f?.saldo_vacaciones_corte ?? null,
    });
  }

  const viejoConfigurar = activos.filter((p) => !p.configurado || (p.servicioProfesional !== true && p.salarioMensual === null)).length;
  const viejoSinSaldo = activos.filter((p) => !p.fechaIngreso || p.saldoVacacionesDias === null).length;
  const nuevo = contarFaltantes(activos);
  console.log(`activos: ${activos.length} (fichas ${fichas?.length}, códigos con marca ${codigos.size}, ignorados ${ignorados.size})`);
  console.log(`ANTES  · Falta configurar (${viejoConfigurar}) · Sin saldo (${viejoSinSaldo})`);
  console.log(`DESPUÉS · Falta para pagar (${nuevo.paraPagar}) · Falta completar (${nuevo.completar})`);
  const enLosDos = activos.filter((p) => { const f = queLeFalta(p); return f.paraPagar.length && f.completar.length; }).length;
  console.log(`en los dos: ${enLosDos}`);
  const porFaltante: Record<string, number> = {};
  for (const p of activos) for (const k of [...queLeFalta(p).paraPagar, ...queLeFalta(p).completar]) porFaltante[k] = (porFaltante[k] ?? 0) + 1;
  console.log("por faltante:", porFaltante);
  console.log("--- detalle (solo quienes tienen algo que falta):");
  for (const p of activos) { const t = textoFaltantes(queLeFalta(p)); if (t) console.log(`${p.codigo.padStart(3)} ${p.nombre.padEnd(28)} ${t}`); }
}
main().catch((e) => { console.error(e); process.exit(1); });
