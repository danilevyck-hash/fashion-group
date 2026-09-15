/* SOLO LECTURA. Qué pasó CADA DÍA, por colaborador, según el reloj.
 * Es la evidencia con la que se clasifica cada diferencia contra el Excel de
 * la contadora: quién no marcó, quién llegó tarde y cuántos minutos.
 *   npx tsx scripts/_medir-dias-reloj.ts <salida.json> <desde> <hasta>
 */
import { writeFileSync } from "node:fs";
async function main() {
  const [salida, desde, hasta] = process.argv.slice(2);
  if (!salida || !desde || !hasta) throw new Error("uso: <salida.json> <desde> <hasta>");
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { leerTodoPaginado } = await import("@/lib/supabase-paginado");
  const { armarReporte } = await import("@/lib/asistencia/reporte");
  const { aplicarCorrecciones } = await import("@/lib/asistencia/correcciones");
  const { leerCorrecciones } = await import("@/lib/asistencia/correcciones-server");
  const { leerReglas, leerPersonas, vigenciasDeFilas, leerTrabajaAfuera, leerJustificaciones, leerVacaciones } =
    await import("@/lib/asistencia/config-server");
  const { hoyPanama } = await import("@/lib/fecha-panama");
  const PANAMA = "-05:00";
  const inst = (d: string, fin: boolean) =>
    new Date(Date.parse(`${d}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();
  const marcaciones = await leerTodoPaginado<never>("m", (c, f, t) =>
    supabaseServer.from("asistencia_marcaciones")
      .select("id, empleado_codigo, empleado_nombre, ocurrio_en", c ? { count: "exact" } : {})
      .gte("ocurrio_en", inst(desde, false)).lte("ocurrio_en", inst(hasta, true))
      .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(f, t));
  const [{ reglas }, personasDb, afuera, corr, hRes, jRes, vRes, fRes] = await Promise.all([
    leerReglas(), leerPersonas(), leerTrabajaAfuera(), leerCorrecciones(desde, hasta),
    supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
    leerJustificaciones(desde, hasta), leerVacaciones(desde, hasta),
    supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", desde).lte("fecha", hasta),
  ]);
  const horarios = (hRes.data ?? []).map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  })) as never;
  const nombres = new Map<string, string>();
  for (const f of personasDb.filas) if (f.nombre) nombres.set(String(f.empleado_codigo), f.nombre);
  const ef = aplicarCorrecciones(marcaciones, corr.correcciones);
  const personas = armarReporte({
    marcaciones: ef.marcaciones, horarios, justificaciones: jRes.filas, vacaciones: vRes.filas,
    feriados: new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
    desde, hasta, reglas, nombres, incluirNoHabiles: true, diaEnCurso: hoyPanama(),
    correccionesPorDia: ef.porDia, trabajaAfuera: afuera, vigencias: vigenciasDeFilas(personasDb.filas),
  });
  const empresaDe = new Map(personasDb.filas.map((f) => [String(f.empleado_codigo), f.empresa]));
  const horarioDe = new Map((hRes.data ?? []).map((h) => [String(h.empleado_codigo), h]));
  const out = personas.map((p) => ({
    codigo: p.codigo, nombre: p.nombre, empresa: empresaDe.get(p.codigo) ?? null,
    horarioEntrada: String(horarioDe.get(p.codigo)?.entrada ?? "").slice(0, 8) || null,
    horarioSalida: String(horarioDe.get(p.codigo)?.salida ?? "").slice(0, 8) || null,
    dias: p.dias.map((d) => ({
      fecha: d.fecha, habil: d.habil, feriado: !!d.feriado, ausente: d.ausente,
      marcas: d.marcas.length, horas: d.marcas, entrada: d.entrada, salida: d.salida,
      tardeMin: d.tardeMin, excesoAlmuerzoMin: d.excesoAlmuerzoMin,
      salidaTempranaMin: d.salidaTempranaMin, extraMin: d.extraMin,
      justificado: d.justificado ?? null, vacacion: d.vacacion ? true : false, revisar: d.revisar,
    })),
  }));
  writeFileSync(salida, JSON.stringify(out, null, 1));
  console.log(`${salida}: ${out.length} colaboradores · ${desde} → ${hasta}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
