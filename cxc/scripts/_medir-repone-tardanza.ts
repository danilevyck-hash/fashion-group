/* Solo lectura. «Compensación de tardanza» (9-oct-2026) contra un mes real.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_medir-repone-tardanza.ts 2026-09-01 2026-09-30 [--fixture]
 *
 * 1. CONTROL: con la casilla apagada para todos, el motor nuevo da EXACTAMENTE
 *    lo mismo que el de `origin/main` (copiado a `reporte.main.tmp.ts` antes de
 *    correr; ver abajo), día por día y centavo por centavo.
 * 2. SIMULACIÓN (informativa): prendida a TODOS, cuántos días cambian y cuánta
 *    plata: descuentos por tardanza que desaparecen y extras que dejan de
 *    pagarse (medidas, y de esas las ya aprobadas).
 * 3. `--fixture`: escribe las marcas del mes (código + instante, sin nombres ni
 *    sueldos) y lo que da HOY el motor de `origin/main`, para el candado
 *    `asistencia-repone-tardanza-mes-real.test.ts`.
 *
 * Antes de correrlo:
 *   git show origin/main:cxc/src/lib/asistencia/reporte.ts > src/lib/asistencia/reporte.main.tmp.ts
 * y bórralo después. No escribe nada en la base.
 */
import { writeFileSync } from "node:fs";

