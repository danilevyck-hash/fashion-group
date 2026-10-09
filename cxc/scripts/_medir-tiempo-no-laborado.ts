/* Solo lectura. «Tiempo no laborado» (9-oct-2026) sobre la planilla ABIERTA de
 * cada empresa: qué días cambian y cuánto, por colaborador, con el interruptor
 * prendido contra apagado. No escribe nada en la base.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_medir-tiempo-no-laborado.ts
 */
async function main() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { leerTodoPaginado } = await import("@/lib/supabase-paginado");
  const { armarReporte } = await import("@/lib/asistencia/reporte");
  const { aplicarCorrecciones } = await import("@/lib/asistencia/correcciones");
  const { leerCorrecciones } = await import("@/lib/asistencia/correcciones-server");
  const cs = await import("@/lib/asistencia/config-server");
  const { leerHorarios } = await import("@/lib/asistencia/horarios-server");
  const { leerFeriados } = await import("@/lib/asistencia/feriados-server");
  const { leerEntradasAutorizadas } = await import("@/lib/asistencia/entrada-autorizada-server");
  const { indexarEntradasAutorizadas } = await import("@/lib/asistencia/entrada-autorizada");
  const { resolverDiasLaborables } = await import("@/lib/asistencia/horario-configurable");
  const { armarLinea, medirHoras, jornadaDiariaMin, MANUALES_CERO } = await import("@/lib/asistencia/planilla");
  type MarcacionConId = import("@/lib/asistencia/correcciones").MarcacionConId;
  type FichaPlanilla = import("@/lib/asistencia/planilla").FichaPlanilla;

  const HOY = "2026-10-09";
  const QUINCENAS = [{ desde: "2026-09-16", hasta: "2026-09-30" }, { desde: "2026-10-01", hasta: "2026-10-15" }];

  const { data: cab, error } = await supabaseServer.from("asistencia_planilla_guardada")
    .select("empresa, desde, hasta, estado").eq("estado", "cerrada");
  if (error) throw new Error(error.message);
  const cerrada = (e: string, q: { desde: string; hasta: string }) =>
    (cab ?? []).some((c) => c.empresa === e && c.desde === q.desde && c.hasta === q.hasta);

  const inst = (d: string, fin: boolean) => new Date(Date.parse(`${d}T${fin ? "23:59:59.999" : "00:00:00.000"}-05:00`)).toISOString();
  const [personasDb, { reglas }, afuera, hor, compensan] = await Promise.all([
    cs.leerPersonas(), cs.leerReglas(), cs.leerTrabajaAfuera(), leerHorarios(), cs.leerReponeTardanza(),
  ]);
  const empresaDe = new Map(personasDb.filas.map((f) => [String(f.empleado_codigo), f.empresa ?? null]));
  const empresas = [...new Set(personasDb.filas.map((f) => f.empresa).filter(Boolean))] as string[];
  const fichas = new Map<string, FichaPlanilla>();
  for (const f of personasDb.filas) {
    fichas.set(String(f.empleado_codigo), {
      codigo: String(f.empleado_codigo), nombre: f.nombre ?? null,
      salarioMensual: f.salario_mensual === null ? null : Number(f.salario_mensual),
      jornadaSemanal: f.jornada_semanal ?? null, empresa: f.empresa ?? null,
      cobraHorasExtra: cs.cobraHorasExtraDeFila(f), servicioProfesional: cs.servicioProfesionalDeFila(f),
    });
  }
  const horarioDe = new Map(hor.horarios.map((h) => [h.empleado_codigo, h]));
  const diasLaborables = resolverDiasLaborables({ horarios: hor.horarios, empresaDe, faltaMigracion: hor.faltaMigracion });
  const vigencias = cs.vigenciasDeFilas(personasDb.filas);

  for (const q of QUINCENAS) {
    const abiertas = empresas.filter((e) => !cerrada(e, q));
    if (!abiertas.length) { console.log(`${q.desde}..${q.hasta}: cerrada en todas las empresas`); continue; }
    const marcaciones = await leerTodoPaginado<MarcacionConId>("asistencia_marcaciones (tnl)", (c, from, to) =>
      supabaseServer.from("asistencia_marcaciones")
        .select("id, empleado_codigo, empleado_nombre, ocurrio_en, dispositivo", c ? { count: "exact" } : {})
        .gte("ocurrio_en", inst(q.desde, false)).lte("ocurrio_en", inst(q.hasta, true))
        .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to));
    const [correcciones, jRes, vRes, fRes, entRes] = await Promise.all([
      leerCorrecciones(q.desde, q.hasta), cs.leerJustificaciones(q.desde, q.hasta), cs.leerVacaciones(q.desde, q.hasta),
      leerFeriados(q.desde, q.hasta), leerEntradasAutorizadas(q.desde, q.hasta),
    ]);
    const efectivas = aplicarCorrecciones(marcaciones, correcciones.correcciones);
    const base = {
      marcaciones: efectivas.marcaciones, horarios: hor.horarios, justificaciones: jRes.filas, vacaciones: vRes.filas,
      feriados: fRes.feriados, diasLibres: fRes.diasLibres, desde: q.desde, hasta: q.hasta, reglas,
      incluirNoHabiles: true, diaEnCurso: HOY, trabajaAfuera: afuera, vigencias,
      entradasAutorizadas: indexarEntradasAutorizadas(entRes.entradas), reponeTardanza: compensan, diasLaborables,
    };
    const off = armarReporte({ ...base, descuentaTiempoFuera: false });
    const on = armarReporte({ ...base, descuentaTiempoFuera: true });
    console.log(`\n=== ${q.desde}..${q.hasta} · abierta en: ${abiertas.join(", ")}`);
    let tot = 0, dias = 0;
    for (const p of on) {
      const emp = empresaDe.get(p.codigo);
      if (!emp || !abiertas.includes(emp)) continue;
      const cambian = p.dias.filter((d) => (d.descuentaFueraMin ?? 0) > 0);
      if (!cambian.length) continue;
      const f = fichas.get(p.codigo);
      const jor = jornadaDiariaMin(horarioDe.get(p.codigo));
      const pOff = off.find((x) => x.codigo === p.codigo)!;
      const dOn = f ? armarLinea(f, medirHoras(p, reglas, jor), MANUALES_CERO, reglas).dinero : null;
      const dOff = f ? armarLinea(f, medirHoras(pOff, reglas, jor), MANUALES_CERO, reglas).dinero : null;
      const vm = dOn?.valorMinuto ?? 0;
      const detalle = cambian.map((d) => `${d.fecha.slice(5)} ${d.marcas.join("·")} → ${Math.round(d.descuentaFueraMin! * 100) / 100} min ($${(Math.round(d.descuentaFueraMin! * vm * 100) / 100).toFixed(2)})`);
      const tnl = dOn?.tiempoNoLaborado ?? 0;
      const netoDelta = dOn && dOff ? Math.round((dOff.netoPagar - dOn.netoPagar) * 100) / 100 : null;
      tot += tnl; dias += cambian.length;
      console.log(`[${emp}] ${p.codigo} ${f?.nombre ?? p.nombre ?? ""}: ${cambian.length} día(s), Tiempo no laborado $${tnl.toFixed(2)}, neto baja $${netoDelta ?? "?"}${dOn ? "" : " (sin sueldo en la ficha)"}`);
      for (const l of detalle) console.log(`     ${l}`);
    }
    console.log(`TOTAL ${q.desde}..${q.hasta}: ${dias} días · $${tot.toFixed(2)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
