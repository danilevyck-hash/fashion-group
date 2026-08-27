/* Solo lectura. Qué le paga HOY la planilla a JULIO GARAY (código 11), con el
 * motor tal cual está, contra los datos de producción.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-julio-hoy.ts
 */

import { createClient } from "@supabase/supabase-js";
import { reglasDesdeFila } from "@/lib/asistencia/config";
import { leerVacaciones, leerJustificaciones } from "@/lib/asistencia/config-server";
import { armarReporte, type HorarioPersona } from "@/lib/asistencia/reporte";
import { leerAprobaciones } from "@/lib/asistencia/aprobaciones-server";
import { indexarAprobaciones, estaAprobado } from "@/lib/asistencia/aprobaciones";
import {
  armarPlanilla, jornadaDiariaMin, quincenaDesdeClave, totalizar,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const PANAMA = "-05:00";
const instante = (dia: string, fin: boolean) =>
  new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

const QUINCENAS = ["2026-07-1", "2026-07-2", "2026-08-1", "2026-08-2"];
const EMPRESAS = ["confecciones_boston", "vistana", "fashion_wear"];
const JULIO = "11";

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

const d2 = (n: number) => n.toFixed(2).padStart(9);

async function main() {
  const { data: filaReglas } = await db.from("asistencia_reglas").select("*").eq("id", 1).maybeSingle();
  const reglas = reglasDesdeFila(filaReglas as Record<string, unknown> | null);
  console.log(`divisor 40h = ${(reglas as any).horasMes40} · divisor 48h = ${(reglas as any).horasMes48}`);
  console.log(`seguro social ${reglas.seguroSocialPct}% · educativo ${reglas.seguroEducativoPct}%`);

  const personas = await todo<any>("asistencia_personas", (q) =>
    q.select("empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa, fecha_ingreso, fecha_salida, servicio_profesional, paga_seguros, no_marca_reloj, seguros_base_quincena"));
  const horariosRaw = await todo<any>("asistencia_horarios", (q) =>
    q.select("empleado_codigo, entrada, salida, almuerzo_minutos"));
  const horarios: HorarioPersona[] = horariosRaw.map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  })) as HorarioPersona[];
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));

  for (const clave of QUINCENAS) {
    const q = quincenaDesdeClave(clave)!;
    const marcaciones = await todo<any>("asistencia_marcaciones", (x) =>
      x.select("empleado_codigo, empleado_nombre, ocurrio_en")
        .gte("ocurrio_en", instante(q.desde, false)).lte("ocurrio_en", instante(q.hasta, true))
        .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }));
    const { filas: just } = await leerJustificaciones(q.desde, q.hasta);
    const { filas: vacs } = await leerVacaciones(q.desde, q.hasta);
    const apr = await leerAprobaciones(q.desde, q.hasta);
    const { data: fer } = await db.from("asistencia_feriados")
      .select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta);
    const feriados = new Map((fer ?? []).map((f: any) => [String(f.fecha), String(f.nombre)]));

    const manuales = new Map<string, any>();
    {
      const { data } = await db.from("asistencia_planilla_manual")
        .select("empleado_codigo, isr, prestamo, terceros, mercancia, otros_servicios").eq("quincena", q.clave);
      for (const m of (data ?? []) as any[]) {
        manuales.set(String(m.empleado_codigo), {
          isr: Number(m.isr ?? 0), prestamo: Number(m.prestamo ?? 0), terceros: Number(m.terceros ?? 0),
          mercancia: Number(m.mercancia ?? 0), otrosServicios: Number(m.otros_servicios ?? 0),
        });
      }
    }

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
        codigo: cod, nombre: p.nombre ?? null,
        salarioMensual: p.salario_mensual === null ? null : Number(p.salario_mensual),
        jornadaSemanal: p.jornada_semanal ?? null, empresa: p.empresa ?? null,
        servicioProfesional: p.servicio_profesional === true,
        pagaSeguros: p.paga_seguros !== false,
        baseSeguros: p.seguros_base_quincena == null ? null : Number(p.seguros_base_quincena),
        noMarcaReloj: p.no_marca_reloj === true,
      });
    }
    const nombres = new Map<string, string>();
    for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);

    const reporte = armarReporte({
      marcaciones, horarios, justificaciones: just, vacaciones: vacs, feriados,
      desde: q.desde, hasta: q.hasta, reglas, nombres, incluirNoHabiles: true,
    } as any).filter((p) => !fuera.has(p.codigo));

    const aprobaciones = indexarAprobaciones(apr.filas);
    const dias = new Set<string>();
    for (const [k, a] of aprobaciones) if (estaAprobado(a)) dias.add(k);

    // 🔑 DOS ESTADOS DE APROBACIÓN. Hoy la tabla existe y está VACÍA, o sea que
    // la planilla real paga $0 de extras a todo el mundo. Los números del
    // encargo se midieron con los extras PAGADOS. Se miran los dos.
    const EXIGIR = process.env.EXIGIR === "0" ? false : !apr.faltaTabla;
    console.log(`\n══ ${clave} (${q.desde} → ${q.hasta}) · exigirAprobacion=${EXIGIR} días aprobados=${dias.size}`);
    for (const empresa of EMPRESAS) {
      const lineas = armarPlanilla({
        personas: reporte, fichas, manuales, reglas, empresa,
        jornadaDiariaMin: (c: string) => jornadaDiariaMin(horarioDe.get(c)),
        exigirAprobacionExtra: EXIGIR, diasExtraAprobados: dias,
      });
      const t = totalizar(lineas);
      console.log(`  ${empresa.padEnd(20)} líneas=${String(lineas.length).padStart(3)} bruto=${d2(t.totalBruto)} neto=${d2(t.netoPagar)}`);
      const j = lineas.find((l) => l.codigo === JULIO);
      if (j) {
        console.log(`    JULIO ficha: salario=${j.salarioMensual} jornada=${j.jornadaSemanal} pagaSeguros=${j.pagaSeguros}`);
        console.log(`    JULIO horas: extraD=${j.horas.extraDiurnoMin} extraN=${j.horas.extraNocturnoMin} exced=${j.horas.excedenteMin} dom=${j.horas.domingoMin} fer=${j.horas.feriadoMin} tard=${j.horas.tardanzaMin} aus=${j.horas.ausenciaMin} vac=${j.horas.vacacionesYaPagadasMin} noApr=${j.horas.extraNoAprobadaMin}`);
        console.log(`    JULIO manuales: ${JSON.stringify(j.manuales)}`);
        if (j.dinero) {
          const d = j.dinero;
          console.log(`    JULIO dinero: rata=${d.rataHora} quinc=${d.salarioQuincenal} exD=${d.extraDiurno} exN=${d.extraNocturno} exc=${d.excedente} dom=${d.domingos} fer=${d.feriados} aus=${d.ausencias} tard=${d.tardanzas}`);
          console.log(`                  BRUTO=${d.totalBruto} ss=${d.seguroSocial} se=${d.seguroEducativo} ded=${d.totalDeducciones} otros=${d.otrosServicios} NETO=${d.netoPagar}`);
        } else {
          console.log(`    JULIO sin dinero · falta=${j.faltaConfigurar.join(" · ")} · decidir=${j.decidirAMano}`);
        }
      }
    }
  }
}

void main().catch((e) => { console.error(e); process.exitCode = 1; });