async function main() {
  const [desde, hasta] = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  if (!desde || !hasta) throw new Error("uso: <desde> <hasta>");
  const conFixture = process.argv.includes("--fixture");

  const { supabaseServer } = await import("@/lib/supabase-server");
  const { leerTodoPaginado } = await import("@/lib/supabase-paginado");
  const nuevo = await import("@/lib/asistencia/reporte");
  const viejo = await import("@/lib/asistencia/reporte.main.tmp" as string) as typeof nuevo;
  const { aplicarCorrecciones } = await import("@/lib/asistencia/correcciones");
  const { leerCorrecciones } = await import("@/lib/asistencia/correcciones-server");
  const cs = await import("@/lib/asistencia/config-server");
  const { leerHorarios } = await import("@/lib/asistencia/horarios-server");
  const { leerFeriados } = await import("@/lib/asistencia/feriados-server");
  const { leerEntradasAutorizadas } = await import("@/lib/asistencia/entrada-autorizada-server");
  const { indexarEntradasAutorizadas } = await import("@/lib/asistencia/entrada-autorizada");
  const { resolverDiasLaborables } = await import("@/lib/asistencia/horario-configurable");
  const { leerAprobaciones } = await import("@/lib/asistencia/aprobaciones-server");
  const { indexarAprobaciones, estaAprobado } = await import("@/lib/asistencia/aprobaciones");
  const { armarLinea, medirHoras, jornadaDiariaMin, MANUALES_CERO } = await import("@/lib/asistencia/planilla");
  type MarcacionConId = import("@/lib/asistencia/correcciones").MarcacionConId;
  type FichaPlanilla = import("@/lib/asistencia/planilla").FichaPlanilla;

  const inst = (d: string, fin: boolean) => new Date(Date.parse(`${d}T${fin ? "23:59:59.999" : "00:00:00.000"}-05:00`)).toISOString();
  const marcaciones = await leerTodoPaginado<MarcacionConId>("asistencia_marcaciones (repone)", (c, from, to) =>
    supabaseServer.from("asistencia_marcaciones")
      .select("id, empleado_codigo, empleado_nombre, ocurrio_en, dispositivo", c ? { count: "exact" } : {})
      .gte("ocurrio_en", inst(desde, false)).lte("ocurrio_en", inst(hasta, true))
      .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to));
  const [{ reglas }, personasDb, afuera, correcciones, hor, jRes, vRes, fRes, entRes, aprRes] = await Promise.all([
    cs.leerReglas(), cs.leerPersonas(), cs.leerTrabajaAfuera(), leerCorrecciones(desde, hasta), leerHorarios(),
    cs.leerJustificaciones(desde, hasta), cs.leerVacaciones(desde, hasta), leerFeriados(desde, hasta),
    leerEntradasAutorizadas(desde, hasta), leerAprobaciones(desde, hasta),
  ]);
  const efectivas = aplicarCorrecciones(marcaciones, correcciones.correcciones);
  const empresaDe = new Map(personasDb.filas.map((f) => [String(f.empleado_codigo), f.empresa ?? null]));
  const diasLaborables = resolverDiasLaborables({ horarios: hor.horarios, empresaDe, faltaMigracion: hor.faltaMigracion });
  const vigencias = cs.vigenciasDeFilas(personasDb.filas);
  const codigos = new Set(efectivas.marcaciones.map((m) => String(m.empleado_codigo ?? "").trim()).filter(Boolean));

  const base = {
    marcaciones: efectivas.marcaciones, horarios: hor.horarios, justificaciones: jRes.filas, vacaciones: vRes.filas,
    feriados: fRes.feriados, diasLibres: fRes.diasLibres, desde, hasta, reglas, incluirNoHabiles: true,
    diaEnCurso: null, trabajaAfuera: afuera, vigencias,
    entradasAutorizadas: indexarEntradasAutorizadas(entRes.entradas), diasLaborables,
  };
  const hoy = viejo.armarReporte(base);
  const apagada = nuevo.armarReporte({ ...base, reponeTardanza: new Set() });
  const prendida = nuevo.armarReporte({ ...base, reponeTardanza: codigos });

  // ── 1. CONTROL ─────────────────────────────────────────────────────────────
  const iguales = JSON.stringify(hoy) === JSON.stringify(apagada);
  console.log(`CONTROL apagada vs origin/main: ${iguales ? "IDÉNTICO" : "DISTINTO"} (${hoy.length} colaboradores, ${efectivas.marcaciones.length} marcas)`);

  // ── 2. SIMULACIÓN ──────────────────────────────────────────────────────────
  const fichas = new Map<string, FichaPlanilla>();
  for (const f of personasDb.filas) {
    fichas.set(String(f.empleado_codigo), {
      codigo: String(f.empleado_codigo), nombre: f.nombre ?? null,
      salarioMensual: f.salario_mensual === null ? null : Number(f.salario_mensual),
      jornadaSemanal: f.jornada_semanal ?? null, empresa: f.empresa ?? null,
      cobraHorasExtra: cs.cobraHorasExtraDeFila(f), servicioProfesional: cs.servicioProfesionalDeFila(f),
    });
  }
  const aprob = indexarAprobaciones(aprRes.filas);
  const horarioDe = new Map(hor.horarios.map((h) => [h.empleado_codigo, h]));
  const dinero = (p: (typeof hoy)[number], soloAprobadas: boolean) => {
    const f = fichas.get(p.codigo);
    if (!f || !f.salarioMensual) return null;
    const claves = new Set([...aprob].filter(([, a]) => estaAprobado(a)).map(([k]) => k));
    const h = medirHoras(p, reglas, jornadaDiariaMin(horarioDe.get(p.codigo)),
      soloAprobadas ? { exigir: true, claves, codigo: p.codigo } : undefined);
    const d = armarLinea(f, h, MANUALES_CERO, reglas).dinero;
    return d ? { tard: d.tardanzas + d.ausenciaPorTardanza, extra: d.extraDiurno + d.extraNocturno } : null;
  };
  let diasCambian = 0, personasCambian = 0, minTard = 0, minExtra = 0;
  let tard$ = 0, extra$ = 0, extraAprob$ = 0;
  const porPersona: string[] = [];
  for (const p of apagada) {
    const q = prendida.find((x) => x.codigo === p.codigo)!;
    let n = 0;
    p.dias.forEach((d, i) => {
      const e = q.dias[i];
      if (d.tardeMin !== e.tardeMin || d.extraMin !== e.extraMin) {
        n++; minTard += d.tardeMin - e.tardeMin; minExtra += d.extraMin - e.extraMin;
      }
    });
    if (!n) continue;
    diasCambian += n; personasCambian++;
    const a = dinero(p, false), b = dinero(q, false), aa = dinero(p, true), bb = dinero(q, true);
    if (a && b) { tard$ += a.tard - b.tard; extra$ += a.extra - b.extra; }
    if (aa && bb) extraAprob$ += aa.extra - bb.extra;
    porPersona.push(`  ${p.codigo} ${fichas.get(p.codigo)?.nombre ?? ""}: ${n} días · tardanza −$${a && b ? (a.tard - b.tard).toFixed(2) : "?"} · extra −$${a && b ? (a.extra - b.extra).toFixed(2) : "?"}`);
  }
  console.log(`SIMULACIÓN ${desde}..${hasta}, prendida a TODOS:`);
  console.log(`  días que cambian: ${diasCambian} (${personasCambian} colaboradores)`);
  console.log(`  minutos de tardanza que desaparecen: ${minTard.toFixed(1)} · minutos de extra que dejan de contarse: ${minExtra.toFixed(1)}`);
  console.log(`  descuentos que desaparecen: $${tard$.toFixed(2)} · extras que dejan de pagarse (medidas): $${extra$.toFixed(2)} · de esas, ya aprobadas: $${extraAprob$.toFixed(2)}`);
  console.log(`  efecto neto para la empresa: ${(extra$ - tard$) >= 0 ? "ahorra" : "paga"} $${Math.abs(extra$ - tard$).toFixed(2)} (con extras medidas)`);
  console.log(porPersona.join("\n"));

  // ── 3. FIXTURE ─────────────────────────────────────────────────────────────
  if (conFixture) {
    const sin = { ...base, justificaciones: [], vacaciones: [], trabajaAfuera: new Set<string>(), vigencias: new Map(), entradasAutorizadas: new Map(), diasLibres: new Map() };
    const esperado = viejo.armarReporte({ ...sin, marcaciones: sin.marcaciones.map((m) => ({ empleado_codigo: m.empleado_codigo, empleado_nombre: null, ocurrio_en: m.ocurrio_en, dispositivo: m.dispositivo ?? null })) });
    writeFileSync("src/__tests__/fixtures/asistencia-mes-real-2026-09.json", JSON.stringify({
      desde, hasta, reglas,
      horarios: hor.horarios.map(({ empleado_nombre: _n, ...h }) => h),
      feriados: [...fRes.feriados],
      diasLaborables: [...diasLaborables],
      marcaciones: sin.marcaciones.map((m) => [m.empleado_codigo, m.ocurrio_en, m.dispositivo ?? null]),
      // Lo que da HOY (origin/main), por persona y día: [fecha, tardeMin, extraMin, salidaTempranaMin, excesoAlmuerzoMin, trabajadoMin].
      esperado: esperado.map((p) => [p.codigo, p.dias.map((d) => [d.fecha, d.tardeMin, d.extraMin, d.salidaTempranaMin, d.excesoAlmuerzoMin, d.trabajadoMin])]),
      // Y la PLATA de hoy con una ficha de prueba igual para todos ($600 / 48 h; los sueldos reales no viajan):
      // [tardanzas, ausencias, extraDiurno, extraNocturno, salidaTemprana, netoPagar].
      dineroEsperado: esperado.map((p) => {
        const d = armarLinea({ codigo: p.codigo, nombre: null, salarioMensual: 600, jornadaSemanal: 48, empresa: "boston" },
          medirHoras(p, reglas, jornadaDiariaMin(horarioDe.get(p.codigo))), MANUALES_CERO, reglas).dinero!;
        return [p.codigo, [d.tardanzas, d.ausencias, d.extraDiurno, d.extraNocturno, d.salidaTemprana, d.netoPagar]];
      }),
    }));
    console.log("fixture escrito");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
