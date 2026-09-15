/* Solo lectura. Por colaborador: los minutos de extra que mide el reloj día por
 * día, y cuánto daría redondeando cada día HACIA ARRIBA al cuarto de hora.
 * Sirve para explicar la diferencia de horas extra contra los Excel.
 *   npx tsx scripts/_medir-cuadre-extras.ts <salida.json> <desde> <hasta>
 */
import { writeFileSync } from "node:fs";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { armarReporte, type HorarioPersona } from "@/lib/asistencia/reporte";
import { aplicarCorrecciones, type MarcacionConId } from "@/lib/asistencia/correcciones";
import { leerCorrecciones } from "@/lib/asistencia/correcciones-server";
import {
  leerReglas, leerJustificaciones, leerVacaciones, leerTrabajaAfuera, leerPersonas, vigenciasDeFilas,
} from "@/lib/asistencia/config-server";

const P = "-05:00";
const inst = (d: string, f: boolean) =>
  new Date(Date.parse(`${d}T${f ? "23:59:59.999" : "00:00:00.000"}${P}`)).toISOString();

(async () => {
  const [salida, desde, hasta] = process.argv.slice(2);
  const m = await leerTodoPaginado<MarcacionConId>("m", (c, a, b) =>
    supabaseServer.from("asistencia_marcaciones")
      .select("id, empleado_codigo, empleado_nombre, ocurrio_en", c ? { count: "exact" } : {})
      .gte("ocurrio_en", inst(desde, false)).lte("ocurrio_en", inst(hasta, true))
      .order("ocurrio_en").order("id").range(a, b));
  const [{ reglas }, corr, j, v, af, h, fe, per] = await Promise.all([
    leerReglas(), leerCorrecciones(desde, hasta), leerJustificaciones(desde, hasta),
    leerVacaciones(desde, hasta), leerTrabajaAfuera(),
    supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
    supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", desde).lte("fecha", hasta),
    leerPersonas(),
  ]);
  const horarios = (h.data ?? []).map((x) => ({
    ...x, entrada: String(x.entrada).slice(0, 5), salida: String(x.salida).slice(0, 5),
  })) as HorarioPersona[];
  const ef = aplicarCorrecciones(m, corr.correcciones);
  const personas = armarReporte({
    marcaciones: ef.marcaciones, horarios, justificaciones: j.filas, vacaciones: v.filas,
    feriados: new Map((fe.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
    desde, hasta, reglas, nombres: new Map(), incluirNoHabiles: true, diaEnCurso: "2026-09-15",
    correccionesPorDia: ef.porDia, trabajaAfuera: af, vigencias: vigenciasDeFilas(per.filas),
  });
  const out = personas.map((p) => {
    let exacto = 0; let alCuarto = 0; let diasConExtra = 0;
    const dias: { fecha: string; extraMin: number; tardeMin: number; salidaTempranaMin: number }[] = [];
    for (const d of p.dias) {
      const e = d.extraMin ?? 0;
      if (e > 0) { exacto += e; alCuarto += Math.ceil(e / 15) * 15; diasConExtra += 1; }
      if (e > 0 || d.tardeMin || d.salidaTempranaMin) {
        dias.push({ fecha: d.fecha, extraMin: e, tardeMin: d.tardeMin ?? 0, salidaTempranaMin: d.salidaTempranaMin ?? 0 });
      }
    }
    return { codigo: p.codigo, exactoMin: exacto, alCuartoMin: alCuarto, diasConExtra, resumen: p.resumen, dias };
  });
  writeFileSync(salida, JSON.stringify({ desde, hasta, personas: out }, null, 1));
  console.log(`${salida}: ${out.length} colaboradores`);
})().catch((e) => { console.error(e); process.exit(1); });
