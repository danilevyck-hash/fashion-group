/* ─────────────────────────────────────────────────────────────────────────────
 * ¿CUÁNTO DESCUENTA LA PLANILLA POR DÍAS QUE TODAVÍA NO PASARON? — solo lectura.
 *
 * Corre el motor REAL (el del repo, tal como está) sobre los datos de
 * producción y responde tres preguntas, cada una con su número al centavo:
 *
 *   1. Cuánto suma la columna «ausencias» de la quincena en curso.
 *   2. Cuánto de eso sale de días que TODAVÍA NO TERMINARON (hoy y los que
 *      siguen), en hora PANAMÁ.
 *   3. A quién le pasa, persona por persona.
 *
 * ⚠️ NO ESCRIBE NADA.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_diag-planilla-dias-que-no-pasaron.ts [YYYY-MM-D] [YYYY-MM-DD hoy]
 * ────────────────────────────────────────────────────────────────────────── */

import { createClient } from "@supabase/supabase-js";

import { armarReporte } from "@/lib/asistencia/reporte";
import { reglasDesdeFila } from "@/lib/asistencia/config";
import {
  armarPlanilla,
  jornadaDiariaMin,
  quincenaDesdeClave,
  totalizar,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { hoyPanama } from "@/lib/fecha-panama";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const PANAMA = "-05:00";
const instante = (dia: string, fin: boolean) =>
  new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

const CLAVE = process.argv[2] ?? "2026-08-1";
const HOY = process.argv[3] ?? hoyPanama();
const EMPRESAS = ["confecciones_boston", "vistana", "fashion_wear"];

async function todo<T>(tabla: string, arma: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await arma(db.from(tabla)).range(from, from + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const money = (n: number) => `$${n.toFixed(2)}`;

async function main() {
  const q = quincenaDesdeClave(CLAVE)!;
  console.log(`Quincena ${q.etiqueta}  (${q.desde} → ${q.hasta})`);
  console.log(`Hoy en PANAMÁ: ${HOY}\n`);

  const { data: filaReglas } = await db.from("asistencia_reglas").select("*").eq("id", 1).maybeSingle();
  const reglas = reglasDesdeFila(filaReglas as Record<string, unknown> | null);

  const personas = await todo<any>("asistencia_personas", (x) =>
    x.select("empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa, fecha_ingreso, fecha_salida, motivo_salida, servicio_profesional"));
  const horariosRaw = await todo<any>("asistencia_horarios", (x) =>
    x.select("empleado_codigo, entrada, salida, almuerzo_minutos"));
  const horarios = horariosRaw.map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  }));
  const marcaciones = await todo<any>("asistencia_marcaciones", (x) =>
    x.select("id, empleado_codigo, empleado_nombre, ocurrio_en")
      .gte("ocurrio_en", instante(q.desde, false))
      .lte("ocurrio_en", instante(q.hasta, true))
      .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }));
  const { data: just } = await db.from("asistencia_justificaciones")
    .select("empleado_codigo, desde, hasta, motivo").lte("desde", q.hasta).gte("hasta", q.desde);
  const { data: fer } = await db.from("asistencia_feriados")
    .select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta);
  const feriados = new Map((fer ?? []).map((f: any) => [String(f.fecha), String(f.nombre)]));

  console.log(`Fichas: ${personas.length} · marcaciones en la quincena: ${marcaciones.length}`);
  console.log(`Fichas SIN fecha_ingreso: ${personas.filter((p) => !p.fecha_ingreso).length}`);
  console.log("Justificaciones que tocan la quincena:");
  for (const j of (just ?? []) as any[]) {
    console.log(`   ${j.empleado_codigo}  ${j.motivo}  ${j.desde} → ${j.hasta}`);
  }
  console.log("Fichas CON fecha_ingreso dentro de la quincena:");
  for (const p of personas) {
    if (p.fecha_ingreso && String(p.fecha_ingreso) > q.desde && String(p.fecha_ingreso) <= q.hasta) {
      console.log(`   ${p.empleado_codigo}  ${p.nombre}  ingreso ${p.fecha_ingreso}  empresa ${p.empresa}`);
    }
    if (p.fecha_salida && String(p.fecha_salida) >= q.desde && String(p.fecha_salida) < q.hasta) {
      console.log(`   ${p.empleado_codigo}  ${p.nombre}  SALIDA ${p.fecha_salida}  empresa ${p.empresa}`);
    }
  }
  console.log("");

  const fuera = new Set<string>();
  for (const p of personas) {
    const s = p.fecha_salida ? String(p.fecha_salida) : null;
    const i = p.fecha_ingreso ? String(p.fecha_ingreso) : null;
    if ((s && s < q.desde) || (i && i > q.hasta)) fuera.add(String(p.empleado_codigo));
  }
  const fichas = new Map<string, FichaPlanilla>();
  for (const p of personas) {
    const cod = String(p.empleado_codigo);
    if (fuera.has(cod)) continue;
    fichas.set(cod, {
      codigo: cod,
      nombre: p.nombre ?? null,
      salarioMensual: p.salario_mensual === null ? null : Number(p.salario_mensual),
      jornadaSemanal: p.jornada_semanal ?? null,
      empresa: p.empresa ?? null,
      servicioProfesional: p.servicio_profesional === true,
    });
  }
  const nombres = new Map<string, string>();
  for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));

  const base = {
    marcaciones, horarios, justificaciones: (just ?? []) as any, feriados,
    desde: q.desde, hasta: q.hasta, reglas, nombres, incluirNoHabiles: true,
  };
  // HOY: el motor tal como está en el repo (sin `diaEnCurso`).
  const conTodo = armarReporte(base as any).filter((p) => !fuera.has(p.codigo));
  // CONTRAFACTUAL: los días que no pasaron no se juzgan.
  const sinFuturo = armarReporte({ ...base, diaEnCurso: HOY } as any).filter((p) => !fuera.has(p.codigo));

  let ausA = 0;
  let ausB = 0;
  let netoA = 0;
  let netoB = 0;
  const filas: Array<{ etiqueta: string; empresa: string; dAus: number; dNeto: number; dias: string[] }> = [];

  for (const empresa of EMPRESAS) {
    const opts = {
      fichas, manuales: new Map(),
      jornadaDiariaMin: (c: string) => jornadaDiariaMin(horarioDe.get(c) as any),
      reglas, empresa,
    };
    const a = armarPlanilla({ ...opts, personas: conTodo } as any);
    const b = armarPlanilla({ ...opts, personas: sinFuturo } as any);
    const ta = totalizar(a);
    const tb = totalizar(b);
    ausA += ta.ausencias; ausB += tb.ausencias;
    netoA += ta.netoPagar; netoB += tb.netoPagar;
    console.log(
      `${empresa.padEnd(20)} ausencias ${money(ta.ausencias).padStart(10)} → ${money(tb.ausencias).padStart(10)}`
      + `   neto ${money(ta.netoPagar).padStart(11)} → ${money(tb.netoPagar).padStart(11)}`,
    );
    const porCodigo = new Map(b.map((l) => [l.codigo, l]));
    for (const x of a) {
      const y = porCodigo.get(x.codigo);
      if (!y) continue;
      const dAus = (y.dinero?.ausencias ?? 0) - (x.dinero?.ausencias ?? 0);
      const dNeto = (y.dinero?.netoPagar ?? 0) - (x.dinero?.netoPagar ?? 0);
      if (dAus === 0 && dNeto === 0) continue;
      const p = conTodo.find((z) => z.codigo === x.codigo);
      const dias = (p?.dias ?? []).filter((d: any) => d.ausente && d.fecha >= HOY).map((d: any) => d.fecha);
      filas.push({ etiqueta: `${x.etiqueta} (${x.codigo})`, empresa, dAus, dNeto, dias });
    }
  }

  console.log(`\nTOTAL ausencias  ${money(ausA)} → ${money(ausB)}   (falsas: ${money(ausA - ausB)})`);
  console.log(`TOTAL neto       ${money(netoA)} → ${money(netoB)}\n`);

  console.log("── PERSONA POR PERSONA ──");
  for (const f of filas.sort((x, y) => y.dAus - x.dAus)) {
    console.log(
      `${f.etiqueta.slice(0, 34).padEnd(35)} ${f.empresa.padEnd(20)} `
      + `ausencia ${money(-f.dAus).padStart(8)} de menos · neto +${money(f.dNeto).padStart(8)} · días ${f.dias.join(",")}`,
    );
  }
  console.log(`\n${filas.length} líneas cambian.`);
}

void main().catch((e) => { console.error(e); process.exitCode = 1; });
