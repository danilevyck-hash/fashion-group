/* Solo lectura: los días de una persona en un rango, con extra/tardanza/salida temprana. */
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { armarReporte, type HorarioPersona } from "@/lib/asistencia/reporte";
import { aplicarCorrecciones, type MarcacionConId } from "@/lib/asistencia/correcciones";
import { leerCorrecciones } from "@/lib/asistencia/correcciones-server";
import { leerReglas, leerJustificaciones, leerVacaciones, leerTrabajaAfuera } from "@/lib/asistencia/config-server";
const P = "-05:00";
const inst = (d: string, f: boolean) => new Date(Date.parse(`${d}T${f ? "23:59:59.999" : "00:00:00.000"}${P}`)).toISOString();
(async () => {
  const [desde, hasta, ...cods] = process.argv.slice(2);
  const m = await leerTodoPaginado<MarcacionConId>("m", (c, a, b) =>
    supabaseServer.from("asistencia_marcaciones").select("id, empleado_codigo, empleado_nombre, ocurrio_en", c ? { count: "exact" } : {})
      .gte("ocurrio_en", inst(desde, false)).lte("ocurrio_en", inst(hasta, true)).order("ocurrio_en").order("id").range(a, b));
  const [{ reglas }, corr, j, v, af, h, fe] = await Promise.all([
    leerReglas(), leerCorrecciones(desde, hasta), leerJustificaciones(desde, hasta), leerVacaciones(desde, hasta), leerTrabajaAfuera(),
    supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
    supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", desde).lte("fecha", hasta),
  ]);
  const horarios = (h.data ?? []).map((x) => ({ ...x, entrada: String(x.entrada).slice(0, 5), salida: String(x.salida).slice(0, 5) })) as HorarioPersona[];
  const ef = aplicarCorrecciones(m, corr.correcciones);
  const per = armarReporte({
    marcaciones: ef.marcaciones, horarios, justificaciones: j.filas, vacaciones: v.filas,
    feriados: new Map((fe.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
    desde, hasta, reglas, nombres: new Map(), incluirNoHabiles: true, diaEnCurso: "2026-09-14",
    correccionesPorDia: ef.porDia, trabajaAfuera: af,
  });
  for (const p of per) {
    if (cods.length && !cods.includes(p.codigo)) continue;
    const ho = horarios.find((x) => x.empleado_codigo === p.codigo);
    console.log(`\n### ${p.codigo} ${p.nombre ?? ""}  horario ${ho?.entrada}-${ho?.salida} alm${ho?.almuerzo_minutos}  resumen ${JSON.stringify(p.resumen)}`);
    for (const d of p.dias) {
      const j: string[] = [];
      if (d.extraMin) j.push(`extra ${d.extraMin.toFixed(2)}`);
      if (d.tardeMin) j.push(`tard ${d.tardeMin.toFixed(2)}`);
      if (d.salidaTempranaMin) j.push(`salTemp ${d.salidaTempranaMin.toFixed(2)}`);
      if (d.ausente) j.push("AUSENTE");
      if (d.justificado) j.push("just:" + d.justificado);
      if (d.vacacion) j.push("VACACION");
      if (d.enCurso) j.push("enCurso");
      
      console.log(`  ${d.fecha} ${(d.marcas ?? []).join(" ").padEnd(30)}  ${j.join(" · ")}`);
    }
  }
})();
