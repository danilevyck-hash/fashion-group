/* Solo lectura. Las filas del Excel de Asistencia (1–15 sep 2026) con «Todas» y
 * con «Boston», con el MISMO motor de la ruta y el MISMO filtro de la pantalla.
 *   NODE_OPTIONS=--no-deprecation npx tsx --env-file=.env.local scripts/_medir-asistencia-por-empresa.ts */
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { armarReporte, type HorarioPersona } from "@/lib/asistencia/reporte";
import { aplicarCorrecciones, type MarcacionConId } from "@/lib/asistencia/correcciones";
import { leerCorrecciones } from "@/lib/asistencia/correcciones-server";
import { leerReglas, leerPersonas, leerDirectorio, leerJustificaciones, leerVacaciones } from "@/lib/asistencia/config-server";
import { filtrarPorEmpresa, TODAS } from "@/lib/asistencia/empresa-para-todo";
import { EMPRESAS_ASISTENCIA } from "@/lib/asistencia/config";

const desde = "2026-09-01", hasta = "2026-09-15";
const instante = (dia: string, fin: boolean) => new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}-05:00`)).toISOString();
async function main() {
  const marcaciones = await leerTodoPaginado<MarcacionConId>("m", (c, from, to) =>
    supabaseServer.from("asistencia_marcaciones").select("id, empleado_codigo, empleado_nombre, ocurrio_en", c ? { count: "exact" } : {})
      .gte("ocurrio_en", instante(desde, false)).lte("ocurrio_en", instante(hasta, true)).order("ocurrio_en").order("id").range(from, to));
  const [{ reglas }, { directorio }, correcciones, personasDb, hRes, jRes, vRes, fRes] = await Promise.all([
    leerReglas(), leerDirectorio(), leerCorrecciones(desde, hasta), leerPersonas(),
    supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
    leerJustificaciones(desde, hasta), leerVacaciones(desde, hasta),
    supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", desde).lte("fecha", hasta),
  ]);
  const efectivas = aplicarCorrecciones(marcaciones, correcciones.correcciones);
  const personas = armarReporte({
    marcaciones: efectivas.marcaciones,
    horarios: (hRes.data ?? []).map((h) => ({ ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5) })) as HorarioPersona[],
    justificaciones: jRes.filas, vacaciones: vRes.filas,
    feriados: new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
    desde, hasta, reglas, nombres: new Map(directorio.codigos().map((c) => [c, directorio.etiqueta(c)])),
    diaEnCurso: "2026-09-10", correccionesPorDia: efectivas.porDia,
  });
  const empresaDe = new Map(personasDb.filas.map((f) => [String(f.empleado_codigo), f.empresa ?? null]));
  const conEmpresa = personas.map((p) => ({ ...p, empresa: empresaDe.get(p.codigo) ?? null }));
  const todas = filtrarPorEmpresa(conEmpresa, TODAS);
  console.log(`Asistencia ${desde} → ${hasta} · filas con «Todas»: ${todas.length} (igual que hoy: ${personas.length})`);
  let suma = 0;
  for (const e of EMPRESAS_ASISTENCIA) {
    const f = filtrarPorEmpresa(conEmpresa, e); suma += f.length;
    console.log(`  ${e.padEnd(20)} ${String(f.length).padStart(3)} filas · ${f.map((p) => p.codigo).join(",")}`);
  }
  const sinEmpresa = conEmpresa.filter((p) => !p.empresa);
  console.log(`  ${"(sin ficha)".padEnd(20)} ${String(sinEmpresa.length).padStart(3)} filas · ${sinEmpresa.map((p) => p.codigo).join(",")}`);
  console.log(`suma de las 4 + sin ficha = ${suma + sinEmpresa.length} · Todas = ${todas.length} → ${suma + sinEmpresa.length === todas.length ? "cuadra" : "NO CUADRA"}`);
  const boston = filtrarPorEmpresa(conEmpresa, "confecciones_boston");
  console.log(`Boston: ${boston.length} filas, todas con empresa Boston: ${boston.every((p) => p.empresa === "confecciones_boston")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
