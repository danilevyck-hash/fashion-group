/* ─────────────────────────────────────────────────────────────────────────────
 * ¿LA REGLA DE DANIEL DA LO MISMO QUE LA QUINCENA DE HOY? — solo lectura.
 *
 * Daniel, textual (13-ago-2026), respondiendo cómo se prorratea un sueldo
 * mensual si alguien trabaja del 5 al 20:
 *   *"8 horas por dias por los total de dia trabajado"*
 *
 * O sea:  pago = rata por hora × 8 × días trabajados.
 *
 * Este script NO decide nada: mide. Contesta las dos preguntas que hay que
 * contestar ANTES de tocar el cálculo:
 *
 *   1. 🔴 ¿UNA QUINCENA COMPLETA SIGUE DANDO LO MISMO? Hoy el quincenal es
 *      `salario ÷ 2` fijo. Con la regla de Daniel sería `rata × 8 × días`, y eso
 *      solo coincide si los días de la quincena son exactamente `divisor ÷ 16`.
 *      Para 48 h/semana el divisor es 208 = 26 días × 8 h → 13 días por
 *      quincena. Para 40 h/semana es 173,33 = 21,67 días × 8 h → 10,83 días,
 *      que NO es un número entero de días.
 *
 *   2. ⚠️ ¿QUÉ ES "DÍAS TRABAJADOS"? Tres definiciones posibles, y cada una
 *      paga distinto. Se miden las tres contra lo que se paga hoy.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_medir-prorrateo-daniel.ts
 * ────────────────────────────────────────────────────────────────────────── */

import { createClient } from "@supabase/supabase-js";
import { armarReporte, esHabil, type Marcacion } from "@/lib/asistencia/reporte";
import { centavos, quincenaDesdeClave } from "@/lib/asistencia/planilla";
import { divisorDe, reglasDesdeFila } from "@/lib/asistencia/config";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const PANAMA = "-05:00";
const instante = (dia: string, fin: boolean) =>
  new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

const QUINCENAS = ["2026-07-1", "2026-07-2", "2026-08-1"];

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

const $ = (n: number) => `$${n.toFixed(2)}`;

async function main() {
  const { data: filaReglas } = await db.from("asistencia_reglas").select("*").eq("id", 1).maybeSingle();
  const reglas = reglasDesdeFila(filaReglas as Record<string, unknown> | null);
  console.log(`Divisores en producción: 40 h → ${reglas.divisor40} · 48 h → ${reglas.divisor48}`);
  console.log(`  ⇒ días de 8 h que "caben" en un mes: ${(reglas.divisor40 / 8).toFixed(4)} (40 h) · ${(reglas.divisor48 / 8).toFixed(4)} (48 h)`);
  console.log(`  ⇒ y en media quincena: ${(reglas.divisor40 / 16).toFixed(4)} · ${(reglas.divisor48 / 16).toFixed(4)}\n`);

  const personas = await todo<any>("asistencia_personas", (q) =>
    q.select("empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa, fecha_salida"));
  const jornadas = new Map<number, number>();
  for (const p of personas) {
    if (p.fecha_salida) continue;
    const j = Number(p.jornada_semanal);
    jornadas.set(j, (jornadas.get(j) ?? 0) + 1);
  }
  console.log(`Jornadas de los activos: ${[...jornadas].map(([j, n]) => `${j} h → ${n} personas`).join(" · ")}\n`);

  const horariosRaw = await todo<any>("asistencia_horarios", (q) =>
    q.select("empleado_codigo, entrada, salida, almuerzo_minutos"));
  const horarios = horariosRaw.map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  }));

  for (const clave of QUINCENAS) {
    const q = quincenaDesdeClave(clave)!;
    const marcaciones = await todo<Marcacion>("asistencia_marcaciones", (x) =>
      x.select("empleado_codigo, empleado_nombre, ocurrio_en")
        .gte("ocurrio_en", instante(q.desde, false))
        .lte("ocurrio_en", instante(q.hasta, true))
        .order("ocurrio_en", { ascending: true })
        .order("id", { ascending: true }));
    const { data: just } = await db.from("asistencia_justificaciones")
      .select("empleado_codigo, desde, hasta, motivo").lte("desde", q.hasta).gte("hasta", q.desde);
    const { data: fer } = await db.from("asistencia_feriados")
      .select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta);
    const feriados = new Map((fer ?? []).map((f: any) => [String(f.fecha), String(f.nombre)]));

    // Días hábiles del rango (lun-vie), y cuántos son feriado.
    let habiles = 0;
    let feriadosHabiles = 0;
    for (let d = new Date(`${q.desde}T12:00:00Z`); d <= new Date(`${q.hasta}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (!esHabil(iso)) continue;
      habiles += 1;
      if (feriados.has(iso)) feriadosHabiles += 1;
    }

    const reporte = armarReporte({
      marcaciones, horarios, justificaciones: (just ?? []) as any, feriados,
      desde: q.desde, hasta: q.hasta, reglas, incluirNoHabiles: true,
    });
    const porCodigo = new Map(reporte.map((p) => [p.codigo, p]));

    console.log(`══ ${q.etiqueta} · ${habiles} días hábiles (${feriadosHabiles} feriado) ══`);
    console.log(
      "persona                        jorn  hoy(S/2)   A:díasMarca  B:hábiles−ausen  C:hábiles     Δ A      Δ B",
    );

    const suma = { hoy: 0, a: 0, b: 0, c: 0 };
    for (const p of personas) {
      if (p.fecha_salida) continue;
      const salario = p.salario_mensual === null ? null : Number(p.salario_mensual);
      if (salario === null || !(salario > 0)) continue;
      const jornada = Number(p.jornada_semanal);
      const divisor = divisorDe(jornada, reglas);
      if (divisor === null) continue;
      const rata = centavos(salario / divisor);

      const r = porCodigo.get(String(p.empleado_codigo));
      const diasConMarca = r ? r.dias.filter((d) => d.marcas.length > 0 && d.habil).length : 0;
      const ausentes = r ? r.dias.filter((d) => d.ausente).length : 0;

      const hoy = centavos(salario / 2);
      const A = centavos(rata * 8 * diasConMarca);
      const B = centavos(rata * 8 * (habiles - ausentes));
      const C = centavos(rata * 8 * habiles);
      suma.hoy += hoy; suma.a += A; suma.b += B; suma.c += C;

      console.log(
        `${String(p.nombre ?? p.empleado_codigo).slice(0, 30).padEnd(30)} ${String(jornada).padStart(3)}h `
        + `${$(hoy).padStart(9)} ${$(A).padStart(12)} ${$(B).padStart(16)} ${$(C).padStart(11)} `
        + `${(A - hoy >= 0 ? "+" : "") + (A - hoy).toFixed(2)}`.padStart(9)
        + `${(B - hoy >= 0 ? "+" : "") + (B - hoy).toFixed(2)}`.padStart(9),
      );
    }
    console.log(
      `${"TOTAL".padEnd(34)} ${$(centavos(suma.hoy)).padStart(9)} ${$(centavos(suma.a)).padStart(12)} `
      + `${$(centavos(suma.b)).padStart(16)} ${$(centavos(suma.c)).padStart(11)}\n`,
    );
  }

  console.log("A = días con marcación (lo literal: «días trabajados»)");
  console.log("B = días hábiles del rango MENOS las ausencias sin justificar (= lo que paga hoy la quincena)");
  console.log("C = días hábiles del rango, sin descontar nada");
}

void main().catch((e) => { console.error(e); process.exitCode = 1; });
